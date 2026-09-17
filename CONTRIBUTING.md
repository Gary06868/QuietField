# Contributing · 参与贡献

English and Chinese contributions are welcome. 欢迎用中文或英文反馈。

- **Bugs:** include app/Windows versions, display scale, steps and expected/actual behavior. Audio issues benefit from the output device type. Remove private information from screenshots and logs.
- **Translations:** English strings are in `src/locales/en.json`; Chinese strings are the source keys. Preserve `{placeholders}`, sound IDs and user-written names. Run `npm test` and `node scripts/verify-i18n.mjs` after a build.
- **Sound requests:** include the original author page, duration and an explicit redistribution license. Prefer long, steady recordings that loop well. Do not submit audio copied from another app without per-file permission. We do not inflate counts with renamed or sliced duplicates.
- **Code:** use Node.js 22, follow the README, keep changes focused and describe validation. Never commit user data, imports, credentials or private audio. Desktop tests must use `QUIET_FIELD_TEST_DATA`.

Open an issue before a major feature or architecture change. No need to ask before a small typo or translation fix. Platform ports require actual target-OS testing; a build alone is not full support.

中文：反馈请注明版本、系统、缩放和复现步骤；翻译保留占位符和声音 ID；推荐音源需附原作者页面及授权。大功能先开 issue，小修正可直接提交。不要上传个人文件或未授权音频。
