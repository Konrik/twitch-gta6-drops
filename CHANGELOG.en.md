# What's new

The script shows sections from this file in the "⬆ Updates" window when the language is English.
Heading format: `## X.Y — DD.MM.YYYY`, followed by lines that start with "-".
The Russian version is [CHANGELOG.md](CHANGELOG.md).

## 2.5 — 22.11.2026
- English language: the EN / RU button on the panel switches the whole interface and log (or ⚙ → "Language").
- By default the language follows Twitch: Russian Twitch gives a Russian script, otherwise English.
- A language change applies at once in all open Twitch tabs.
- The README and the changelog are now available in English too.

## 2.4 — 22.11.2026
- Auto-update: the script now lives on GitHub, and Tampermonkey pulls new versions by itself.
- The version button on the panel opens the "⬆ Updates" window: check now, see what's new, install.
- Every 6 hours the script checks GitHub and highlights "⬆" when a new version is out.
- After an update, auto-watch tabs restart on the new version by themselves (can be turned off in ⚙).

## 2.3
- Event log 📜 with copy and clear.
- Navigation watchdog: a stuck page load or Twitch request no longer stops the script.
- Stream check via the Twitch API: the script no longer sticks to a stream that has ended.
