# What's new

The script shows sections from this file in the "⬆ Updates" window when the language is English.
Heading format: `## X.Y — DD.MM.YYYY`, followed by lines that start with "-".
The Russian version is [CHANGELOG.md](CHANGELOG.md).

## 3.0 — 22.11.2026
- Instant updates: Tampermonkey now installs a small loader, and the script itself loads from GitHub every time you open Twitch. A new version works right after you reload the page (GitHub delay up to about a minute).
- If GitHub does not respond, a saved copy of the script runs.
- Open tabs check for a new version every 15 minutes; watch and reward tabs restart on it by themselves.
- ❤ Followed channels: Twitch answered "service error" to the followed channels query. Now the script tries several query variants, remembers the one that works and logs which one it is. If none works, it logs that once and retries in 30 minutes instead of every 2.
- Log: every page load now has a reason (scheduled inventory reload, switching channel, restart on a new version) or a note "reloaded not by the script".
- New setting "Panel opacity when not hovered" — from 50 to 100 %.

## 2.6 — 22.11.2026
- Compact panel: buttons are icons without words (hover for a hint), all on one line.
- The panel is semi-transparent and fades in smoothly when you hover over it.
- The "–" button collapses the panel to a state icon: 👀✔ watching, 👀⏳ waiting, 👀🔎 searching, 🎁 N — rewards.
- Drag the panel with the mouse anywhere; the position is saved. Windows open next to it.

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
