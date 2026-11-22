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

Panel buttons (hover over any of them for a hint):

| Button | What it does |
|---|---|
| 🎁 | Open reward claiming in a new tab. |
| ⚙ | Settings: when to switch streams, priority channels, 160p, language and more. |
| 📜 | Event log. If something goes wrong, click "Copy" and paste the text into [Issues](https://github.com/Konrik/twitch-gta6-drops/issues). |
| ⏹ | Turn the script off in this tab. |
| EN / RU | Switch the language. It changes at once in all open Twitch tabs. |
| vX.Y | The version. Click to check for updates and see what's new. |
| – | Collapse the panel to a state icon. Click the icon to expand it again. |

The panel is semi-transparent and fades in when you hover over it. You can **drag it with the mouse**
anywhere on the screen. The position is saved, and the settings and log windows open next to it.

The collapsed panel shows the state: 👀✔ watching, 👀⏳ waiting (the stream ended or the game changed),
👀🔎 searching for a stream, 🎁 N — rewards claimed. The tab title shows the same:
🟢 Farming, 🟡 Waiting, 🔎 Searching, 🎁 Rewards (N).

## Language

By default the script uses your Twitch language: Russian Twitch gives a Russian script,
any other language gives English. To switch by hand, click **EN / RU** on the panel or use
⚙ → "🌐 Language / Язык" (you can set it back to "Auto" there). Each log entry is written in
the language that was on at that moment.

## Updates

Updates arrive **right after you reload the page**. Tampermonkey holds a small loader, and the
loader downloads the script itself from GitHub every time you open Twitch. GitHub caches the file
for about a minute, so a minute after a new version is out, it already works.

- Open tabs check for a new version every 15 minutes. When one is out, a yellow **"⬆ vX.Y"**
  button appears on the panel, and watch and reward tabs restart on it by themselves
  (you can turn this off in ⚙).
- If GitHub is down, the last working copy saved in the browser runs. If the new version on
  GitHub turns out to be broken, the saved copy runs as well.
- To check by hand: click the version on the panel → "🔍 Check now". The window also shows
  where the code came from: GitHub or the saved copy.
- The loader itself rarely changes. When a new one is out, Tampermonkey installs it by itself
  (once a day), and the "⬆ Updates" window shows an "Update the loader" button.

The changelog is in [CHANGELOG.en.md](CHANGELOG.en.md).

## Development

Two files, no build step:

- [`twitch-gta6-drops.user.js`](twitch-gta6-drops.user.js) — the **loader** that goes into Tampermonkey.
  It downloads the main code from GitHub, keeps the last working copy and runs it when GitHub is down.
- [`gta6-drops.core.js`](gta6-drops.core.js) — the **main code**: everything the script does.
  All interface and log texts are in the `STR` dictionary (`ru` and `en` sections). When you add
  a text, add it to both sections.

Every push to `main` reaches everyone at once. So check before you push and bump the version —
open tabs use it to know they must restart:

```sh
node tools/bump.mjs 3.1          # bumps the main code version, adds a section to both changelogs
# write what changed in CHANGELOG.md and CHANGELOG.en.md
node tools/check.mjs             # checks syntax, versions, both changelogs, links, the dictionary
git commit -am "3.1: ..." && git push
```

If you changed the loader itself, bump its version too: `node tools/bump.mjs --loader 3.1`
(otherwise Tampermonkey will not update it).

GitHub runs the same `check.mjs` on every push. It also fails if a file changed but its version
did not go up.
