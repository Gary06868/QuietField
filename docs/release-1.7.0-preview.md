# 1.7.0 local preview

This preview consolidates appearance, language, light mode, window closing behavior and license information into one Settings dialog. It defaults to keeping audio running in the system tray when the full window is closed. Users can choose to quit instead; the tray's explicit Quit command continues to exit the app.

The public library now contains 71 sounds: 68 recordings and the existing three generated noise colors. Six CC0 original WAV recordings were added; see [sound sources and specifications](audio-library.en.md) and [credits](../THIRD_PARTY_NOTICES.md).

Validation includes 62 unit tests, both packaged editions' settings and persistence flows, 12 bilingual native window sizes, background pause conditions, packaged mini/tray controls, and a complete isolated 1.6.1-to-1.7.0 update using the actual new archive. Imported audio hashes, saved mixes, favorites and existing settings survived that update and remained usable.

After listening review, Coastal surf now directly uses the approved G treatment in both editions. There is no extra setting or recording switch. It reduces rumble, wind and hiss, retains the complete source duration and stereo channels, and preserves its reviewed playback level. Rain and stream recordings remain unchanged. Existing saved mixes resolve the same sound ID. Both final executables passed an isolated playback and persistence check; the production loop also passed an offline-rendered boundary comparison. The previous complete update regression covers the unchanged updater; the final G archive has not repeated that full installation regression.

This is a local preview, not a published GitHub release. The live product page and current downloadable release remain at 1.6.1 until the new version is published.
