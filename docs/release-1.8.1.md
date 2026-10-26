# Quiet Field 1.8.1 · 静野

Opening focus controls no longer collapses the mixer tracks, and the right panel uses the space above it. Sidebar utilities share consistent sizing. Settings keeps one size across tabs and languages, scrolling its contents internally. Natural/Soft/Deep tone is directly available on the playback bar. Mini player shares saved-mix rotation, the current mix and tone with the full window; opening it or enabling rotation while paused does not start playback. The 75-sound library and audio/timing algorithms are unchanged from 1.8.0.

修复展开专注区后混音列表被压缩、右侧顶部空间未利用的问题；侧栏设置、迷你播放器、版本与消息入口统一尺寸。设置页签和中英文切换保持同一窗口大小，内容在内部滚动。原声/柔和/低沉可在底部播放栏直接切换；迷你播放器同步组合自动轮播、当前组合与音色，打开小窗或在暂停时开启轮播都不会自动播放。75 种声音及音频/计时算法与 1.8.0 相同。

## Mini player

Configure at least two saved mixes, their interval and order in My mixes. Mini can turn that existing rotation on/off, show the current mix, switch tone and pause/resume. Its setup button opens My mixes when no valid selection exists. Playback, focus rest and sleep expiry share the same state and timers as the main window. Opening or reopening Mini never starts audio. Manual mix changes stop rotation as before.

## Windows and data

The mixer keeps a usable track area and scrollable timer controls when expanded. Settings retains its header, tabs and close button while long content scrolls internally, including English and Chinese. Tone continues to persist under the existing setting. Existing favorites, mixes and imported audio remain in QuietField-Public.

101 automated tests and isolated native Windows checks cover the UI, rotation, sleep/focus priority and restart. Longer-running playback, every device and all mixed-DPI monitor transitions are not exhaustively tested. The Windows x64 build remains unsigned. Audio authors, sources, licenses and hashes are retained in THIRD_PARTY_NOTICES and the bundled catalog.
