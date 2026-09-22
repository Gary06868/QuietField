# Runs with Windows PowerShell 5.1. Keep this helper outside the directory it replaces.
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][ValidateSet('Prepare', 'Apply', 'Launch')][string]$Mode,
    [Parameter(Mandatory = $true)][string]$ConfigPath
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$script:cfg = $null
$script:pathsValidated = $false
$script:swapStarted = $false
$script:oldExited = $false
$script:launched = $null
$script:exeName = ([string][char]0x9759) + ([string][char]0x91ce) + '.exe'
$script:rootName = 'QuietField-win32-x64'
$script:comparison = [StringComparison]::OrdinalIgnoreCase
$script:utf8 = New-Object Text.UTF8Encoding($false)
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Fail([string]$Code) { throw $Code }
function Full-Path([string]$Value) {
    if ([string]::IsNullOrWhiteSpace($Value) -or $Value -notmatch '^[A-Za-z]:[\\/]') { Fail 'UNSAFE_PATH' }
    $p = [IO.Path]::GetFullPath($Value).TrimEnd([char[]]'\/')
    if ($p.Length -le 2 -or $p.StartsWith('\\')) { Fail 'UNSAFE_PATH' }
    foreach ($part in $p.Substring(3).Split([char[]]'\/')) {
        if (!$part -or $part -in @('.', '..') -or $part -match '[<>:"|?*\x00-\x1f]' -or $part -match '[ .]$') { Fail 'UNSAFE_PATH' }
    }
    return $p
}
function Same-Path([string]$A, [string]$B) { return $A.Equals($B, $script:comparison) }
function Inside([string]$Path, [string]$Parent) { return $Path.StartsWith($Parent.TrimEnd('\') + '\', $script:comparison) }
function No-Reparse([string]$Path) {
    $cursor = $Path
    while ($cursor) {
        if (Test-Path -LiteralPath $cursor) {
            $item = Get-Item -LiteralPath $cursor -Force
            if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { Fail 'REPARSE_PATH' }
        }
        $parent = [IO.Path]::GetDirectoryName($cursor)
        if (!$parent -or $parent -eq $cursor) { break }
        $cursor = $parent
    }
}
function Read-Json([string]$Path) {
    No-Reparse $Path
    if (!(Test-Path -LiteralPath $Path -PathType Leaf)) { Fail 'MISSING_METADATA' }
    if ((Get-Item -LiteralPath $Path).Length -gt 16MB) { Fail 'METADATA_TOO_LARGE' }
    return [IO.File]::ReadAllText($Path, [Text.Encoding]::UTF8) | ConvertFrom-Json
}
function Has-Property($Value, [string]$Name) { return $null -ne $Value.PSObject.Properties[$Name] }
function Write-Json([string]$Path, $Value) {
    if (!(Inside $Path $script:cfg.jobDir)) { Fail 'UNSAFE_MARKER' }
    No-Reparse $Path
    $temp = $Path + '.' + [guid]::NewGuid().ToString('D') + '.tmp'
    [IO.File]::WriteAllText($temp, ($Value | ConvertTo-Json -Depth 8 -Compress), $script:utf8)
    if (Test-Path -LiteralPath $Path) { [IO.File]::Replace($temp, $Path, $null) }
    else { [IO.File]::Move($temp, $Path) }
}
function Check-Config {
    $script:configAbsolute = Full-Path $ConfigPath
    $script:cfg = Read-Json $script:configAbsolute
    foreach ($key in @('zipPath','stageDir','targetDir','backupDir','jobDir','readyPath','ackPath','resultPath')) {
        if (!(Has-Property $script:cfg $key) -or $script:cfg.$key -isnot [string]) { Fail 'INVALID_CONFIG' }
        $script:cfg.$key = Full-Path $script:cfg.$key
        No-Reparse $script:cfg.$key
    }
    foreach ($key in @('version','currentVersion','sha256','ticket','pid')) {
        if (!(Has-Property $script:cfg $key)) { Fail 'INVALID_CONFIG' }
    }
    if ($script:cfg.version -notmatch '^\d+\.\d+\.\d+$' -or $script:cfg.currentVersion -notmatch '^\d+\.\d+\.\d+$') { Fail 'INVALID_VERSION' }
    if ([version]$script:cfg.version -le [version]$script:cfg.currentVersion) { Fail 'VERSION_NOT_NEWER' }
    if ($script:cfg.sha256 -notmatch '^[a-fA-F0-9]{64}$' -or $script:cfg.ticket -notmatch '^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$') { Fail 'INVALID_CONFIG' }
    if ([string]$script:cfg.pid -notmatch '^\d+$' -or [long]$script:cfg.pid -le 0 -or [long]$script:cfg.pid -gt [int]::MaxValue -or [int]$script:cfg.pid -eq $PID) { Fail 'INVALID_PID' }
    $target = $script:cfg.targetDir
    if (!(Test-Path -LiteralPath $target -PathType Container) -or !(Test-Path -LiteralPath $script:cfg.jobDir -PathType Container)) { Fail 'MISSING_DIRECTORY' }
    $forbidden = @($env:USERPROFILE, $env:WINDIR, $env:ProgramFiles, ${env:ProgramFiles(x86)}, $env:ProgramData, $env:APPDATA, $env:LOCALAPPDATA)
    foreach ($kind in @('Desktop','MyDocuments','UserProfile','Windows','System','CommonApplicationData','ApplicationData','LocalApplicationData')) {
        $forbidden += [Environment]::GetFolderPath([Environment+SpecialFolder]$kind)
    }
    if ($env:USERPROFILE) { $forbidden += (Join-Path $env:USERPROFILE 'Downloads') }
    $forbidden += [IO.Path]::GetTempPath()
    try {
        $downloadId = '{374DE290-123F-4565-9164-39C4925E467B}'
        $shellFolders = Get-ItemProperty -LiteralPath 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders' -Name $downloadId -ErrorAction Stop
        $forbidden += [Environment]::ExpandEnvironmentVariables([string]$shellFolders.PSObject.Properties[$downloadId].Value)
    } catch { }
    foreach ($path in $forbidden) { if ($path -and (Same-Path $target ([IO.Path]::GetFullPath($path).TrimEnd('\')))) { Fail 'PROTECTED_TARGET' } }
    foreach ($name in @('stageDir','backupDir')) {
        if (!(Same-Path ([IO.Path]::GetDirectoryName($script:cfg.$name)) ([IO.Path]::GetDirectoryName($target)))) { Fail 'UNSAFE_SIBLING' }
        if (Same-Path $script:cfg.$name $target) { Fail 'UNSAFE_SIBLING' }
    }
    $uuid = '[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}'
    if ([IO.Path]::GetFileName($script:cfg.stageDir) -notmatch ('^\.quiet-field-stage-' + $uuid + '$')) { Fail 'UNSAFE_STAGE' }
    if ([IO.Path]::GetFileName($script:cfg.backupDir) -notmatch ('^\.quiet-field-backup-' + [regex]::Escape($script:cfg.currentVersion) + '-' + $uuid + '$')) { Fail 'UNSAFE_BACKUP' }
    if (Test-Path -LiteralPath $script:cfg.backupDir) { Fail 'BACKUP_EXISTS' }
    if ((Inside $script:cfg.jobDir $target) -or (Same-Path $script:cfg.jobDir $target) -or (Inside $script:cfg.jobDir $script:cfg.stageDir)) { Fail 'UNSAFE_JOB' }
    $markers = @($script:configAbsolute, $script:cfg.zipPath, $script:cfg.readyPath, $script:cfg.ackPath, $script:cfg.resultPath)
    $seen = New-Object 'Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
    foreach ($path in $markers) {
        if (!(Inside $path $script:cfg.jobDir) -or !(Same-Path ([IO.Path]::GetDirectoryName($path)) $script:cfg.jobDir) -or !$seen.Add($path)) { Fail 'UNSAFE_MARKER' }
    }
    $script:pathsValidated = $true
    $script:stageApp = Join-Path $script:cfg.stageDir $script:rootName
}
function Require-File([string]$Path) {
    No-Reparse $Path
    if (!(Test-Path -LiteralPath $Path -PathType Leaf) -or (Get-Item -LiteralPath $Path).Length -le 0) { Fail 'INCOMPLETE_PACKAGE' }
}
function Check-Package([string]$AppDir, [string]$Version, [bool]$Complete) {
    No-Reparse $AppDir
    $app = Join-Path $AppDir 'resources\app'
    $pkg = Read-Json (Join-Path $app 'package.json')
    $edition = Read-Json (Join-Path $app 'dist\edition.json')
    if (!(Has-Property $pkg 'name') -or $pkg.name -cne 'quiet-field' -or !(Has-Property $pkg 'version') -or $pkg.version -cne $Version) { Fail 'PACKAGE_IDENTITY_MISMATCH' }
    if (!(Has-Property $edition 'edition') -or $edition.edition -cne 'public') { Fail 'WRONG_EDITION' }
    Require-File (Join-Path $AppDir $script:exeName)
    if (!$Complete) { return }
    foreach ($file in @('ffmpeg.dll','d3dcompiler_47.dll','resources.pak','icudtl.dat','v8_context_snapshot.bin','snapshot_blob.bin','chrome_100_percent.pak','chrome_200_percent.pak','locales\en-US.pak','resources\app\electron.cjs','resources\app\preload.cjs','resources\app\dist\index.html')) { Require-File (Join-Path $AppDir $file) }
    $dist = Join-Path $app 'dist'
    $catalog = Read-Json (Join-Path $dist 'catalog.json')
    $catalog = @($catalog)
    if ($catalog.Count -eq 0) { Fail 'EMPTY_CATALOG' }
    foreach ($sound in $catalog) {
        if ((Has-Property $sound 'generated') -and $sound.generated -is [bool] -and $sound.generated) { continue }
        if (!(Has-Property $sound 'path') -or $sound.path -isnot [string] -or !$sound.path) { Fail 'INVALID_CATALOG_PATH' }
        $relative = $sound.path.Replace('\','/')
        if ($relative.StartsWith('./')) { $relative = $relative.Substring(2) }
        $safe = Safe-Relative $relative
        $soundPath = [IO.Path]::GetFullPath((Join-Path $dist $safe))
        if (!(Inside $soundPath $dist)) { Fail 'INVALID_CATALOG_PATH' }
        Require-File $soundPath
    }
}
function Safe-Relative([string]$Name) {
    $normalized = $Name.Replace('\', '/')
    if (!$normalized -or $normalized.StartsWith('/') -or $normalized.Contains(':') -or $normalized.Contains([char]0)) { Fail 'UNSAFE_ZIP_PATH' }
    $trimmed = $normalized.TrimEnd('/')
    if (!$trimmed) { Fail 'UNSAFE_ZIP_PATH' }
    foreach ($segment in $trimmed.Split('/')) {
        if (!$segment -or $segment -in @('.', '..') -or $segment -match '[<>:"|?*\x00-\x1f]' -or $segment -match '[ .]$' -or $segment -match '^(?i:CON|PRN|AUX|NUL|CONIN\$|CONOUT\$|CLOCK\$|COM[1-9¹²³]|LPT[1-9¹²³])[ ]*(?:\.|$)') { Fail 'UNSAFE_ZIP_PATH' }
    }
    return $trimmed.Replace('/', '\')
}
function Check-Archive([IO.Compression.ZipArchive]$Archive) {
    if ($Archive.Entries.Count -gt 10000 -or $Archive.Entries.Count -eq 0) { Fail 'ZIP_ENTRY_LIMIT' }
    $seen = New-Object 'Collections.Generic.Dictionary[string,string]' ([StringComparer]::OrdinalIgnoreCase)
    $spellings = New-Object 'Collections.Generic.Dictionary[string,string]' ([StringComparer]::OrdinalIgnoreCase)
    $entries = New-Object Collections.Generic.List[object]
    [long]$expanded = 0
    foreach ($entry in $Archive.Entries) {
        $relative = Safe-Relative $entry.FullName
        $parts = $relative.Split('\')
        if ($parts[0] -cne $script:rootName) { Fail 'WRONG_ZIP_ROOT' }
        $isDir = $entry.FullName.EndsWith('/') -or $entry.FullName.EndsWith('\')
        if ($parts.Count -eq 1 -and !$isDir) { Fail 'WRONG_ZIP_ROOT' }
        $attributes = [long]$entry.ExternalAttributes
        if (($attributes -band 0x400) -ne 0 -or ((($attributes -shr 16) -band 0xF000) -eq 0xA000)) { Fail 'ZIP_LINK_ENTRY' }
        $unixType = ($attributes -shr 16) -band 0xF000
        if ($unixType -ne 0 -and $unixType -ne 0x8000 -and $unixType -ne 0x4000) { Fail 'ZIP_SPECIAL_ENTRY' }
        if (($isDir -and $entry.Length -ne 0) -or (!$isDir -and $unixType -eq 0x4000)) { Fail 'INVALID_ZIP_ENTRY' }
        if ($seen.ContainsKey($relative)) { Fail 'ZIP_NAME_COLLISION' }
        $seen.Add($relative, $(if ($isDir) { 'directory' } else { 'file' }))
        $node = $relative
        while ($node) {
            if ($spellings.ContainsKey($node)) {
                if ($spellings[$node] -cne $node) { Fail 'ZIP_NAME_COLLISION' }
            } else { $spellings.Add($node, $node) }
            $node = [IO.Path]::GetDirectoryName($node)
        }
        $expanded += $entry.Length
        if ($expanded -gt 12GB -or $entry.Length -lt 0) { Fail 'ZIP_SIZE_LIMIT' }
        $destination = [IO.Path]::GetFullPath((Join-Path $script:cfg.stageDir $relative))
        if (!(Inside $destination $script:cfg.stageDir)) { Fail 'UNSAFE_ZIP_PATH' }
        $entries.Add([pscustomobject]@{ Entry = $entry; Relative = $relative; Destination = $destination; IsDirectory = $isDir })
    }
    foreach ($item in $entries) {
        $parent = [IO.Path]::GetDirectoryName($item.Relative)
        while ($parent) {
            if ($seen.ContainsKey($parent) -and $seen[$parent] -eq 'file') { Fail 'ZIP_NAME_COLLISION' }
            $parent = [IO.Path]::GetDirectoryName($parent)
        }
    }
    return ,$entries
}
function Open-VerifiedArchive {
    Require-File $script:cfg.zipPath
    $stream = New-Object IO.FileStream($script:cfg.zipPath, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
    try {
        $hash = [Security.Cryptography.SHA256]::Create()
        try { $actual = ([BitConverter]::ToString($hash.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
        finally { $hash.Dispose() }
        if ($actual -cne $script:cfg.sha256.ToLowerInvariant()) { Fail 'HASH_MISMATCH' }
        $stream.Position = 0
        return New-Object IO.Compression.ZipArchive($stream, [IO.Compression.ZipArchiveMode]::Read, $false)
    } catch { $stream.Dispose(); throw }
}
function Prepare-Update {
    if (Test-Path -LiteralPath $script:cfg.stageDir) { Fail 'STAGE_EXISTS' }
    Check-Package $script:cfg.targetDir $script:cfg.currentVersion $false
    $archive = Open-VerifiedArchive
    try {
        $entries = Check-Archive $archive
        # Every entry has been checked before any extraction or stage creation.
        [void][IO.Directory]::CreateDirectory($script:cfg.stageDir)
        foreach ($item in $entries) {
            No-Reparse $item.Destination
            if ($item.IsDirectory) { [void][IO.Directory]::CreateDirectory($item.Destination); continue }
            [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($item.Destination))
            $source = $item.Entry.Open()
            try {
                $output = New-Object IO.FileStream($item.Destination, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
                try { $source.CopyTo($output) } finally { $output.Dispose() }
            } finally { $source.Dispose() }
            if ((Get-Item -LiteralPath $item.Destination).Length -ne $item.Entry.Length) { Fail 'EXTRACTED_SIZE_MISMATCH' }
        }
    } finally { $archive.Dispose() }
    Check-Package $script:stageApp $script:cfg.version $true
    [IO.File]::WriteAllText((Join-Path $script:cfg.stageDir '.quiet-field-prepared.json'), (@{ticket=$script:cfg.ticket;version=$script:cfg.version;sha256=$script:cfg.sha256;targetDir=$script:cfg.targetDir} | ConvertTo-Json -Compress), $script:utf8)
    return @{status='prepared';version=$script:cfg.version;stageDir=$script:cfg.stageDir}
}
function File-Sha256([string]$Path) {
    # GUI-launched Windows PowerShell may inherit a PSModulePath without Get-FileHash.
    # Hash directly with .NET, as archive verification already does.
    $stream = New-Object IO.FileStream($Path, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
    $digest = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($digest.ComputeHash($stream))).Replace('-', '') }
    finally { $digest.Dispose(); $stream.Dispose() }
}
function Check-Prepared {
    $prepared = Read-Json (Join-Path $script:cfg.stageDir '.quiet-field-prepared.json')
    if ($prepared.ticket -cne $script:cfg.ticket -or $prepared.version -cne $script:cfg.version -or $prepared.sha256 -ine $script:cfg.sha256 -or !(Same-Path $prepared.targetDir $script:cfg.targetDir)) { Fail 'PREPARED_MISMATCH' }
    Check-Package $script:cfg.targetDir $script:cfg.currentVersion $false
    Check-Package $script:stageApp $script:cfg.version $true
    # Revalidate both archive names and extracted file bytes immediately before applying.
    $archive = Open-VerifiedArchive
    try {
        $entries = Check-Archive $archive
        $expected = New-Object 'Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
        foreach ($item in $entries) {
            No-Reparse $item.Destination
            if ($item.IsDirectory) { continue }
            if (!(Test-Path -LiteralPath $item.Destination -PathType Leaf)) { Fail 'STAGE_CHANGED' }
            [void]$expected.Add($item.Destination)
            if ((Get-Item -LiteralPath $item.Destination).Length -ne $item.Entry.Length) { Fail 'STAGE_CHANGED' }
            $source = $item.Entry.Open()
            $digest = [Security.Cryptography.SHA256]::Create()
            try { $archiveHash = [BitConverter]::ToString($digest.ComputeHash($source)) }
            finally { $digest.Dispose(); $source.Dispose() }
            $fileHash = File-Sha256 $item.Destination
            if ($archiveHash.Replace('-', '') -ine $fileHash) { Fail 'STAGE_CHANGED' }
        }
        $pending = New-Object 'Collections.Generic.Stack[string]'
        $pending.Push($script:stageApp)
        while ($pending.Count -gt 0) {
            foreach ($file in Get-ChildItem -LiteralPath $pending.Pop() -Force) {
                if (($file.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { Fail 'REPARSE_PATH' }
                if ($file.PSIsContainer) { $pending.Push($file.FullName) }
                elseif (!$expected.Contains($file.FullName)) { Fail 'STAGE_CHANGED' }
            }
        }
    } finally { $archive.Dispose() }
}
function Move-Directory([string]$Source, [string]$Destination) {
    # Electron children and security scanners can briefly retain file handles after exit.
    $deadline = [DateTime]::UtcNow.AddSeconds(10)
    while ($true) {
        No-Reparse $Source
        No-Reparse $Destination
        if (!(Test-Path -LiteralPath $Source -PathType Container) -or (Test-Path -LiteralPath $Destination)) { Fail 'MOVE_PATH_CONFLICT' }
        try { Move-Item -LiteralPath $Source -Destination $Destination -ErrorAction Stop; return }
        catch { if ([DateTime]::UtcNow -ge $deadline) { throw }; Start-Sleep -Milliseconds 200 }
    }
}
function Quote-Argument([string]$Value) {
    if ($Value.Contains('"')) { Fail 'INVALID_ARGUMENT' }
    # Config paths always end with a filename, so no trailing backslash escaping is needed.
    return '"' + $Value + '"'
}
function Launch-App([string]$AppDir, [bool]$WithTicket) {
    $exe = Join-Path $AppDir $script:exeName
    Require-File $exe
    $options = @{FilePath=$exe;WorkingDirectory=$AppDir;PassThru=$true}
    if ($WithTicket) { $options.ArgumentList = Quote-Argument ('--quiet-field-update-ticket=' + $script:configAbsolute) }
    $started = Start-Process @options
    $null = $started.Handle
    return $started
}
function Launch-Update {
    # Start-Process gives Apply its own hidden console. Node's normal child can
    # die with the app's console; Node's detached PowerShell may not run at all.
    $workerPath = Full-Path $PSCommandPath
    Require-File $workerPath
    $hostPath = Join-Path $PSHOME 'powershell.exe'
    Require-File $hostPath
    $arguments = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File ' + (Quote-Argument $workerPath) + ' -Mode Apply -ConfigPath ' + (Quote-Argument $script:configAbsolute)
    $helper = Start-Process -FilePath $hostPath -ArgumentList $arguments -WorkingDirectory $script:cfg.jobDir -WindowStyle Hidden -PassThru
    $null = $helper.Handle
    $ready = $false
    # Finish before the adapter's five-minute readiness deadline. Once ready,
    # Apply owns its old-process and new-process deadlines and must not be killed.
    $deadline = [DateTime]::UtcNow.AddSeconds(285)
    while (!$helper.WaitForExit(200)) {
        if (!$ready) {
            if (Test-Path -LiteralPath $script:cfg.readyPath -PathType Leaf) {
                try {
                    $marker = Read-Json $script:cfg.readyPath
                    $ready = $marker.ready -eq $true -and $marker.ticket -ceq $script:cfg.ticket
                } catch { }
            }
            if (!$ready -and [DateTime]::UtcNow -ge $deadline) {
                $helper.Kill()
                [void]$helper.WaitForExit(10000)
                Fail 'HELPER_READY_TIMEOUT'
            }
        }
    }
    return $helper.ExitCode
}
function Apply-Update {
    Check-Prepared
    foreach ($path in @($script:cfg.readyPath, $script:cfg.ackPath, $script:cfg.resultPath)) { if (Test-Path -LiteralPath $path) { Fail 'STALE_MARKER' } }
    $old = Get-Process -Id ([int]$script:cfg.pid) -ErrorAction SilentlyContinue
    if ($old) {
        try { if (!(Same-Path (Full-Path $old.Path) (Join-Path $script:cfg.targetDir $script:exeName))) { Fail 'PID_IDENTITY_MISMATCH' } }
        catch { Fail 'PID_IDENTITY_MISMATCH' }
    }
    Write-Json $script:cfg.readyPath @{ticket=$script:cfg.ticket;ready=$true}
    if ($old -and !$old.WaitForExit(60000)) { Fail 'OLD_PROCESS_TIMEOUT' }
    $script:oldExited = $true
    # Check directories again after waiting. Never terminate the old process.
    No-Reparse $script:cfg.targetDir
    No-Reparse $script:cfg.stageDir
    No-Reparse $script:cfg.backupDir
    Check-Package $script:cfg.targetDir $script:cfg.currentVersion $false
    if (Test-Path -LiteralPath $script:cfg.backupDir) { Fail 'BACKUP_EXISTS' }
    Move-Directory $script:cfg.targetDir $script:cfg.backupDir
    $script:swapStarted = $true
    Move-Directory $script:stageApp $script:cfg.targetDir
    $script:launched = Launch-App $script:cfg.targetDir $true
    $deadline = [DateTime]::UtcNow.AddSeconds(45)
    while ([DateTime]::UtcNow -lt $deadline) {
        if (Test-Path -LiteralPath $script:cfg.ackPath -PathType Leaf) {
            try {
                $ack = Read-Json $script:cfg.ackPath
                if ($ack.ticket -ceq $script:cfg.ticket -and $ack.version -ceq $script:cfg.version -and [int]$ack.pid -eq $script:launched.Id) {
                    $script:launched.Refresh()
                    if (!$script:launched.HasExited) {
                        $result = @{status='updated';version=$script:cfg.version;backupDir=$script:cfg.backupDir}
                        Write-Json $script:cfg.resultPath $result
                        return $result
                    }
                }
            } catch { }
        }
        $script:launched.Refresh()
        if ($script:launched.HasExited) { Fail 'NEW_PROCESS_EXITED' }
        Start-Sleep -Milliseconds 150
    }
    Fail 'ACK_TIMEOUT'
}
function Rollback-Update([string]$ErrorCode) {
    if ($script:launched) {
        $script:launched.Refresh()
        if (!$script:launched.HasExited) {
            # This is the specific process handle returned by our own Start-Process.
            $script:launched.Kill()
            if (!$script:launched.WaitForExit(10000)) { Fail 'ROLLBACK_PROCESS_TIMEOUT' }
        }
    }
    No-Reparse $script:cfg.targetDir
    No-Reparse $script:cfg.backupDir
    No-Reparse $script:cfg.stageDir
    if (!(Test-Path -LiteralPath $script:cfg.backupDir -PathType Container)) { Fail 'ROLLBACK_BACKUP_MISSING' }
    Check-Package $script:cfg.backupDir $script:cfg.currentVersion $false
    if (Test-Path -LiteralPath $script:cfg.targetDir) {
        if (Test-Path -LiteralPath $script:stageApp) { Fail 'ROLLBACK_STAGE_CONFLICT' }
        Move-Directory $script:cfg.targetDir $script:stageApp
    }
    Move-Directory $script:cfg.backupDir $script:cfg.targetDir
    $script:swapStarted = $false
    $script:oldExited = $false
    $result = @{status='rolled-back';errorCode=$ErrorCode;version=$script:cfg.currentVersion}
    Write-Json $script:cfg.resultPath $result
    try { [void](Launch-App $script:cfg.targetDir $false) }
    catch { $result.reopenError = 'OLD_REOPEN_FAILED'; Write-Json $script:cfg.resultPath $result }
    return $result
}
try {
    Check-Config
    if ($Mode -eq 'Launch') {
        $helperExit = Launch-Update
        # Preserve Apply's terminal result, including rollback diagnostics.
        if (!(Test-Path -LiteralPath $script:cfg.resultPath -PathType Leaf)) { Fail 'HELPER_EXITED_WITHOUT_RESULT' }
        [Console]::Out.WriteLine((@{status='launcher-exited';exitCode=$helperExit} | ConvertTo-Json -Compress))
        exit $helperExit
    }
    if ($Mode -eq 'Prepare') { $result = Prepare-Update } else { $result = Apply-Update }
    [Console]::Out.WriteLine(($result | ConvertTo-Json -Compress))
    exit 0
} catch {
    $failureRecord = $_
    $code = $_.Exception.Message
    if ($code -notmatch '^[A-Z][A-Z0-9_]+$') { $code = 'WORKER_IO_ERROR' }
    $result = @{status='failed';errorCode=$code}
    if ($script:swapStarted) {
        try { $result = Rollback-Update $code }
        catch { $result = @{status='rollback-failed';errorCode='ROLLBACK_FAILED';cause=$code;backupDir=$script:cfg.backupDir} }
    }
    elseif ($Mode -eq 'Apply' -and $script:oldExited -and $script:pathsValidated) {
        # A failed first rename must not leave a normally exited old app closed.
        try { Check-Package $script:cfg.targetDir $script:cfg.currentVersion $false; [void](Launch-App $script:cfg.targetDir $false) }
        catch { $result.reopenError = 'OLD_REOPEN_FAILED' }
    }
    # Keep useful local diagnostics without including user paths or raw exception text.
    $result.diagnostic = @{
        exceptionType = $failureRecord.Exception.GetType().FullName
        line = $failureRecord.InvocationInfo.ScriptLineNumber
        errorId = ([string]$failureRecord.FullyQualifiedErrorId -replace '[^A-Za-z0-9_.,-]', '')
    }
    if ($script:pathsValidated -and !($Mode -eq 'Launch' -and (Test-Path -LiteralPath $script:cfg.resultPath -PathType Leaf))) { try { Write-Json $script:cfg.resultPath $result } catch { } }
    [Console]::Error.WriteLine(($result | ConvertTo-Json -Compress))
    exit 1
}