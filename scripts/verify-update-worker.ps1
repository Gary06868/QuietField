# Isolated tests only: every executable, update archive and marker lives below test-results.
[CmdletBinding()]
param([switch]$IncludeTimeout, [switch]$FlowsOnly)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$repo = Split-Path -Parent $PSScriptRoot
$worker = Join-Path $repo 'update-worker.ps1'
$testRoot = Join-Path $repo ('test-results\update-worker-' + [guid]::NewGuid().ToString('D'))
[void][IO.Directory]::CreateDirectory($testRoot)
$env:QUIET_FIELD_TEST_DATA = Join-Path $testRoot 'isolated-user-data'
[void][IO.Directory]::CreateDirectory($env:QUIET_FIELD_TEST_DATA)
[IO.File]::WriteAllText((Join-Path $env:QUIET_FIELD_TEST_DATA 'keep.txt'), 'user data must survive')
$utf8 = New-Object Text.UTF8Encoding($false)
$exeName = ([string][char]0x9759) + ([string][char]0x91ce) + '.exe'
$dummyExe = Join-Path $testRoot 'fixture.exe'
$fixtureCode = @"
using System;
using System.IO;
using System.Threading;
using System.Collections.Generic;
using System.Web.Script.Serialization;
public static class UpdateFixture {
  [STAThread] public static void Main(string[] args) {
    if (String.IsNullOrEmpty(Environment.GetEnvironmentVariable("QUIET_FIELD_TEST_DATA"))) return;
    string root = AppDomain.CurrentDomain.BaseDirectory;
    if (args.Length > 0 && args[0] == "--hold") {
      while (!File.Exists(Path.Combine(root, "exit-old.txt"))) Thread.Sleep(30);
      return;
    }
    if (args.Length == 0) {
      File.WriteAllText(Path.Combine(root, "old-reopened.txt"), "yes");
      return;
    }
    string flag = "--quiet-field-update-ticket=";
    if (!args[0].StartsWith(flag)) return;
    string configPath = args[0].Substring(flag.Length);
    var json = new JavaScriptSerializer();
    var config = json.Deserialize<Dictionary<string,object>>(File.ReadAllText(configPath));
    string behavior = File.ReadAllText(Path.Combine(root, "behavior.txt"));
    if (behavior == "crash") return;
    if (behavior == "timeout") { Thread.Sleep(60000); return; }
    var ack = new Dictionary<string,object> {
      {"ticket", config["ticket"]}, {"version", config["version"]},
      {"pid", System.Diagnostics.Process.GetCurrentProcess().Id}
    };
    string ackPath = (string)config["ackPath"];
    File.WriteAllText(ackPath + ".tmp", json.Serialize(ack));
    File.Move(ackPath + ".tmp", ackPath);
    Thread.Sleep(3000);
  }
}
"@
Add-Type -TypeDefinition $fixtureCode -Language CSharp -ReferencedAssemblies 'System.Web.Extensions.dll' -OutputAssembly $dummyExe -OutputType WindowsApplication
$script:checks = 0
function Assert($Condition, [string]$Message) { if (!$Condition) { throw $Message }; $script:checks++ }
function Json-File([string]$Path, $Data) { [IO.File]::WriteAllText($Path, ($Data | ConvertTo-Json -Compress -Depth 10), $utf8) }
function Create-Package([string]$Dir, [string]$Version, [string]$Edition, [string]$Behavior) {
    [void][IO.Directory]::CreateDirectory((Join-Path $Dir 'resources\app\dist\sounds'))
    [void][IO.Directory]::CreateDirectory((Join-Path $Dir 'locales'))
    Copy-Item -LiteralPath $dummyExe -Destination (Join-Path $Dir $exeName)
    foreach ($file in @('ffmpeg.dll','d3dcompiler_47.dll','resources.pak','icudtl.dat','v8_context_snapshot.bin','snapshot_blob.bin','chrome_100_percent.pak','chrome_200_percent.pak','locales\en-US.pak','resources\app\electron.cjs','resources\app\preload.cjs','resources\app\dist\index.html','resources\app\dist\sounds\sound.ogg')) { [IO.File]::WriteAllText((Join-Path $Dir $file), 'fixture') }
    Json-File (Join-Path $Dir 'resources\app\package.json') @{name='quiet-field';version=$Version}
    Json-File (Join-Path $Dir 'resources\app\dist\edition.json') @{edition=$Edition}
    Json-File (Join-Path $Dir 'resources\app\dist\catalog.json') @(@{id='test';path='./sounds/sound.ogg'},@{id='noise';generated=$true})
    [IO.File]::WriteAllText((Join-Path $Dir 'behavior.txt'), $Behavior)
}
function New-Fixture([string]$Name, [string]$Edition = 'public', [string]$Behavior = 'ack') {
    $dir = Join-Path $testRoot ($Name + ' spaced path')
    $target = Join-Path $dir 'Original install'
    $job = Join-Path $dir 'user data\updates\job'
    $source = Join-Path $dir 'source'
    $newApp = Join-Path $source 'QuietField-win32-x64'
    [void][IO.Directory]::CreateDirectory($job)
    Create-Package $target '1.0.0' 'public' 'ack'
    Create-Package $newApp '1.1.0' $Edition $Behavior
    [IO.File]::WriteAllText((Join-Path $target 'original.txt'), 'old installation')
    $zip = Join-Path $job 'update.zip'
    [IO.Compression.ZipFile]::CreateFromDirectory($source, $zip)
    $config = @{
        zipPath=$zip;stageDir=(Join-Path $dir ('.quiet-field-stage-' + [guid]::NewGuid().ToString('D')))
        targetDir=$target;backupDir=(Join-Path $dir ('.quiet-field-backup-1.0.0-' + [guid]::NewGuid().ToString('D')))
        currentVersion='1.0.0';version='1.1.0';sha256=(Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash
        pid=$PID;jobDir=$job;ticket=[guid]::NewGuid().ToString('D')
        readyPath=(Join-Path $job 'ready.json');ackPath=(Join-Path $job 'ack.json');resultPath=(Join-Path $job 'result.json')
    }
    $configPath = Join-Path $job 'config.json'
    Json-File $configPath $config
    return @{Dir=$dir;Target=$target;Source=$source;NewApp=$newApp;Config=$config;ConfigPath=$configPath}
}
function Run-Worker($Fixture, [string]$Mode, [switch]$Async) {
    $tag = $Mode + '-' + [guid]::NewGuid().ToString('N')
    $stdout = Join-Path $Fixture.Dir ($tag + '.stdout')
    $stderr = Join-Path $Fixture.Dir ($tag + '.stderr')
    $args = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + $worker + '" -Mode ' + $Mode + ' -ConfigPath "' + $Fixture.ConfigPath + '"'
    $process = Start-Process -FilePath powershell.exe -ArgumentList $args -WindowStyle Hidden -PassThru -RedirectStandardOutput $stdout -RedirectStandardError $stderr
    $null = $process.Handle
    if ($Async) { return @{Process=$process;Stdout=$stdout;Stderr=$stderr} }
    $process.WaitForExit()
    return @{ExitCode=$process.ExitCode;Stdout=[IO.File]::ReadAllText($stdout);Stderr=[IO.File]::ReadAllText($stderr)}
}
function Assert-Original($Fixture) {
    Assert (Test-Path -LiteralPath (Join-Path $Fixture.Target 'original.txt')) 'Original install changed.'
    Assert (!(Test-Path -LiteralPath $Fixture.Config.backupDir)) 'Unexpected backup mutation.'
    $version = (Get-Content -LiteralPath (Join-Path $Fixture.Target 'resources\app\package.json') -Raw | ConvertFrom-Json).version
    Assert ($version -eq '1.0.0') 'Original version changed.'
}
function Add-ZipEntry($Fixture, [string]$Name, [int]$Attributes = 0) {
    $archive = [IO.Compression.ZipFile]::Open($Fixture.Config.zipPath, [IO.Compression.ZipArchiveMode]::Update)
    try {
        $entry = $archive.CreateEntry($Name)
        $entry.ExternalAttributes = $Attributes
        $stream = $entry.Open()
        try { $stream.WriteByte(65) } finally { $stream.Dispose() }
    } finally { $archive.Dispose() }
    $Fixture.Config.sha256 = (Get-FileHash -LiteralPath $Fixture.Config.zipPath -Algorithm SHA256).Hash
    Json-File $Fixture.ConfigPath $Fixture.Config
}
function Expect-Rejected($Fixture, [string]$Expected, [bool]$BeforeExtraction = $true) {
    $result = Run-Worker $Fixture Prepare
    Assert ($result.ExitCode -ne 0) ('Expected rejection: ' + $Expected)
    Assert ($result.Stderr.Contains($Expected)) ('Wrong rejection: ' + $result.Stderr)
    Assert-Original $Fixture
    if ($BeforeExtraction) { Assert (!(Test-Path -LiteralPath $Fixture.Config.stageDir)) 'Unsafe archive extracted before rejection.' }
    Write-Output ('PASS ' + $Expected)
}
function Wait-ForFile([string]$Path, [int]$Seconds) {
    $deadline = [DateTime]::UtcNow.AddSeconds($Seconds)
    while ([DateTime]::UtcNow -lt $deadline) { if (Test-Path -LiteralPath $Path) { return $true }; Start-Sleep -Milliseconds 80 }
    return $false
}
function Apply-Flow([string]$Behavior, [switch]$TerminateLauncher) {
    $fixtureName = 'apply-' + $Behavior + $(if ($TerminateLauncher) { '-launcher-exit' } else { '' })
    $fixture = New-Fixture $fixtureName 'public' $Behavior
    $prepare = Run-Worker $fixture Prepare
    Assert ($prepare.ExitCode -eq 0) ('Prepare failed: ' + $prepare.Stderr)
    $old = Start-Process -FilePath (Join-Path $fixture.Target $exeName) -ArgumentList '--hold' -WindowStyle Hidden -PassThru
    $fixture.Config.pid = $old.Id
    Json-File $fixture.ConfigPath $fixture.Config
    $workerProcess = Run-Worker $fixture Launch -Async
    try {
        Assert (Wait-ForFile $fixture.Config.readyPath 20) 'Apply readiness missing.'
        $ready = Get-Content -LiteralPath $fixture.Config.readyPath -Raw | ConvertFrom-Json
        Assert ($ready.ticket -eq $fixture.Config.ticket -and $ready.ready) 'Wrong ready marker.'
        Assert (!$old.HasExited) 'Helper terminated original process.'
        Assert-Original $fixture
        if ($TerminateLauncher) {
            # Kill only this fixture's exact bootstrap process. Independent Apply
            # must remain alive and complete after the old fixture exits normally.
            $workerProcess.Process.Kill()
            Assert ($workerProcess.Process.WaitForExit(5000)) 'Fixture launcher did not exit.'
            Assert (!$old.HasExited) 'Launcher exit affected the old app.'
        }
        [IO.File]::WriteAllText((Join-Path $fixture.Target 'exit-old.txt'), 'exit voluntarily')
        Assert ($old.WaitForExit(5000)) 'Fixture did not exit.'
        if (!$TerminateLauncher) { Assert ($workerProcess.Process.WaitForExit(65000)) 'Apply worker did not finish.' }
        Assert (Wait-ForFile $fixture.Config.resultPath 65) 'Apply result missing after launcher exit.'
        $result = Get-Content -LiteralPath $fixture.Config.resultPath -Raw | ConvertFrom-Json
        if ($Behavior -eq 'ack') {
            if (!$TerminateLauncher) { Assert ($workerProcess.Process.ExitCode -eq 0) ('Apply failed: ' + [IO.File]::ReadAllText($workerProcess.Stderr)) }
            Assert ($result.status -eq 'updated') 'Update not acknowledged.'
            Assert (Test-Path -LiteralPath (Join-Path $fixture.Config.backupDir 'original.txt')) 'Original backup missing.'
            Assert (!(Test-Path -LiteralPath (Join-Path $fixture.Target 'original.txt'))) 'New install not replaced.'
            $pkg = Get-Content -LiteralPath (Join-Path $fixture.Target 'resources\app\package.json') -Raw | ConvertFrom-Json
            Assert ($pkg.version -eq '1.1.0') 'Wrong installed version.'
        } else {
            Assert ($result.status -eq 'rolled-back') ('Rollback failed: ' + [IO.File]::ReadAllText($workerProcess.Stderr))
            Assert ($result.errorCode -eq $(if ($Behavior -eq 'timeout') {'ACK_TIMEOUT'} else {'NEW_PROCESS_EXITED'})) 'Wrong rollback reason.'
            Assert-Original $fixture
            Assert (Wait-ForFile (Join-Path $fixture.Target 'old-reopened.txt') 5) 'Old app was not reopened.'
            Assert (Test-Path -LiteralPath (Join-Path $fixture.Config.stageDir 'QuietField-win32-x64')) 'Failed new app was not retained.'
        }
    } finally {
        if (!$old.HasExited) { [IO.File]::WriteAllText((Join-Path $fixture.Target 'exit-old.txt'), 'test cleanup') }
    }
    Write-Output ('PASS ' + $fixtureName)
}

if (!$FlowsOnly) {
$happy = New-Fixture 'prepare'
$result = Run-Worker $happy Prepare
Assert ($result.ExitCode -eq 0) ('Happy prepare failed: ' + $result.Stderr)
Assert ($result.Stdout.Contains('prepared')) 'Missing prepare response.'
Assert (Test-Path -LiteralPath (Join-Path $happy.Config.stageDir 'QuietField-win32-x64\resources\app\dist\sounds\sound.ogg')) 'Prepared asset absent.'
Assert-Original $happy
Write-Output 'PASS prepare'

$hash = New-Fixture 'hash'
$hash.Config.sha256 = '0' * 64
Json-File $hash.ConfigPath $hash.Config
Expect-Rejected $hash 'HASH_MISMATCH'

$edition = New-Fixture 'private' 'personal'
Expect-Rejected $edition 'WRONG_EDITION' $false

$cases = @(
    @('traversal', 'QuietField-win32-x64/../../outside.txt', 'UNSAFE_ZIP_PATH', 0),
    @('backslash-traversal', 'QuietField-win32-x64\..\outside.txt', 'UNSAFE_ZIP_PATH', 0),
    @('rooted', '/QuietField-win32-x64/file', 'UNSAFE_ZIP_PATH', 0),
    @('drive', 'C:/outside.txt', 'UNSAFE_ZIP_PATH', 0),
    @('ads', 'QuietField-win32-x64/file:stream', 'UNSAFE_ZIP_PATH', 0),
    @('reserved', 'QuietField-win32-x64/NUL.txt', 'UNSAFE_ZIP_PATH', 0),
    @('reserved-spaced', 'QuietField-win32-x64/CON .txt', 'UNSAFE_ZIP_PATH', 0),
    @('console-device', 'QuietField-win32-x64/CONIN$.txt', 'UNSAFE_ZIP_PATH', 0),
    @('trailing-space', 'QuietField-win32-x64/file ', 'UNSAFE_ZIP_PATH', 0),
    @('trailing-dot', 'QuietField-win32-x64/file.', 'UNSAFE_ZIP_PATH', 0),
    @('wrong-root', 'Other-root/file', 'WRONG_ZIP_ROOT', 0),
    @('duplicate', 'QuietField-win32-x64/behavior.txt', 'ZIP_NAME_COLLISION', 0),
    @('casefold', 'QuietField-win32-x64/BEHAVIOR.txt', 'ZIP_NAME_COLLISION', 0),
    @('casefold-parent', 'QuietField-win32-x64/RESOURCES/extra.txt', 'ZIP_NAME_COLLISION', 0),
    @('file-parent', 'QuietField-win32-x64/behavior.txt/child', 'ZIP_NAME_COLLISION', 0),
    @('symlink', 'QuietField-win32-x64/link', 'ZIP_LINK_ENTRY', -1577058304),
    @('reparse', 'QuietField-win32-x64/reparse', 'ZIP_LINK_ENTRY', 1024)
)
foreach ($case in $cases) {
    $fixture = New-Fixture $case[0]
    Add-ZipEntry $fixture $case[1] $case[3]
    Expect-Rejected $fixture $case[2]
    Assert (!(Test-Path -LiteralPath (Join-Path $fixture.Dir 'outside.txt'))) 'ZIP escaped staging directory.'
}

# The packaged GUI can start Windows PowerShell with no Get-FileHash available.
# Exercise only config/stage verification with that command deliberately blocked.
$noHash = New-Fixture 'without-hash-command'
$noHash.Config.pid = [int]::MaxValue
Json-File $noHash.ConfigPath $noHash.Config
$prepared = Run-Worker $noHash Prepare
Assert ($prepared.ExitCode -eq 0) ('No-hash fixture prepare failed: ' + $prepared.Stderr)
$helperSource = [IO.File]::ReadAllText($worker)
$boundary = $helperSource.LastIndexOf("try {`n    Check-Config")
if ($boundary -lt 0) { $boundary = $helperSource.LastIndexOf("try {`r`n    Check-Config") }
Assert ($boundary -gt 0) 'Helper entry boundary not found.'
$readOnlyCode = $helperSource.Substring(0, $boundary) + "`nfunction Get-FileHash { throw 'GET_FILE_HASH_UNAVAILABLE' }`nCheck-Config`nCheck-Prepared"
& ([scriptblock]::Create($readOnlyCode)) -Mode Apply -ConfigPath $noHash.ConfigPath
Assert-Original $noHash
Assert (!(Test-Path -LiteralPath $noHash.Config.readyPath)) 'Read-only validation entered Apply.'
Write-Output 'PASS validation-without-Get-FileHash'

# A prepared stage is not blindly trusted after the first helper invocation.
[IO.File]::WriteAllText((Join-Path $happy.Config.stageDir 'QuietField-win32-x64\behavior.txt'), 'bad')
$result = Run-Worker $happy Apply
Assert ($result.ExitCode -ne 0 -and $result.Stderr.Contains('STAGE_CHANGED')) ('Stage tampering not rejected: ' + $result.Stderr)
Assert-Original $happy
Write-Output 'PASS stage-tampering'

}
Apply-Flow 'ack'
Apply-Flow 'crash'
Apply-Flow 'ack' -TerminateLauncher
if ($IncludeTimeout) { Apply-Flow 'timeout' }
Assert (([IO.File]::ReadAllText((Join-Path $env:QUIET_FIELD_TEST_DATA 'keep.txt'))) -eq 'user data must survive') 'User data changed.'
Write-Output ('PASS ' + $script:checks + ' assertions; fixtures: ' + $testRoot)