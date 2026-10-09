# 静野 Quiet Field 1.7.0

免费开源、离线使用的 Windows 环境音混音工具。本版包含 71 种声音（68 段录音 + 白、粉、棕噪声），完整声音库随程序提供。

## 更新内容

- 语言、轻量模式、背景和版权说明集中到「设置」，界面更整洁。
- 默认关闭窗口收起到托盘，任务栏不显示窗口，声音继续播放；可在设置中改为直接退出，托盘右键仍可完全退出。
- 新增 6 段 CC0 实录：面海轻浪、海浪与燕鸥、浅岸浪涌、山泉轻流、木柴暖炉、林中鸟语。
- 「海岸浪潮」采用已试听确认的柔和处理，减弱低频轰鸣、风声与嘶声，直接播放处理后的录音，无额外开关。雨声与溪流保持原样。
- 保留原有导入音频、收藏、自定义组合、音量和背景设置；没有新增遥测。

## 下载与更新

**公开版 1.6.1 用户：** 打开「消息」→「检查更新」→「立即更新」。程序下载官方附件、校验 SHA-256、准备完成后重启；失败时保留回退机制。自动检查最多每天一次，可以关闭，已读红点会消失。

**1.5.0 及更早版本 / 首次使用：** 下载 `QuietField-1.7.0-Windows-x64-public.zip`（约 1.41 GB），完整解压，运行 `QuietField-win32-x64/静野.exe`。旧版用户先从托盘退出旧程序。保留 `%APPDATA%/QuietField-Public`，不要删除本地资料目录。

源码包不含完整声音库；已署名的处理版海岸录音随源码提供，其他音源按 README 获取。目前仅提供 Windows x64。

[介绍与试听](https://gary06868.github.io/QuietField/zh-CN/) · [音源与授权](https://github.com/Gary06868/QuietField/blob/v1.7.0/THIRD_PARTY_NOTICES.md)

---

## English

Quiet Field is a free, open-source, offline ambient sound mixer for Windows. This release includes 71 sounds: 68 recordings and the three existing noise colors.

- One Settings dialog for language, light mode, backgrounds, closing behavior and credits.
- Closing defaults to the system tray while audio keeps playing. Choose Quit in Settings if preferred; the tray's Quit command still exits.
- Six more CC0 field recordings: Facing the sea, Waves and terns, Shallow shore waves, Gentle mountain brook, Wood fire indoors and Woodland birdsong.
- Coastal surf directly uses the reviewed softer treatment with reduced rumble, wind and hiss. No extra switch; rain and stream recordings stay unchanged.
- Existing imports, favorites, saved mixes and preferences are retained. No added telemetry.

**From 1.6.1:** open Messages, check for updates and choose Update now. The official archive is verified before restart. **From older versions:** download and extract the full Windows ZIP once, exit the old app and run the new folder. Keep `%APPDATA%/QuietField-Public`.

Validation: 62 unit checks, both packaged editions' playback/settings checks, and a complete isolated 1.6.1→1.7.0 upgrade using this exact final archive, including restart, imported-audio hashes and saved-mix playback. Only the test download transport was replaced by the local archive. Other platforms are not validated; the Windows build is unsigned.

[Explore & listen](https://gary06868.github.io/QuietField/) · [Credits](https://github.com/Gary06868/QuietField/blob/v1.7.0/THIRD_PARTY_NOTICES.md)
