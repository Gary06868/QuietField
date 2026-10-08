# 1.7.0 local preview

This preview consolidates appearance, language, light mode, window closing behavior and license information into one Settings dialog. It defaults to keeping audio running in the system tray when the full window is closed. Users can choose to quit instead; the tray's explicit Quit command continues to exit the app.

The public library now contains 71 sounds: 68 recordings and the existing three generated noise colors. Six CC0 original WAV recordings were added; see [sound sources and specifications](audio-library.en.md) and [credits](../THIRD_PARTY_NOTICES.md).

Validation includes 59 unit tests, both packaged editions' settings and persistence flows, 12 bilingual native window sizes, background pause conditions, packaged mini/tray controls, and a complete isolated 1.6.1-to-1.7.0 update using the actual new archive. Imported audio hashes, saved mixes, favorites and existing settings survived that update and remained usable.

Experimental clarity previews are outside the shipped application. The first mild processing examples did not meet the user's listening expectations. Targeted hum/rumble samples and alternative recordings are awaiting listening review. No clarity processing has been applied to the app or the distributed source recordings.

This is a local preview, not a published GitHub release. The live product page and current downloadable release remain at 1.6.1 until the new version is published.
