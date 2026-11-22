[Русский](README.md) · **English**

# Twitch GTA VI Drops — auto-watch

A Tampermonkey script for Twitch. It keeps a tab on a live GTA VI stream with drops and
switches channels by itself when the stream ends or the streamer changes game. A second tab
can claim rewards in the inventory automatically. The interface is in English and Russian.

The GTA VI drops campaign on Twitch runs from 19 to 30 November 2026. Claim your codes by 7 December.

## Install

1. Install the **Tampermonkey** extension:
   [Chrome](https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo) ·
   [Edge](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd) ·
   [Firefox](https://addons.mozilla.org/firefox/addon/tampermonkey/).
2. **Chrome and Edge only:** open `chrome://extensions` (`edge://extensions` in Edge),
   click "Details" on Tampermonkey and turn on **"Allow User Scripts"**.
   Older Chrome versions do not have this toggle. Turn on "Developer mode" in the top right
   corner of the same page instead. Without it, user scripts do not run.
3. Open this link:
   **[install the script](https://raw.githubusercontent.com/Konrik/twitch-gta6-drops/main/twitch-gta6-drops.user.js)**
4. Tampermonkey shows the script page. Click **"Install"**.
5. Open or reload [twitch.tv](https://www.twitch.tv). A **"🎮 GTA6"** button appears in the bottom left corner.

If you already have an older copy that you pasted by hand, just open the link from step 3.
Tampermonkey offers to update it and keeps your settings. After that, updates arrive by themselves.

## How to use

Click "🎮 GTA6" and choose:

- **👀 Watch in this tab** — the tab finds a live GTA VI stream with drops and stays on it.
  It checks your ⭐ priority channels first, then ❤ the channels you follow, then the whole category.
- **🎁 Rewards in a new tab** — opens the inventory in a new tab and clicks "Claim" for you.

Keep both tabs open (background is fine). You must be logged in to Twitch.

Panel buttons:

| Button | What it does |
|---|---|
| ⚙ | Settings: when to switch streams, priority channels, 160p, language and more. |
| 📜 | Event log. If something goes wrong, click "Copy" and paste the text into [Issues](https://github.com/Konrik/twitch-gta6-drops/issues). |
| ⏹ Stop | Turn the script off in this tab. |
| EN / RU | Switch the language. It changes at once in all open Twitch tabs. |
| vX.Y | The version. Click to check for updates and see what's new. |

The tab title shows the state: 🟢 Farming, 🟡 Waiting, 🔎 Searching, 🎁 Rewards (N).

## Language

By default the script uses your Twitch language: Russian Twitch gives a Russian script,
any other language gives English. To switch by hand, click **EN / RU** on the panel or use
⚙ → "🌐 Language / Язык" (you can set it back to "Auto" there). Each log entry is written in
the language that was on at that moment.

## Updates

- Tampermonkey checks GitHub for a new version by itself (once a day by default) and installs it.
- The script also checks GitHub every 6 hours. When a new version is out, a yellow
  **"⬆ vX.Y"** button appears on the panel. Click it, then "⬆ Install", then "Update" in Tampermonkey.
- Open auto-watch tabs restart on the new version by themselves (you can turn this off in ⚙).
- To check by hand: click the version on the panel → "🔍 Check now".
  Or in Tampermonkey: Dashboard → select the script → "Check for updates".

The changelog is in [CHANGELOG.en.md](CHANGELOG.en.md).

## Development

The whole script is one file, [`twitch-gta6-drops.user.js`](twitch-gta6-drops.user.js), with no build step.
All interface and log texts are in the `STR` dictionary (`ru` and `en` sections). When you add
a text, add it to both sections.

Tampermonkey updates a script only when **`@version` goes up**. So for every change:

```sh
node tools/bump.mjs 2.6      # bumps the version in both places in the code, adds a section to both changelogs
# write what changed in CHANGELOG.md and CHANGELOG.en.md
node tools/check.mjs         # checks syntax, versions, both changelogs, update links, the dictionary
git commit -am "2.6: ..." && git push
```

GitHub runs the same `check.mjs` on every push. It also fails if the script file changed but
the version did not go up.

The raw link without a commit hash always serves the latest version from the `main` branch.
GitHub caches it for up to 5 minutes, so a new version does not show up instantly.
