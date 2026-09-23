# 静野 Quiet Field 1.6.1

免费开源、离线播放的 Windows 环境音混音工具。此版本包含 65 种声音（62 段录音 + 白、粉、棕噪声），所有音源随包提供。

## 从 1.5.0 更新了什么
- 新增 12 段有明确再分发许可的实录，声音库从 53 种扩充到 65 种。
- 迷你播放器、可选置顶与托盘控制，收起窗口后继续播放。
- 8 款可换背景，包括动态极光与星海；轻量模式和系统减少动态效果会暂停动画。
- 改善小窗口字号、固定侧栏与滚动布局；窄窗口可展开当前混音。
- 新版提醒改为安静的“消息”：阅读后红点消失，不反复弹窗，可关闭自动检查。
- Windows x64 公开版支持应用内下载、SHA-256 校验、重启更新与启动失败回退。保留导入音频、收藏、自定义组合、音量和背景偏好。

## 下载与升级
下载 **QuietField-1.6.1-Windows-x64-public.zip**（约 1.27 GB），完整解压后运行 `QuietField-win32-x64/静野.exe`。

**1.5.0 用户需手动下载这一次**：退出旧版后从新文件夹运行，不要删除 `%APPDATA%/QuietField-Public` 数据目录。后续版本可在“消息”里更新。个人版与公开版数据互相独立。

程序包包含完整音源；Source 压缩包只含代码和静态素材，开发需按 README 下载音源。目前仅提供 Windows x64，程序未代码签名。

[中文介绍与试听](https://gary06868.github.io/QuietField/zh-CN/) · [音源与授权](https://github.com/Gary06868/QuietField/blob/main/docs/audio-library.md)

---

## English
Quiet Field is a free, open-source, offline ambient sound mixer for Windows.

New since 1.5.0: 12 licensed field recordings (65 sounds total), a mini player and tray controls, 8 backgrounds including aurora and starlight motion, and a clearer compact-window layout. Light mode and system reduced-motion preferences pause background motion.

Updates now wait in **Messages** without pop-ups. Reading clears the dot for that release. Windows x64 public builds can download and verify a new version, restart, and roll back after a failed startup. Imports, favorites, saved mixes and preferences are preserved.

**Upgrading from 1.5.0:** download this release once, extract the whole ZIP, close the old app and run `QuietField-win32-x64/静野.exe`. Keep `%APPDATA%/QuietField-Public`. Future updates can be installed from Messages. The full Windows package is about 1.27 GB; source archives do not include recordings.

Validated with 54 unit tests, packaged bilingual/compact-window checks, and a full local package-upgrade simulation that verified imported audio hashes and saved mixes. Other operating systems and all possible display/audio-device setups have not been validated.

[Explore & listen](https://gary06868.github.io/QuietField/) · [Recording credits](https://github.com/Gary06868/QuietField/blob/main/docs/audio-library.en.md)
