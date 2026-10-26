# Quiet Field 1.8.0 · 静野

Four more CC0 recordings bring the library to 75 sounds. Saved mixes now crossfade smoothly; optional dynamic levels and automatic mix rotation add gentle variation. Focus/break cycles, Natural/Soft/Deep tone choices, custom sleep timing and +10 minutes are available without changing the final 15-second sleep fade. Local JSON backup restores favorites and saved mixes (audio files are not embedded), deletion can be undone, and up to 1,000 saved mixes survive restart. Imports report successes and failures. The version and local update notes are visible in Settings.

新增 4 段 CC0 录音，声音库增至 75 种。切换组合平滑过渡，可选动态声景和收藏组合轮播；新增专注/休息循环、自然/柔和/低沉音色、自定义睡眠计时与延长 10 分钟，保留最后 15 秒淡出。可用本地 JSON 备份收藏与组合（不内嵌自定义音频），删除组合可撤销，最多 1000 套组合完整保存与恢复。批量导入会汇总成功与失败原因，设置中可查看版本与本版更新说明。

## Playback and data

Pause keeps its existing immediate-stop behavior. Sleep expiry takes priority over focus and rotation. Restart restores preferences and saved content without automatically playing. Dynamic levels are off by default; rotation does not silently resume paused playback. Focus rest silences playback; manual pause freezes its countdown until explicitly resumed.

Backups contain local references and mix levels, not imported audio bytes. Import validates the entire backup before changing data. Limits: 1,000 saved mixes, 2 MB backup JSON, 20 audio files per import batch; each audio file up to 40 MB, 5 minutes and two channels.

## Audio and verification

75 sounds: 72 licensed recordings and 3 generated noises. New recordings use Freesound public HQ MP3 derivatives under CC0, without transcoding. See [provenance](../public/licenses/review-audio-provenance.json) and [credits](../THIRD_PARTY_NOTICES.md). Automated tests and native decode/loop checks do not establish subjective audio quality, overnight stability or compatibility with every audio device.

公开版仍使用原有 QuietField-Public 数据目录、quiet://app 来源和声音编号。请保留数据目录；正式版不会包含审核配置或测试数据。程序未签名，可能出现 Windows 信誉提示。
