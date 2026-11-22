// ==UserScript==
// @name         Twitch GTA VI Drops — автопросмотр
// @name:en      Twitch GTA VI Drops — auto-watch
// @namespace    gta6-drops
// @version      2.6
// @description  Держит вкладку на живом стриме GTA VI (с дропсами), сам переключает канал, если стрим закончился или стример сменил игру. Во второй вкладке — автосбор наград в инвентаре.
// @description:en Keeps a tab on a live GTA VI stream with drops and switches channels when the stream ends or the streamer changes game. A second tab can auto-claim rewards in the inventory.
// @homepageURL  https://github.com/Konrik/twitch-gta6-drops
// @supportURL   https://github.com/Konrik/twitch-gta6-drops/issues
// @updateURL    https://raw.githubusercontent.com/Konrik/twitch-gta6-drops/main/twitch-gta6-drops.user.js
// @downloadURL  https://raw.githubusercontent.com/Konrik/twitch-gta6-drops/main/twitch-gta6-drops.user.js
// @match        https://www.twitch.tv/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

/*
  КАК ПОЛЬЗОВАТЬСЯ:
  На любой странице Twitch слева внизу есть кнопка «🎮 GTA6». Нажми её и выбери:
    👀 Смотреть в этой вкладке   — вкладка сама держит живой стрим GTA VI с дропсами
    🎁 Награды в новой вкладке   — открывает инвентарь в новой вкладке и сразу
                                    начинает там автосбор наград
  Кнопка «⏹ Стоп» выключает скрипт в этой вкладке.
  Режим запоминается для вкладки, пока она открыта. Другие вкладки Twitch скрипт не трогает.
  Кнопка EN / RU на плашке переключает язык (или ⚙ → «Язык»).

  ОБНОВЛЕНИЯ: Tampermonkey сам скачивает новую версию с GitHub (раз в сутки).
  Кнопка с версией на плашке (vX.Y) — проверить обновление сейчас и посмотреть, что нового.
  Скрипт и сам проверяет GitHub раз в 6 часов и подсвечивает «⬆», если вышла новая версия.

  ДЛЯ РАЗРАБОТКИ: версия указана в двух местах — @version в шапке и запасное значение
  в константе VERSION. Меняй обе сразу: node tools/bump.mjs 2.5
  (заодно добавит раздел в CHANGELOG.md и CHANGELOG.en.md).
  Все тексты интерфейса и журнала — в словаре STR (ru / en).
*/

(function () {
  'use strict';

  // ======= НАСТРОЙКИ ПО УМОЛЧАНИЮ (меняются кнопкой ⚙ на плашке) =======
  const DEFAULTS = {
    categorySlug: 'grand-theft-auto-vi',            // адрес категории (скрипт сам уточнит его по первому стриму)
    tickSec: 10,                                    // как часто проверять
    switchAfterSec: 120,                            // сколько ждать, прежде чем переключиться (на случай краша/рекламы)
    skipBadChannelMin: 20,                          // не возвращаться на «плохой» канал столько минут
    avoidChannels: [],                              // каналы, которые не открывать
    priorityChannels: [],                           // смотреть в первую очередь (по порядку), если стримят GTA VI
    preferFollowed: true,                           // искать стрим сначала среди фолловов
    switchToFollowed: true,                         // уходить с обычного стрима на фоллова, когда тот начал GTA VI
    preferCheckMin: 2,                              // как часто проверять приоритетных/фолловов во время просмотра
    dropsOnly: false,                               // true = только стримы с дропсами, без запасного варианта
    lowQuality: false,                              // true = 160p (экономит трафик/ресурсы; дропсы всё равно капают)
    inventoryReloadMin: 10,                         // как часто обновлять инвентарь
    updateCheck: true,                              // сам проверять обновления скрипта на GitHub
    updateReload: true,                             // перезапускать вкладку с автопросмотром, когда установлена новая версия
    lang: 'auto',                                   // язык: 'auto' (как у Twitch/браузера), 'ru', 'en'
  };
  const SETTINGS_KEY = 'gta6auto_settings';
  // Версия берётся из шапки скрипта (Tampermonkey), запасное значение — на всякий случай
  const VERSION = (() => {
    try { if (typeof GM_info !== 'undefined' && GM_info.script && GM_info.script.version) return GM_info.script.version; } catch (e) {}
    return '2.6';
  })();
  // Откуда брать обновления (raw-ссылка без хеша коммита — всегда последняя версия из ветки main)
  const REPO = 'Konrik/twitch-gta6-drops';
  const REPO_URL = 'https://github.com/' + REPO;
  const RAW_BASE = 'https://raw.githubusercontent.com/' + REPO + '/main/';
  const SCRIPT_URL = RAW_BASE + 'twitch-gta6-drops.user.js';
  const CHANGELOG_FILE = { ru: 'CHANGELOG.md', en: 'CHANGELOG.en.md' };
  const readSettings = () => { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); } catch (e) { return {}; } };
  const CFG = Object.assign({}, DEFAULTS, readSettings());
  CFG.categoryNames = ['grand theft auto vi', 'gta vi', 'gta 6'];
  // =====================================================================

  // ---------- язык (RU / EN) ----------
  function lang() {
    if (CFG.lang === 'ru' || CFG.lang === 'en') return CFG.lang;
    // auto: язык интерфейса Twitch, иначе язык браузера
    const l = (document.documentElement && document.documentElement.lang) || navigator.language || '';
    return /^(ru|uk|be|kk)/i.test(l) ? 'ru' : 'en';
  }
  const locale = () => (lang() === 'ru' ? 'ru-RU' : 'en-GB');
  const short = (u) => u.replace('https://www.twitch.tv', '');

  const STR = {
    ru: {
      // плашка и меню
      starting: 'запускаю…',
      claimTabTitle: 'Открыть сбор наград в новой вкладке',
      stopTitle: 'Остановить скрипт в этой вкладке',
      collapse: 'Свернуть',
      expand: 'Нажми, чтобы развернуть',
      closeMenu: 'Закрыть меню',
      dragHint: '\nПлашку можно перетащить мышкой куда угодно',
      claimHere: '🎁 Собирать награды здесь',
      watchHere: '👀 Смотреть в этой вкладке',
      claimNewTab: '🎁 Награды в новой вкладке',
      mainTitle: 'Автопросмотр дропсов GTA VI',
      logTitle: 'Журнал событий',
      settingsTitle: 'Настройки',
      langBtn: 'EN',
      langBtnTitle: 'Switch to English',
      // журнал
      logsHead: (v) => `📜 Журнал GTA6 автопросмотра · v${v} (все вкладки, последние 500 записей)`,
      logsEmpty: 'Пока пусто',
      copy: '📋 Копировать',
      copyHead: (v) => 'GTA6 автопросмотр v' + v,
      copied: '✔ Скопировано',
      close: '✕ Закрыть',
      clear: '🗑 Очистить',
      clearAsk: 'Точно очистить весь журнал? Это нельзя отменить.',
      clearYes: 'Да, очистить',
      cancel: 'Отмена',
      cleared: 'Журнал очищен',
      // настройки
      settingsHead: (v) => '⚙ Настройки GTA6 автопросмотра · v' + v,
      f_lang: '🌐 Язык / Language',
      lang_auto: 'Авто (как в Twitch)',
      f_switchAfterSec: 'Переключать стрим через, сек',
      f_tickSec: 'Проверять стрим каждые, сек',
      f_skipBadChannelMin: 'Не возвращаться на ушедший канал, мин',
      f_inventoryReloadMin: 'Обновлять инвентарь каждые, мин',
      f_dropsOnly: 'Только стримы с дропсами (без запасного варианта)',
      f_lowQuality: 'Низкое качество 160p (меньше трафика)',
      f_priorityChannels: '⭐ Приоритетные каналы по порядку (через запятую)',
      f_preferFollowed: '❤ Сначала искать среди фолловов',
      f_switchToFollowed: '❤ Уходить на фоллова, когда он начал GTA VI',
      f_preferCheckMin: 'Проверять ⭐/❤ во время просмотра каждые, мин',
      f_avoidChannels: 'Не открывать каналы (через запятую)',
      f_categorySlug: 'Адрес категории на Twitch',
      f_updateCheck: '⬆ Проверять обновления скрипта (раз в 6 ч)',
      f_updateReload: '⬆ Перезапускать вкладку автопросмотра на новую версию',
      save: '💾 Сохранить',
      saved: '✔ Сохранено (действует во всех вкладках, в других — после обновления)',
      logSaved: '⚙ настройки сохранены',
      reset: '↺ Сбросить по умолчанию',
      resetDone: '↺ Настройки сброшены по умолчанию',
      logReset: '⚙ настройки сброшены по умолчанию',
      updatesBtn: '⬆ Обновления',
      logLang: (l) => '🌐 язык: ' + (l === 'ru' ? 'русский' : 'английский'),
      // обновления
      ghTimeout: 'GitHub не ответил за 10 с',
      noVersionLine: 'в файле на GitHub нет строки @version',
      logNewOnGh: (n, v) => `⬆ на GitHub есть v${n} (в этой вкладке v${v})`,
      whyGh: (n) => 'на GitHub вышла v' + n,
      whyOtherTab: (n) => 'в другой вкладке уже работает v' + n,
      logNoUpdates: (v) => `✔ обновлений нет, v${v} — последняя`,
      logCheckFail: (e) => '⚠ не удалось проверить обновления: ' + e,
      logUpdated: (a, b) => `✨ скрипт обновлён: v${a} → v${b}`,
      logReloading: (n, why) => `🔄 перезапускаю вкладку на v${n} (${why})`,
      logInstallOpened: '⬆ открыл установку новой версии с GitHub',
      updHead: (v) => '⬆ Обновления GTA6 автопросмотра · у тебя v' + v,
      install: '⬆ Установить',
      installVer: (n) => '⬆ Установить v' + n,
      installHint: 'В открывшейся вкладке Tampermonkey нажми «Обновить», потом вернись сюда и нажми ' +
        '«🔄 Перезапустить вкладку». Остальные вкладки с автопросмотром перезапустятся на новую версию сами.',
      restartTab: '🔄 Перезапустить вкладку',
      logRestarted: '🔄 вкладка перезапущена кнопкой',
      checkNow: '🔍 Проверить сейчас',
      stInstalled: (n) => `✔ v${n} уже установлена. Перезапусти вкладку, чтобы она заработала здесь.`,
      stNew: (n, v) => `⬆ Вышла v${n} (у тебя v${v}).`,
      stLatest: (v) => `✔ У тебя последняя версия — v${v}.`,
      stNever: 'Ещё не проверял.',
      checkFailedAt: (t, e) => `⚠ Не удалось проверить (${t}): ${e}`,
      checkedAt: (t) => 'Проверено: ' + t,
      autoCheckOff: ' · автопроверка выключена в ⚙',
      whatsNew: 'Что нового:',
      whatsNewThis: 'Что нового в этой версии:',
      changelogLink: (u) => 'Список изменений: ' + u,
      checking: '🔍 Проверяю GitHub…',
      verTitle: 'Проверить обновления',
      verRestart: (n) => `🔄 v${n} — перезапусти`,
      verRestartTitle: 'Новая версия установлена — перезапусти вкладку',
      verNewTitle: 'Вышла новая версия — нажми, чтобы обновить',
      verUpdatedTitle: (a) => 'Скрипт обновлён с v' + a + ' — нажми, чтобы посмотреть, что нового',
      // переходы
      logNav: (u, why) => '➡ переход: ' + short(u) + (why ? ' — ' + why : ''),
      logNavStuck: (s, n, u) => `⚠ переход не случился за ${s} с (попытка ${n}): ${u ? short(u) : 'ждал ответа Twitch'}`,
      logReloadTab: '⚠ перезагружаю вкладку',
      logWatchOn: '▶ включён автопросмотр',
      logClaimOn: '▶ включён сбор наград',
      openingInv: 'открываю инвентарь…',
      whyClaim: 'сбор наград',
      logStopped: '⏹ скрипт остановлен кнопкой',
      // поиск стрима
      notLoggedIn: 'не вошёл в аккаунт',
      twitchTimeout: 'Twitch не ответил за 10 с',
      logPriFail: 'проверка приоритетных не удалась:',
      logFolFail: 'проверка фолловов через API не удалась:',
      switchingTo: (l) => 'переключаюсь на ' + l,
      whyPicked: (l) => 'выбран канал ' + l,
      tagSearch: '🔎 Ищу',
      searching: 'ищу: ⭐ приоритетные → ❤ фолловы → категория…',
      whyFolApi: 'API фолловов не ответил, ищу на странице подписок',
      whyNoPref: 'у ⭐/❤ нет GTA VI — общий каталог',
      logUpgrade: (lbl, b, ch) => `${lbl} ${b} начал GTA VI — ухожу с ${ch}`,
      checkingPref: 'проверяю ⭐ приоритетных и ❤ фолловов…',
      searchingFol: (s) => `ищу GTA VI у фолловов… ${s}с`,
      whyNoFol: 'у фолловов нет GTA VI',
      searchingCat: (s) => `ищу стрим в категории… ${s}с`,
      whyDirEmpty: 'в каталоге за 60 с не нашлось стримов',
      // текущий канал
      logApiBack: '✔ API Twitch снова отвечает',
      logApiDown: (e) => '⚠ API Twitch не отвечает (' + e + '), проверяю по странице',
      notOnChannel: 'не на канале — ищу стрим',
      offline: 'оффлайн',
      notGta: (g) => 'не GTA VI (' + g + ')',
      videoStuck: 'видео зависло',
      tagStart: '🔎 Старт',
      loading: (ch) => ch + ' — загружается…',
      srcApi: 'по данным Twitch',
      srcPage: 'по странице',
      logAd: (ch) => `${ch}: реклама`,
      logProblem: (ch, p, src) => `${ch}: ${p} (${src})`,
      logOk: (ch, src) => `${ch}: смотрю, всё ок (${src})`,
      tagFarm: '🟢 Фарм',
      adWait: 'реклама, жду',
      watching: 'смотрю ✔',
      tagWait: '🟡 Жду',
      switchIn: (ch, p, s) => `${ch} — ${p}, переключусь через ${s}с`,
      logLeave: (ch, p, s) => `↪ ухожу с ${ch}: ${p} уже ${s} с`,
      // награды
      whyClaimLeft: 'вкладка наград ушла с инвентаря',
      logClicked: (b, n) => `🎁 нажал «${b}», всего: ${n}`,
      tagRewards: (n) => `🎁 Награды (${n})`,
      claimStatus: (n, m) => `инвентарь · нажато «Получить»: ${n} · обновлю через ${m} мин`,
      logError: '⚠ ошибка в скрипте:',
      logLoaded: (v, p) => `страница загружена (v${v}): ${p}`,
    },
    en: {
      starting: 'starting…',
      claimTabTitle: 'Open reward claiming in a new tab',
      stopTitle: 'Stop the script in this tab',
      collapse: 'Collapse',
      expand: 'Click to expand',
      closeMenu: 'Close menu',
      dragHint: '\nDrag the panel with the mouse to move it anywhere',
      claimHere: '🎁 Claim rewards here',
      watchHere: '👀 Watch in this tab',
      claimNewTab: '🎁 Rewards in a new tab',
      mainTitle: 'GTA VI drops auto-watch',
      logTitle: 'Event log',
      settingsTitle: 'Settings',
      langBtn: 'RU',
      langBtnTitle: 'Переключить на русский',
      logsHead: (v) => `📜 GTA6 auto-watch log · v${v} (all tabs, last 500 entries)`,
      logsEmpty: 'Empty so far',
      copy: '📋 Copy',
      copyHead: (v) => 'GTA6 auto-watch v' + v,
      copied: '✔ Copied',
      close: '✕ Close',
      clear: '🗑 Clear',
      clearAsk: 'Clear the whole log? This cannot be undone.',
      clearYes: 'Yes, clear',
      cancel: 'Cancel',
      cleared: 'Log cleared',
      settingsHead: (v) => '⚙ GTA6 auto-watch settings · v' + v,
      f_lang: '🌐 Language / Язык',
      lang_auto: 'Auto (Twitch language)',
      f_switchAfterSec: 'Switch stream after, sec',
      f_tickSec: 'Check the stream every, sec',
      f_skipBadChannelMin: 'Do not return to a left channel for, min',
      f_inventoryReloadMin: 'Reload inventory every, min',
      f_dropsOnly: 'Only streams with drops (no fallback)',
      f_lowQuality: 'Low quality 160p (less traffic)',
      f_priorityChannels: '⭐ Priority channels in order (comma-separated)',
      f_preferFollowed: '❤ Look among followed channels first',
      f_switchToFollowed: '❤ Switch to a followed channel when it starts GTA VI',
      f_preferCheckMin: 'Check ⭐/❤ while watching every, min',
      f_avoidChannels: 'Never open these channels (comma-separated)',
      f_categorySlug: 'Twitch category slug',
      f_updateCheck: '⬆ Check for script updates (every 6 h)',
      f_updateReload: '⬆ Restart the watch tab on a new version',
      save: '💾 Save',
      saved: '✔ Saved (applies to all tabs; other tabs after reload)',
      logSaved: '⚙ settings saved',
      reset: '↺ Reset to defaults',
      resetDone: '↺ Settings reset to defaults',
      logReset: '⚙ settings reset to defaults',
      updatesBtn: '⬆ Updates',
      logLang: (l) => '🌐 language: ' + (l === 'ru' ? 'Russian' : 'English'),
      ghTimeout: 'GitHub did not respond in 10 s',
      noVersionLine: 'no @version line in the file on GitHub',
      logNewOnGh: (n, v) => `⬆ v${n} is on GitHub (this tab runs v${v})`,
      whyGh: (n) => 'v' + n + ' released on GitHub',
      whyOtherTab: (n) => 'v' + n + ' already runs in another tab',
      logNoUpdates: (v) => `✔ no updates, v${v} is the latest`,
      logCheckFail: (e) => '⚠ update check failed: ' + e,
      logUpdated: (a, b) => `✨ script updated: v${a} → v${b}`,
      logReloading: (n, why) => `🔄 restarting tab on v${n} (${why})`,
      logInstallOpened: '⬆ opened the new version install page on GitHub',
      updHead: (v) => '⬆ GTA6 auto-watch updates · you have v' + v,
      install: '⬆ Install',
      installVer: (n) => '⬆ Install v' + n,
      installHint: 'In the Tampermonkey tab that opened, click "Update", then come back here and click ' +
        '"🔄 Restart tab". Other auto-watch tabs will restart on the new version by themselves.',
      restartTab: '🔄 Restart tab',
      logRestarted: '🔄 tab restarted by button',
      checkNow: '🔍 Check now',
      stInstalled: (n) => `✔ v${n} is already installed. Restart this tab to run it here.`,
      stNew: (n, v) => `⬆ v${n} is out (you have v${v}).`,
      stLatest: (v) => `✔ You have the latest version — v${v}.`,
      stNever: 'Not checked yet.',
      checkFailedAt: (t, e) => `⚠ Check failed (${t}): ${e}`,
      checkedAt: (t) => 'Checked: ' + t,
      autoCheckOff: ' · auto-check is off in ⚙',
      whatsNew: "What's new:",
      whatsNewThis: "What's new in this version:",
      changelogLink: (u) => 'Changelog: ' + u,
      checking: '🔍 Checking GitHub…',
      verTitle: 'Check for updates',
      verRestart: (n) => `🔄 v${n} — restart`,
      verRestartTitle: 'A new version is installed — restart this tab',
      verNewTitle: 'A new version is out — click to update',
      verUpdatedTitle: (a) => 'Updated from v' + a + " — click to see what's new",
      logNav: (u, why) => '➡ navigating: ' + short(u) + (why ? ' — ' + why : ''),
      logNavStuck: (s, n, u) => `⚠ navigation did not happen in ${s} s (try ${n}): ${u ? short(u) : 'waited for Twitch'}`,
      logReloadTab: '⚠ reloading the tab',
      logWatchOn: '▶ auto-watch on',
      logClaimOn: '▶ reward claiming on',
      openingInv: 'opening inventory…',
      whyClaim: 'reward claiming',
      logStopped: '⏹ script stopped by button',
      notLoggedIn: 'not logged in',
      twitchTimeout: 'Twitch did not respond in 10 s',
      logPriFail: 'priority channel check failed:',
      logFolFail: 'followed channels API check failed:',
      switchingTo: (l) => 'switching to ' + l,
      whyPicked: (l) => 'picked channel ' + l,
      tagSearch: '🔎 Searching',
      searching: 'searching: ⭐ priority → ❤ followed → category…',
      whyFolApi: 'followed API did not answer, checking the Following page',
      whyNoPref: 'no GTA VI among ⭐/❤ — category directory',
      logUpgrade: (lbl, b, ch) => `${lbl} ${b} started GTA VI — leaving ${ch}`,
      checkingPref: 'checking ⭐ priority and ❤ followed channels…',
      searchingFol: (s) => `looking for GTA VI among followed… ${s}s`,
      whyNoFol: 'no followed channel streams GTA VI',
      searchingCat: (s) => `searching the category… ${s}s`,
      whyDirEmpty: 'no streams found in the directory in 60 s',
      logApiBack: '✔ Twitch API responds again',
      logApiDown: (e) => '⚠ Twitch API not responding (' + e + '), using the page',
      notOnChannel: 'not on a channel — searching',
      offline: 'offline',
      notGta: (g) => 'not GTA VI (' + g + ')',
      videoStuck: 'video froze',
      tagStart: '🔎 Start',
      loading: (ch) => ch + ' — loading…',
      srcApi: 'per Twitch API',
      srcPage: 'per page',
      logAd: (ch) => `${ch}: ad`,
      logProblem: (ch, p, src) => `${ch}: ${p} (${src})`,
      logOk: (ch, src) => `${ch}: watching, all OK (${src})`,
      tagFarm: '🟢 Farming',
      adWait: 'ad, waiting',
      watching: 'watching ✔',
      tagWait: '🟡 Waiting',
      switchIn: (ch, p, s) => `${ch} — ${p}, switching in ${s}s`,
      logLeave: (ch, p, s) => `↪ leaving ${ch}: ${p} for ${s} s`,
      whyClaimLeft: 'reward tab left the inventory',
      logClicked: (b, n) => `🎁 clicked "${b}", total: ${n}`,
      tagRewards: (n) => `🎁 Rewards (${n})`,
      claimStatus: (n, m) => `inventory · "Claim" clicked: ${n} · reload in ${m} min`,
      logError: '⚠ script error:',
      logLoaded: (v, p) => `page loaded (v${v}): ${p}`,
    },
  };
  // tr('ключ', ...аргументы) — текст на текущем языке (если перевода нет — русский)
  function tr(key, ...args) {
    const d = key in STR[lang()] ? STR[lang()][key] : STR.ru[key];
    return typeof d === 'function' ? d(...args) : (d === undefined ? key : d);
  }

  const MODE_KEY = 'gta6auto_mode';
  const h = location.hash;
  // Вкладка, открытая кнопкой 🎁, приходит с #gta6-claim и сразу начинает сбор наград
  const freshTab = false;
  if (h.includes('gta6-watch')) sessionStorage.setItem(MODE_KEY, 'watch');
  if (h.includes('gta6-claim')) sessionStorage.setItem(MODE_KEY, 'claim');
  if (h.includes('gta6-stop')) sessionStorage.removeItem(MODE_KEY);
  let mode = sessionStorage.getItem(MODE_KEY);
  if (/gta6-(watch|claim|stop)/.test(h)) {
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
  }

  // 160p: ставим своё значение качества, а при выключении убираем только то, что поставили сами
  function applyQuality() {
    try {
      if (CFG.lowQuality) {
        localStorage.setItem('video-quality', JSON.stringify({ default: '160p30' }));
        localStorage.setItem('gta6auto_lq', '1');
      } else if (localStorage.getItem('gta6auto_lq')) {
        localStorage.removeItem('video-quality');
        localStorage.removeItem('gta6auto_lq');
      }
    } catch (e) {}
  }
  if (mode === 'watch') applyQuality();

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  // ---------- журнал событий (хранится в браузере, последние 500 записей) ----------
  const LOG_KEY = 'gta6auto_log';
  function log(...a) {
    console.log('[GTA6]', ...a);
    try {
      const msg = a.map((x) => typeof x === 'string' ? x : (x instanceof Error ? x.message : JSON.stringify(x))).join(' ');
      const arr = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
      arr.push([Date.now(), sessionStorage.getItem(MODE_KEY) || '-', msg.slice(0, 300)]);
      if (arr.length > 500) arr.splice(0, arr.length - 500);
      localStorage.setItem(LOG_KEY, JSON.stringify(arr));
    } catch (e) {}
  }

  // ---------- переходы между страницами со сторожем ----------
  // Если переход «завис» (страница не меняется 25 с) — останавливаем загрузку и пробуем снова.
  let navigating = false, navAt = 0, navUrl = '', navTries = 0;
  function nav(url, why) {
    navigating = true;
    navAt = Date.now();
    navUrl = url;
    log(tr('logNav', url, why));
    location.href = url;
  }
  function navWatchdog() {
    if (!navigating || !navAt) return;
    const waited = Math.round((Date.now() - navAt) / 1000);
    if (waited < 25) return;
    navTries++;
    log(tr('logNavStuck', waited, navTries, navUrl));
    try { window.stop(); } catch (e) {}
    navAt = Date.now();
    if (!navUrl) { navigating = false; return; }          // завис запрос к API — просто начнём поиск заново
    if (navTries >= 4) { log(tr('logReloadTab')); location.reload(); return; }
    if (navTries >= 2) { location.replace(navUrl); return; }
    location.assign(navUrl);
  }

  const slug = () => { try { return localStorage.getItem('gta6auto_slug') || CFG.categorySlug; } catch (e) { return CFG.categorySlug; } };
  const dirUrl = (drops) =>
    `https://www.twitch.tv/directory/category/${slug()}?sort=VIEWER_COUNT${drops ? '&tl=DropsEnabled' : ''}`;

  let timer = null;
  let menuOpen = freshTab; // в новой вкладке сразу показываем кнопку запуска
  let lastStatus = null;   // [ключ, ...аргументы] — чтобы статус перерисовывался на новом языке

  // ---------- панель с кнопками ----------
  const BTN_CSS =
    'background:#fff;color:#5c16c5;border:0;border-radius:4px;padding:4px 8px;margin-left:6px;' +
    'font:600 12px sans-serif;cursor:pointer';

  function mkBtn(label, onClick) {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = BTN_CSS;
    b.onclick = (e) => { e.stopPropagation(); onClick(); };
    return b;
  }

  // Плашка: компактные кнопки-иконки, полупрозрачная, пока на неё не навели мышь (плавно),
  // её можно перетащить куда угодно и свернуть до одного значка.
  const PANEL_CSS = `
    #gta6-panel{position:fixed;z-index:999999;display:flex;align-items:center;gap:1px;padding:3px;
      background:#9147ff;color:#fff;font:12px/1.2 sans-serif;border-radius:8px;white-space:nowrap;
      box-shadow:0 2px 8px rgba(0,0,0,.4);opacity:.45;transition:opacity .3s ease;
      user-select:none;touch-action:none;cursor:grab;max-width:calc(100vw - 8px)}
    #gta6-panel:hover,#gta6-panel.g6-drag{opacity:1}
    #gta6-panel.g6-drag{cursor:grabbing;transition:none}
    #gta6-panel .g6b{background:transparent;color:#fff;border:0;border-radius:5px;padding:3px 5px;margin:0;
      font:13px/1 sans-serif;cursor:pointer;flex:none}
    #gta6-panel .g6b:hover{background:rgba(255,255,255,.22)}
    #gta6-panel .g6b:disabled{opacity:.5}
    #gta6-panel .g6txt{font:700 11px/1 sans-serif;padding:4px 5px}
    #gta6-panel .g6v{font:10px/1 sans-serif;opacity:.75;padding:4px 4px}
    #gta6-panel .g6v.g6up{background:#ffd34d;color:#000;opacity:1;font-weight:700}
    #gta6-panel .g6s{max-width:200px;overflow:hidden;text-overflow:ellipsis;padding:0 4px 0 2px}
    #gta6-panel .g6sep{width:1px;height:14px;background:rgba(255,255,255,.35);margin:0 3px;flex:none}
    #gta6-panel .g6chip{font-size:14px;padding:3px 6px}`;
  // Пока открыто окно скрипта — плашка непрозрачная (отдельным правилом: старые браузеры не знают :has)
  const PANEL_CSS_HOLD = 'body:has(#gta6-logs,#gta6-settings,#gta6-update) #gta6-panel{opacity:1}';
  function ensureStyle() {
    if (document.getElementById('gta6-style')) return;
    const s = document.createElement('style');
    s.id = 'gta6-style';
    s.textContent = PANEL_CSS + '\n' + PANEL_CSS_HOLD;
    (document.head || document.documentElement).appendChild(s);
  }
  function iconBtn(label, title, onClick, cls) {
    const b = document.createElement('button');
    b.className = 'g6b' + (cls ? ' ' + cls : '');
    b.textContent = label;
    if (title) b.title = title;
    b.onclick = (e) => { e.stopPropagation(); onClick(); };
    return b;
  }
  function sep() { const s = document.createElement('span'); s.className = 'g6sep'; return s; }

  // ---------- положение плашки (общее для всех вкладок) ----------
  // Храним расстояние до ближайших краёв окна, чтобы плашка «прилипала» к своему углу
  // и при разворачивании росла внутрь экрана, а не за его край.
  const POS_KEY = 'gta6auto_pos';
  const MIN_KEY = 'gta6auto_min';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function getPos() {
    try { const p = JSON.parse(localStorage.getItem(POS_KEY) || 'null'); if (p && p.h && p.v) return p; } catch (e) {}
    return { h: 'left', x: 12, v: 'bottom', y: 12 };
  }
  function applyPos(el) {
    if (el.classList.contains('g6-drag')) return;
    const p = getPos();
    const w = el.offsetWidth, hh = el.offsetHeight;
    const x = clamp(p.x, 0, Math.max(0, innerWidth - w)), y = clamp(p.y, 0, Math.max(0, innerHeight - hh));
    el.style.left = p.h === 'left' ? x + 'px' : 'auto';
    el.style.right = p.h === 'right' ? x + 'px' : 'auto';
    el.style.top = p.v === 'top' ? y + 'px' : 'auto';
    el.style.bottom = p.v === 'bottom' ? y + 'px' : 'auto';
  }
  function savePos(r) {
    const h = r.left + r.width / 2 < innerWidth / 2 ? 'left' : 'right';
    const v = r.top + r.height / 2 < innerHeight / 2 ? 'top' : 'bottom';
    const p = {
      h, x: Math.round(h === 'left' ? r.left : innerWidth - r.right),
      v, y: Math.round(v === 'top' ? r.top : innerHeight - r.bottom),
    };
    try { localStorage.setItem(POS_KEY, JSON.stringify(p)); } catch (e) {}
  }
  // Перетаскивание за любое место плашки (и за кнопки тоже: короткое нажатие — клик, сдвиг на 5+ px — перенос)
  let justDragged = false;
  function enableDrag(el) {
    let st = null, moved = false;
    // Движение мыши слушаем на всей странице: при быстром рывке курсор уходит с плашки
    // раньше, чем мы поймём, что это перетаскивание
    const move = (e) => {
      if (!st) return;
      const dx = e.clientX - st.x, dy = e.clientY - st.y;
      if (!moved && Math.hypot(dx, dy) < 5) return;
      if (!moved) { moved = true; el.classList.add('g6-drag'); }
      e.preventDefault();
      el.style.left = clamp(st.l + dx, 0, innerWidth - el.offsetWidth) + 'px';
      el.style.top = clamp(st.t + dy, 0, innerHeight - el.offsetHeight) + 'px';
      el.style.right = el.style.bottom = 'auto';
      placeOpenWindow();
    };
    const end = () => {
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', end, true);
      window.removeEventListener('pointercancel', end, true);
      if (!st) return;
      if (moved) {
        savePos(el.getBoundingClientRect());
        el.classList.remove('g6-drag');
        applyPos(el);
        placeOpenWindow();
        justDragged = true;
        setTimeout(() => { justDragged = false; }, 100);
      }
      st = null;
    };
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const r = el.getBoundingClientRect();
      st = { x: e.clientX, y: e.clientY, l: r.left, t: r.top };
      moved = false;
      window.addEventListener('pointermove', move, true);
      window.addEventListener('pointerup', end, true);
      window.addEventListener('pointercancel', end, true);
    });
    // после переноса не считаем отпускание мыши кликом по кнопке
    el.addEventListener('click', (e) => { if (justDragged) { e.stopPropagation(); e.preventDefault(); justDragged = false; } }, true);
  }

  function panel() {
    if (!document.body) return null;
    ensureStyle();
    let el = document.getElementById('gta6-panel');
    if (!el) {
      el = document.createElement('div');
      el.id = 'gta6-panel';
      document.body.appendChild(el);
      enableDrag(el);
    }
    return el;
  }

  // Окна (журнал, настройки, обновления) открываются рядом с плашкой, где бы она ни стояла
  function placeWindow(box) {
    const p = document.getElementById('gta6-panel');
    if (!p || !box) return;
    const r = p.getBoundingClientRect(), W = innerWidth, H = innerHeight, gap = 6;
    Object.assign(box.style, { left: 'auto', right: 'auto', top: 'auto', bottom: 'auto', overflowY: 'auto', boxSizing: 'border-box' });
    if (r.top + r.height / 2 > H / 2) {
      box.style.bottom = (H - r.top + gap) + 'px';
      box.style.maxHeight = Math.max(160, r.top - gap - 8) + 'px';
    } else {
      box.style.top = (r.bottom + gap) + 'px';
      box.style.maxHeight = Math.max(160, H - r.bottom - gap - 8) + 'px';
    }
    const bw = box.offsetWidth;
    if (r.left + r.width / 2 < W / 2) box.style.left = clamp(r.left, 8, Math.max(8, W - 8 - bw)) + 'px';
    else box.style.right = clamp(W - r.right, 8, Math.max(8, W - 8 - bw)) + 'px';
  }
  function placeOpenWindow() {
    const id = WINDOWS.find((w) => document.getElementById(w));
    if (id) placeWindow(document.getElementById(id));
  }

  // ---------- переключение языка ----------
  function setLang(l) {
    CFG.lang = l;
    const s = readSettings();
    if (l === 'auto') delete s.lang; else s.lang = l;
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch (e) {}
    log(tr('logLang', lang()));
    relocalize();
  }
  // Перерисовать всё на новом языке: плашку, метку вкладки и открытое окно
  function relocalize() {
    const open = WINDOWS.find((id) => document.getElementById(id));
    if (tabKey) setTab(...tabKey);
    render();
    if (open) { closeWindows(); WINDOW_OPENERS[open](); }
  }
  function langBtn() {
    return iconBtn(tr('langBtn'), tr('langBtnTitle'), () => setLang(lang() === 'ru' ? 'en' : 'ru'), 'g6txt');
  }

  // ---------- окно журнала ----------
  function logBtn() {
    return iconBtn('📜', tr('logTitle'), toggleLogs);
  }
  function logText() {
    let arr = [];
    try { arr = JSON.parse(localStorage.getItem(LOG_KEY) || '[]'); } catch (e) {}
    const icon = { watch: '👀', claim: '🎁' };
    return arr.map(([t, m, msg]) => {
      const ts = new Date(t).toLocaleString(locale(), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
      return `${ts} ${icon[m] || '·'} ${msg}`;
    }).join('\n');
  }
  let logRefresh = null;
  // Одновременно открыто только одно окно (журнал / настройки / обновления)
  const WINDOWS = ['gta6-logs', 'gta6-settings', 'gta6-update'];
  const WINDOW_OPENERS = { 'gta6-logs': () => toggleLogs(), 'gta6-settings': () => toggleSettings(), 'gta6-update': () => toggleUpdate() };
  function closeWindows(except) {
    WINDOWS.forEach((id) => {
      if (id === except) return;
      const w = document.getElementById(id);
      if (w) { w.remove(); if (id === 'gta6-logs') clearInterval(logRefresh); }
    });
  }
  const anyWindowOpen = () => WINDOWS.some((id) => document.getElementById(id));
  function toggleLogs() {
    const old = document.getElementById('gta6-logs');
    if (old) { old.remove(); clearInterval(logRefresh); return; }
    closeWindows('gta6-logs');
    const box = document.createElement('div');
    box.id = 'gta6-logs';
    box.style.cssText =
      'position:fixed;bottom:56px;left:12px;z-index:1000000;background:#18181b;color:#efeff1;' +
      'font:12px/1.4 sans-serif;padding:12px;border-radius:8px;width:620px;max-width:calc(100vw - 40px);' +
      'border:1px solid #9147ff;box-shadow:0 4px 16px rgba(0,0,0,.6)';
    const title = document.createElement('div');
    title.textContent = tr('logsHead', VERSION);
    title.style.cssText = 'font-weight:700;margin-bottom:8px';
    const pre = document.createElement('pre');
    pre.style.cssText = 'margin:0;height:300px;overflow:auto;background:#0e0e10;padding:8px;border-radius:4px;' +
      'font:11px/1.45 Consolas,monospace;white-space:pre-wrap;word-break:break-word';
    const fill = () => {
      const atBottom = pre.scrollTop + pre.clientHeight >= pre.scrollHeight - 20;
      pre.textContent = logText() || tr('logsEmpty');
      if (atBottom) pre.scrollTop = pre.scrollHeight;
    };
    const note = document.createElement('span');
    note.style.cssText = 'color:#bf94ff;margin-left:6px';
    const btns = document.createElement('div');
    btns.style.cssText = 'display:flex;gap:6px;margin-top:8px;align-items:center;flex-wrap:wrap';
    const copy = mkBtn(tr('copy'), () => {
      const text = tr('copyHead', VERSION) + '\n' + logText();
      const done = () => { note.textContent = tr('copied'); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
      else fallbackCopy(text, done);
    });
    const close = mkBtn(tr('close'), () => { box.remove(); clearInterval(logRefresh); });
    const clear = mkBtn(tr('clear'), () => askClear());

    // Подтверждение очистки прямо в окне (без всплывающих окон браузера)
    const confirmRow = document.createElement('div');
    confirmRow.style.cssText = 'display:none;gap:6px;margin-top:8px;align-items:center;flex-wrap:wrap;' +
      'background:#3a1d1d;border:1px solid #e91916;border-radius:4px;padding:6px 8px';
    const q = document.createElement('span');
    q.textContent = tr('clearAsk');
    q.style.cssText = 'font-weight:600;margin-right:4px';
    const yes = mkBtn(tr('clearYes'), () => {
      try { localStorage.removeItem(LOG_KEY); } catch (e) {}
      hideConfirm(); fill(); note.textContent = tr('cleared');
    });
    yes.style.background = '#e91916'; yes.style.color = '#fff';
    const no = mkBtn(tr('cancel'), () => { hideConfirm(); note.textContent = ''; });
    [q, yes, no].forEach((b) => { b.style.marginLeft = '0'; confirmRow.appendChild(b); });
    function askClear() { btns.style.display = 'none'; confirmRow.style.display = 'flex'; note.textContent = ''; }
    function hideConfirm() { confirmRow.style.display = 'none'; btns.style.display = 'flex'; }

    [copy, clear, close].forEach((b) => { b.style.marginLeft = '0'; btns.appendChild(b); });
    btns.appendChild(note);
    box.appendChild(title); box.appendChild(pre); box.appendChild(btns); box.appendChild(confirmRow);
    document.body.appendChild(box);
    placeWindow(box);
    fill();
    pre.scrollTop = pre.scrollHeight;
    logRefresh = setInterval(() => { if (document.getElementById('gta6-logs')) fill(); else clearInterval(logRefresh); }, 2000);
  }
  function fallbackCopy(text, done) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch (e) {}
    ta.remove();
  }

  // ---------- окно настроек ----------
  function gearBtn() {
    return iconBtn('⚙', tr('settingsTitle'), toggleSettings);
  }

  // [ключ настройки, тип, минимум]; подпись — tr('f_' + ключ)
  const FIELDS = [
    ['lang', 'lang'],
    ['switchAfterSec', 'num', 20],
    ['tickSec', 'num', 2],
    ['skipBadChannelMin', 'num', 0],
    ['inventoryReloadMin', 'num', 1],
    ['dropsOnly', 'bool'],
    ['lowQuality', 'bool'],
    ['priorityChannels', 'list'],
    ['preferFollowed', 'bool'],
    ['switchToFollowed', 'bool'],
    ['preferCheckMin', 'num', 1],
    ['avoidChannels', 'list'],
    ['categorySlug', 'text'],
    ['updateCheck', 'bool'],
    ['updateReload', 'bool'],
  ];

  function toggleSettings() {
    const old = document.getElementById('gta6-settings');
    if (old) { old.remove(); return; }
    closeWindows('gta6-settings');
    const box = document.createElement('div');
    box.id = 'gta6-settings';
    box.style.cssText =
      'position:fixed;bottom:56px;left:12px;z-index:1000000;background:#18181b;color:#efeff1;' +
      'font:12px/1.4 sans-serif;padding:12px;border-radius:8px;width:340px;border:1px solid #9147ff;' +
      'box-shadow:0 4px 16px rgba(0,0,0,.6)';
    const title = document.createElement('div');
    title.textContent = tr('settingsHead', VERSION);
    title.style.cssText = 'font-weight:700;margin-bottom:8px';
    box.appendChild(title);

    const INPUT_CSS = ';background:#0e0e10;color:#fff;border:1px solid #555;border-radius:4px;padding:2px 4px';
    const inputs = {};
    for (const [key, type, min] of FIELDS) {
      const row = document.createElement('label');
      row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;margin:5px 0';
      const span = document.createElement('span');
      span.textContent = tr('f_' + key);
      let inp;
      if (type === 'lang') {
        inp = document.createElement('select');
        [['auto', tr('lang_auto')], ['ru', 'Русский'], ['en', 'English']].forEach(([v, text]) => {
          const o = document.createElement('option');
          o.value = v; o.textContent = text;
          inp.appendChild(o);
        });
        inp.value = CFG.lang === 'ru' || CFG.lang === 'en' ? CFG.lang : 'auto';
        inp.style.cssText = 'width:140px' + INPUT_CSS;
      } else {
        inp = document.createElement('input');
        if (type === 'bool') { inp.type = 'checkbox'; inp.checked = !!CFG[key]; }
        else {
          inp.type = type === 'num' ? 'number' : 'text';
          if (type === 'num') inp.min = String(min);
          inp.value = type === 'list' ? CFG[key].join(', ') : (key === 'categorySlug' ? slug() : CFG[key]);
          inp.style.cssText = 'width:' + (type === 'num' ? '60px' : '130px') + INPUT_CSS;
        }
      }
      inp.dataset.key = key;
      // Twitch ловит горячие клавиши — не даём ему перехватывать ввод
      inp.addEventListener('keydown', (e) => e.stopPropagation());
      row.appendChild(span); row.appendChild(inp);
      box.appendChild(row);
      inputs[key] = { inp, type, min };
    }

    const note = document.createElement('div');
    note.style.cssText = 'min-height:16px;margin-top:6px;color:#bf94ff';
    const btns = document.createElement('div');
    btns.style.cssText = 'display:flex;gap:6px;margin-top:6px;flex-wrap:wrap';

    const save = mkBtn(tr('save'), () => {
      const out = {};
      for (const key in inputs) {
        const { inp, type, min } = inputs[key];
        if (type === 'bool') out[key] = inp.checked;
        else if (type === 'num') out[key] = Math.max(min, Number(inp.value) || DEFAULTS[key]);
        else if (type === 'list') out[key] = inp.value.split(/[\s,]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
        else out[key] = inp.value.trim() || DEFAULTS[key];
      }
      if (out.categorySlug !== slug()) { try { localStorage.setItem('gta6auto_slug', out.categorySlug); } catch (e) {} }
      const langChanged = out.lang !== (CFG.lang || 'auto');
      Object.assign(CFG, out);
      try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(out)); } catch (e) {}
      if (mode === 'watch') applyQuality();
      if (mode) runLoop(); // применить новую частоту проверок
      log(tr('logSaved'), out);
      if (langChanged) relocalize();   // окно откроется заново уже на новом языке
      const n = document.querySelector('#gta6-settings [data-note]');
      if (n) n.textContent = tr('saved');
    });
    const reset = mkBtn(tr('reset'), () => {
      try {
        localStorage.removeItem(SETTINGS_KEY);
        localStorage.removeItem('gta6auto_slug');
        // язык при сбросе не трогаем
        if (CFG.lang === 'ru' || CFG.lang === 'en') localStorage.setItem(SETTINGS_KEY, JSON.stringify({ lang: CFG.lang }));
      } catch (e) {}
      Object.assign(CFG, DEFAULTS, { avoidChannels: [], priorityChannels: [], lang: CFG.lang });
      if (mode === 'watch') applyQuality();
      if (mode) runLoop();
      for (const key in inputs) {
        const { inp, type } = inputs[key];
        if (type === 'lang') continue;
        if (type === 'bool') inp.checked = !!DEFAULTS[key];
        else inp.value = type === 'list' ? '' : DEFAULTS[key];
      }
      note.textContent = tr('resetDone');
      log(tr('logReset'));
    });
    const close = mkBtn(tr('close'), () => box.remove());
    const upd = mkBtn(tr('updatesBtn'), toggleUpdate);
    [save, reset, upd, close].forEach((b) => { b.style.marginLeft = '0'; btns.appendChild(b); });
    note.dataset.note = '1';
    box.appendChild(btns);
    box.appendChild(note);
    document.body.appendChild(box);
    placeWindow(box);
  }

  // ---------- обновления скрипта ----------
  // Tampermonkey сам ставит новую версию по @updateURL (обычно раз в сутки), но уже открытые вкладки
  // продолжают работать на старой, пока их не перезагрузить. Поэтому скрипт:
  //  • раз в 6 ч смотрит @version файла на GitHub и подсвечивает «⬆», если вышла новая;
  //  • запоминает самую новую запущенную версию (gta6auto_seenver). Если в другой вкладке уже
  //    заработала версия новее — вкладка с автопросмотром сама перезагружается на неё.
  const UPD_KEY = 'gta6auto_update';      // { at, latest, notes: {ru, en}, err } — общий для всех вкладок
  const SEEN_KEY = 'gta6auto_seenver';    // какая версия запускалась последней (= установлена сейчас)
  const UPD_TRY_KEY = 'gta6auto_updtry';  // попытки перезагрузиться на найденную версию (для вкладки)
  const UPD_EVERY = 6 * 3600000;
  let justUpdated = '';                   // с какой версии обновились (для ✨ на плашке)

  function cmpVer(a, b) {
    const pa = String(a).split('.').map((x) => parseInt(x, 10) || 0);
    const pb = String(b).split('.').map((x) => parseInt(x, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const d = (pa[i] || 0) - (pb[i] || 0);
      if (d) return d > 0 ? 1 : -1;
    }
    return 0;
  }
  function updInfo() { try { return JSON.parse(localStorage.getItem(UPD_KEY) || '{}'); } catch (e) { return {}; } }
  function seenVer() { try { return localStorage.getItem(SEEN_KEY) || VERSION; } catch (e) { return VERSION; } }
  // Версия на GitHub новее той, что работает в этой вкладке
  function newerOnGithub() { const u = updInfo(); return u.latest && cmpVer(u.latest, VERSION) > 0 ? u.latest : null; }
  // Новая версия уже установлена (заработала в другой вкладке), а эта вкладка ещё на старой
  function newerInstalled() { const s = seenVer(); return cmpVer(s, VERSION) > 0 ? s : null; }
  // Список изменений на текущем языке (v2.4 хранила один русский список)
  function notesFor(u) {
    if (Array.isArray(u.notes)) return lang() === 'ru' ? u.notes : [];
    return (u.notes && u.notes[lang()]) || [];
  }

  async function getText(url) {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 10000);
    try {
      const r = await fetch(url + '?t=' + Date.now(), { cache: 'no-store', signal: ctrl.signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.text();
    } catch (e) {
      throw new Error(e.name === 'AbortError' ? tr('ghTimeout') : e.message);
    } finally { clearTimeout(to); }
  }

  // Разделы CHANGELOG вида «## 2.4 — 22.11.2026» → [{ ver, head, lines }]
  function parseChangelog(md) {
    const out = [];
    let cur = null;
    for (const line of md.split(/\r?\n/)) {
      const m = line.match(/^##\s+v?(\d+(?:\.\d+)*)/);
      if (m) { cur = { ver: m[1], head: line.replace(/^##\s+/, '').trim(), lines: [] }; out.push(cur); continue; }
      if (cur && line.trim() && !line.startsWith('#')) cur.lines.push(line.trim().replace(/^[-*]\s+/, '• '));
    }
    return out;
  }

  let updChecking = null;
  function checkUpdate(manual) {
    if (updChecking) return updChecking;
    updChecking = (async () => {
      const prev = updInfo();
      try {
        const src = await getText(SCRIPT_URL);
        const m = src.match(/^\/\/\s*@version\s+(\S+)/m);
        if (!m) throw new Error(tr('noVersionLine'));
        // Списки изменений на обоих языках — чтобы после переключения языка не проверять заново
        const notes = Object.assign({}, Array.isArray(prev.notes) ? { ru: prev.notes } : prev.notes);
        await Promise.all(Object.keys(CHANGELOG_FILE).map((l) =>
          getText(RAW_BASE + CHANGELOG_FILE[l]).then((md) => { notes[l] = parseChangelog(md).slice(0, 15); }, () => {})));
        const info = { at: Date.now(), latest: m[1], notes };
        try { localStorage.setItem(UPD_KEY, JSON.stringify(info)); } catch (e) {}
        if (cmpVer(info.latest, VERSION) > 0) {
          if (manual || info.latest !== prev.latest) log(tr('logNewOnGh', info.latest, VERSION));
          tryUpdateReload(tr('whyGh', info.latest));
        } else if (manual) log(tr('logNoUpdates', VERSION));
      } catch (e) {
        // Не получилось — попробуем снова через час, а не через 6
        const info = Object.assign({}, prev, { at: Date.now() - UPD_EVERY + 3600000, err: e.message, errAt: Date.now() });
        try { localStorage.setItem(UPD_KEY, JSON.stringify(info)); } catch (e2) {}
        if (manual || !prev.err) log(tr('logCheckFail', e.message));
      } finally {
        updChecking = null;
        render();
      }
    })();
    return updChecking;
  }
  function maybeCheckUpdate() {
    if (CFG.updateCheck && Date.now() - (updInfo().at || 0) >= UPD_EVERY) checkUpdate(false);
  }

  // Эта вкладка запустилась — значит, установлена именно её версия
  function noteVersion() {
    const prev = seenVer();
    try { localStorage.setItem(SEEN_KEY, VERSION); } catch (e) {}
    if (cmpVer(VERSION, prev) > 0) {
      justUpdated = prev;
      log(tr('logUpdated', prev, VERSION));
    }
    try {
      const u = updInfo();
      if (u.err && cmpVer(u.latest || '0', VERSION) <= 0) { delete u.err; localStorage.setItem(UPD_KEY, JSON.stringify(u)); }
    } catch (e) {}
  }

  // Перезагрузить работающую вкладку на новую версию (только автопросмотр/награды, и не когда открыто окно)
  function tryUpdateReload(why) {
    if (!mode || !CFG.updateReload || navigating || anyWindowOpen()) return;
    const target = newerInstalled() || newerOnGithub();
    if (!target) return;
    let t = {};
    try { t = JSON.parse(sessionStorage.getItem(UPD_TRY_KEY) || '{}'); } catch (e) {}
    if (t.ver !== target) t = { ver: target, n: 0, at: 0 };
    if (!newerInstalled()) {
      // Про новую версию знаем только с GitHub: возможно, Tampermonkey её ещё не скачал.
      // Пробуем не чаще раза в 6 ч и не больше 3 раз, чтобы не дёргать стрим зря.
      if (t.n >= 3 || Date.now() - t.at < UPD_EVERY) return;
    } else if (t.n >= 3 || Date.now() - t.at < 120000) return;  // установлена, но вкладка почему-то осталась на старой
    t.n++; t.at = Date.now();
    try { sessionStorage.setItem(UPD_TRY_KEY, JSON.stringify(t)); } catch (e) {}
    log(tr('logReloading', target, why));
    navigating = true; navAt = Date.now(); navUrl = location.href;
    location.reload();
  }

  function openInstall() {
    // Tampermonkey перехватывает открытие *.user.js и показывает страницу «Обновить»
    window.open(SCRIPT_URL, '_blank', 'noopener');
    log(tr('logInstallOpened'));
  }

  function toggleUpdate() {
    const old = document.getElementById('gta6-update');
    if (old) { old.remove(); return; }
    closeWindows('gta6-update');
    if (justUpdated) { justUpdated = ''; render(); }
    const box = document.createElement('div');
    box.id = 'gta6-update';
    box.style.cssText =
      'position:fixed;bottom:56px;left:12px;z-index:1000000;background:#18181b;color:#efeff1;' +
      'font:12px/1.4 sans-serif;padding:12px;border-radius:8px;width:440px;max-width:calc(100vw - 40px);' +
      'border:1px solid #9147ff;box-shadow:0 4px 16px rgba(0,0,0,.6)';
    const title = document.createElement('div');
    title.textContent = tr('updHead', VERSION);
    title.style.cssText = 'font-weight:700;margin-bottom:8px';
    const status = document.createElement('div');
    status.style.cssText = 'margin-bottom:6px;font-weight:600';
    const when = document.createElement('div');
    when.style.cssText = 'margin-bottom:6px;color:#adadb8;font-size:11px';
    const pre = document.createElement('pre');
    pre.style.cssText = 'margin:0;max-height:220px;overflow:auto;background:#0e0e10;padding:8px;border-radius:4px;' +
      'font:11px/1.45 Consolas,monospace;white-space:pre-wrap;word-break:break-word';
    const hint = document.createElement('div');
    hint.style.cssText = 'margin-top:8px;color:#bf94ff;display:none';
    const btns = document.createElement('div');
    btns.style.cssText = 'display:flex;gap:6px;margin-top:8px;flex-wrap:wrap';

    const install = mkBtn(tr('install'), () => {
      openInstall();
      hint.style.display = 'block';
      hint.textContent = tr('installHint');
      reloadB.style.display = '';
    });
    install.style.background = '#ffd34d'; install.style.color = '#000';
    const reloadB = mkBtn(tr('restartTab'), () => { log(tr('logRestarted')); location.reload(); });
    const check = mkBtn(tr('checkNow'), () => runCheck());
    const gh = mkBtn('GitHub', () => window.open(REPO_URL, '_blank', 'noopener'));
    const close = mkBtn(tr('close'), () => box.remove());
    [install, reloadB, check, gh, close].forEach((b) => { b.style.marginLeft = '0'; btns.appendChild(b); });

    function fill() {
      const u = updInfo();
      const onGh = newerOnGithub(), inst = newerInstalled();
      install.style.display = onGh && !inst ? '' : 'none';
      if (onGh && !inst) install.textContent = tr('installVer', onGh);
      if (inst) {
        status.textContent = tr('stInstalled', inst);
        reloadB.style.display = '';
      } else if (onGh) {
        status.textContent = tr('stNew', onGh, VERSION);
      } else if (u.latest && !u.err) {
        status.textContent = tr('stLatest', VERSION);
      } else {
        status.textContent = u.err ? '' : tr('stNever');
      }
      if (!inst && hint.style.display === 'none') reloadB.style.display = 'none';
      const ts = (t) => new Date(t).toLocaleString(locale(), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      const okAt = u.err ? null : u.at;
      when.textContent = (u.err ? tr('checkFailedAt', ts(u.errAt || Date.now()), u.err) : okAt ? tr('checkedAt', ts(okAt)) : '') +
        (CFG.updateCheck ? '' : tr('autoCheckOff'));
      const notes = notesFor(u);
      const want = onGh || inst
        ? notes.filter((n) => cmpVer(n.ver, VERSION) > 0)
        : notes.filter((n) => cmpVer(n.ver, VERSION) === 0);
      pre.textContent = want.length
        ? tr(onGh || inst ? 'whatsNew' : 'whatsNewThis') + '\n\n' +
          want.map((n) => 'v' + n.head + '\n' + n.lines.join('\n')).join('\n\n')
        : tr('changelogLink', REPO_URL + '/blob/main/' + CHANGELOG_FILE[lang()]);
    }
    function runCheck() {
      status.textContent = tr('checking');
      check.disabled = true;
      checkUpdate(true).then(() => { check.disabled = false; if (box.isConnected) fill(); });
    }

    box.appendChild(title); box.appendChild(status); box.appendChild(when); box.appendChild(pre);
    box.appendChild(btns); box.appendChild(hint);
    document.body.appendChild(box);
    placeWindow(box);
    fill();
    // Окно открыли — значит, хотят узнать сейчас; не чаще раза в минуту
    if (Date.now() - (updInfo().at || 0) > 60000 || updInfo().err) runCheck();
  }

  // Версия на плашке — это и есть кнопка «проверить обновления»
  function verTag() {
    const inst = newerInstalled(), onGh = newerOnGithub();
    const b = iconBtn('v' + VERSION, tr('verTitle'), toggleUpdate, 'g6v');
    if (inst || onGh) {
      b.textContent = inst ? '🔄 v' + inst : '⬆ v' + onGh;
      b.title = inst ? tr('verRestartTitle') : tr('verNewTitle');
      b.classList.add('g6up');
    } else if (justUpdated) {
      b.textContent = '✨ v' + VERSION;
      b.title = tr('verUpdatedTitle', justUpdated);
      b.style.opacity = '1';
    }
    return b;
  }

  // Состояние вкладки одним-двумя значками: 👀✔ смотрю, 👀⏳ жду, 👀🔎 ищу, 🎁 3 — награды
  function stateIcon() {
    const k = tabKey && tabKey[0];
    if (mode === 'claim') return '🎁' + (k === 'tagRewards' ? ' ' + tabKey[1] : '');
    return '👀' + ({ tagFarm: '✔', tagWait: '⏳', tagSearch: '🔎' }[k] || '…');
  }
  const isMin = () => { try { return localStorage.getItem(MIN_KEY) === '1'; } catch (e) { return false; } };
  function setMin(v) {
    try { if (v) localStorage.setItem(MIN_KEY, '1'); else localStorage.removeItem(MIN_KEY); } catch (e) {}
    render();
  }

  function render() {
    const el = panel();
    if (!el) return;
    el.innerHTML = '';
    const add = (...nodes) => nodes.forEach((n) => el.appendChild(n));
    if (mode && isMin()) {
      // свёрнуто: только значок состояния (и ⬆, если есть обновление)
      const status = lastStatus ? tr(...lastStatus) : tr('starting');
      add(iconBtn(stateIcon(), 'GTA6: ' + status + '\n' + tr('expand') + tr('dragHint'), () => setMin(false), 'g6chip'));
      if (newerInstalled() || newerOnGithub()) add(verTag());
    } else if (mode) {
      const status = lastStatus ? tr(...lastStatus) : tr('starting');
      const icon = document.createElement('span');
      icon.className = 'g6b';
      icon.textContent = stateIcon();
      icon.style.cursor = 'inherit';
      const t = document.createElement('span');
      t.className = 'g6s';
      t.textContent = status;
      t.title = status + tr('dragHint');
      add(icon, t, sep());
      if (mode === 'watch') add(iconBtn('🎁', tr('claimTabTitle'), openClaimTab));
      add(gearBtn(), logBtn(), iconBtn('⏹', tr('stopTitle'), deactivate), langBtn(), verTag(),
        iconBtn('–', tr('collapse'), () => setMin(true), 'g6txt'));
    } else if (menuOpen) {
      if (location.pathname.startsWith('/drops/inventory')) {
        add(iconBtn('🎁', tr('claimHere'), () => activate('claim')), iconBtn('👀', tr('watchHere'), () => activate('watch')));
      } else {
        add(iconBtn('👀', tr('watchHere'), () => activate('watch')),
          iconBtn('🎁', tr('claimNewTab'), () => { menuOpen = false; render(); openClaimTab(); }));
      }
      add(sep(), gearBtn(), logBtn(), langBtn(), verTag(),
        iconBtn('✕', tr('closeMenu'), () => { menuOpen = false; render(); }, 'g6txt'));
    } else {
      add(iconBtn('🎮 GTA6', tr('mainTitle') + tr('dragHint'), () => { menuOpen = true; render(); }, 'g6txt'), verTag());
    }
    applyPos(el);
  }

  function openClaimTab() {
    window.open('https://www.twitch.tv/drops/inventory#gta6-claim', '_blank', 'noopener');
  }

  // Статус на плашке: badge('ключ', ...аргументы) — хранится ключ, чтобы перевести при смене языка
  function badge(key, ...args) {
    lastStatus = [key, ...args];
    render();
  }

  // ---------- метка в названии вкладки ----------
  let tabTag = '', tabKey = null;
  const TAG_RE = /^(🟢|🟡|🔎|🎁) [^|]*\| /;
  function applyTitle() {
    const base = document.title.replace(TAG_RE, '');
    const want = tabTag ? tabTag + ' | ' + base : base;
    if (document.title !== want) document.title = want;
  }
  // setTab('ключ', ...аргументы) или setTab('') — убрать метку
  function setTab(key, ...args) {
    tabKey = key ? [key, ...args] : null;
    tabTag = key ? tr(key, ...args) : '';
    applyTitle();
  }
  // Twitch сам меняет заголовок при переходах — возвращаем метку (следим только за <head>)
  function watchTitle() {
    new MutationObserver(() => { if (tabTag || TAG_RE.test(document.title)) applyTitle(); })
      .observe(document.head || document.documentElement, { subtree: true, childList: true, characterData: true });
  }

  function activate(m) {
    mode = m;
    menuOpen = false;
    sessionStorage.setItem(MODE_KEY, m);
    if (m === 'watch') applyQuality();
    log(tr(m === 'watch' ? 'logWatchOn' : 'logClaimOn'));
    // Если уже на нужной странице — начинаем сразу, иначе переходим.
    if (m === 'watch' && !channelFromPath()) { goDirectory(); return; }
    if (m === 'claim' && !location.pathname.startsWith('/drops/inventory')) {
      badge('openingInv'); nav('https://www.twitch.tv/drops/inventory', tr('whyClaim')); return;
    }
    runLoop();
  }

  function deactivate() {
    mode = null;
    sessionStorage.removeItem(MODE_KEY);
    clearTimeout(timer);
    timer = null;
    lastStatus = null;
    setTab('');
    log(tr('logStopped'));
    render();
  }

  // ---------- память о «плохих» каналах ----------
  function getRecent() {
    try {
      const r = JSON.parse(sessionStorage.getItem('gta6auto_bad') || '{}');
      const now = Date.now();
      for (const k in r) if (now - r[k] > CFG.skipBadChannelMin * 60000) delete r[k];
      return r;
    } catch (e) { return {}; }
  }
  function markBad(ch) {
    const r = getRecent(); r[ch] = Date.now();
    sessionStorage.setItem('gta6auto_bad', JSON.stringify(r));
  }

  // ---------- режим просмотра ----------
  const RESERVED = ['directory', 'drops', 'settings', 'subscriptions', 'inventory', 'wallet', 'search',
    'videos', 'downloads', 'p', 'turbo', 'prime', 'friends', 'messages', 'payments', 'login', 'signup'];

  function channelFromPath() {
    const seg = location.pathname.split('/').filter(Boolean);
    if (seg.length !== 1) return null;
    const c = seg[0].toLowerCase();
    return RESERVED.includes(c) ? null : c;
  }

  function unblock() {
    // «Контент для взрослых» / «Начать просмотр» / кнопка Play
    [
      '[data-a-target="content-classification-gate-overlay-start-watching-button"]',
      '[data-a-target="player-overlay-mature-accept"]',
      'button[data-a-target="player-overlay-play-button"]',
    ].forEach((s) => { const b = $(s); if (b) b.click(); });
    const v = $('video');
    if (v && v.paused && !v.ended) {
      v.play().catch(() => { v.muted = true; v.play().catch(() => {}); });
    }
  }

  // Точное сравнение (чтобы «Vice City» не считался за GTA VI)
  function isGtaGame(gameSlug, gameName) {
    const sl = (gameSlug || '').toLowerCase();
    const nm = (gameName || '').trim().toLowerCase();
    return (!!sl && sl === slug()) || CFG.categoryNames.includes(nm);
  }
  function isGtaLink(href, text) {
    const m = (href || '').match(/\/directory\/(?:category|game)\/([^/?#]+)/);
    return isGtaGame(m ? decodeURIComponent(m[1]) : '', text);
  }

  // ---------- приоритетные каналы и фолловы (через API самого Twitch) ----------
  const LOGIN_RE = /^[a-z0-9_]{1,25}$/;
  function authToken() {
    const m = document.cookie.match(/(?:^|; )auth-token=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }
  async function gql(query, withAuth) {
    const headers = { 'Client-ID': 'kimne78kx3ncx6brgo4mv6wki5h1ko', 'Content-Type': 'text/plain;charset=UTF-8' };
    if (withAuth) {
      const t = authToken();
      if (!t) throw new Error(tr('notLoggedIn'));
      headers.Authorization = 'OAuth ' + t;
    }
    // Без тайм-аута зависший запрос мог навсегда остановить поиск стрима
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 10000);
    let j;
    try {
      const r = await fetch('https://gql.twitch.tv/gql', { method: 'POST', headers, body: JSON.stringify({ query }), signal: ctrl.signal });
      j = await r.json();
    } catch (e) {
      throw new Error(e.name === 'AbortError' ? tr('twitchTimeout') : e.message);
    } finally { clearTimeout(to); }
    if (j.errors || !j.data) throw new Error(JSON.stringify(j.errors || j).slice(0, 200));
    return j.data;
  }

  // Возвращает { priority: [логины в эфире с GTA VI, по порядку], followed: [...] | null (не удалось узнать) }
  async function findPreferred() {
    const res = { priority: [], followed: null };
    const pri = CFG.priorityChannels.filter((l) => LOGIN_RE.test(l));
    if (pri.length) {
      try {
        const d = await gql(`query{users(logins:${JSON.stringify(pri.slice(0, 100))}){login stream{id game{name slug}}}}`);
        const users = (d.users || []).filter(Boolean);
        for (const l of pri) {
          const u = users.find((x) => x.login.toLowerCase() === l);
          if (u && u.stream && u.stream.game && isGtaGame(u.stream.game.slug, u.stream.game.name)) res.priority.push(l);
        }
      } catch (e) { log(tr('logPriFail'), e.message); }
    }
    if (CFG.preferFollowed && authToken()) {
      try {
        const d = await gql('query{currentUser{followedLiveUsers(first:100){edges{node{login stream{viewersCount game{name slug}}}}}}}', true);
        const edges = (d.currentUser && d.currentUser.followedLiveUsers && d.currentUser.followedLiveUsers.edges) || [];
        res.followed = edges.map((e) => e.node)
          .filter((n) => n && n.stream && n.stream.game && isGtaGame(n.stream.game.slug, n.stream.game.name))
          .sort((a, b) => (b.stream.viewersCount || 0) - (a.stream.viewersCount || 0))
          .map((n) => n.login.toLowerCase());
      } catch (e) { log(tr('logFolFail'), e.message); }
    }
    return res;
  }

  const FOLLOW_RANK = 1000, OTHER_RANK = 2000;
  function rankOf(ch, p) {
    const i = p.priority.indexOf(ch);
    if (i >= 0) return i;
    if ((p.followed || []).includes(ch)) return FOLLOW_RANK;
    return OTHER_RANK;
  }
  function bestOf(p, includeFollowed) {
    const recent = getRecent();
    const list = [...p.priority, ...(includeFollowed ? (p.followed || []) : [])];
    return list.find((l) => !recent[l] && !CFG.avoidChannels.includes(l)) || null;
  }
  function whyLabel(r) { return r < FOLLOW_RANK ? '⭐' : r === FOLLOW_RANK ? '❤' : ''; }
  function goChannel(login, why) {
    try {
      sessionStorage.setItem('gta6auto_why', JSON.stringify({ login, why }));
      sessionStorage.removeItem('gta6auto_fwtried');
    } catch (e) {}
    const who = login + (why ? ' ' + why : '');
    badge('switchingTo', who);
    nav('https://www.twitch.tv/' + login, tr('whyPicked', who));
  }
  function currentWhy(ch) {
    try { const w = JSON.parse(sessionStorage.getItem('gta6auto_why') || '{}'); return w.login === ch ? w.why : ''; }
    catch (e) { return ''; }
  }

  function streamState() {
    const gameLink = $('a[data-a-target="stream-game-link"]');
    const liveMark =
      $('[data-a-target="animated-channel-viewers-count"]') ||
      $('.live-indicator-container') ||
      $('.tw-channel-status-text-indicator');
    const href = gameLink ? (gameLink.getAttribute('href') || '') : '';
    const rightGame = !!gameLink && isGtaLink(href, gameLink.textContent);
    if (rightGame) {
      const m = href.match(/\/directory\/(?:category|game)\/([^/?#]+)/);
      if (m) try { localStorage.setItem('gta6auto_slug', decodeURIComponent(m[1]).toLowerCase()); } catch (e) {}
    }
    const ad = !!($('[data-a-target="video-ad-label"]') || $('[data-a-target="video-ad-countdown"]'));
    return { live: !!liveMark && !!$('video'), rightGame, ad, game: gameLink ? gameLink.textContent.trim() : '—' };
  }

  // Всё считается по реальным часам: в фоне Chrome тормозит таймеры (до 1 раза в минуту),
  // но переключение всё равно сработает вовремя.
  const now = () => Date.now();
  const startedAt = now();
  let badSince = 0, lastTime = -1, lastMoveAt = now(), lastOk = false, lastStateKey = '';

  let lastPrefCheck = now(), prefChecking = false;

  // Куда идти дальше: ⭐ приоритетные → ❤ фолловы → вся категория GTA VI
  async function goDirectory() {
    if (navigating) return;
    navigating = true;
    navAt = Date.now(); navUrl = '';   // сторож следит и за ожиданием ответа API
    badSince = 0;
    setTab('tagSearch');
    badge('searching');
    let p = { priority: [], followed: null };
    try { p = await findPreferred(); } catch (e) {}
    const best = bestOf(p, CFG.preferFollowed);
    if (best) return goChannel(best, whyLabel(rankOf(best, p)));
    // API фолловов не ответил — смотрим страницу «Подписки → В эфире»
    if (CFG.preferFollowed && p.followed === null && authToken() && !sessionStorage.getItem('gta6auto_fwtried')) {
      sessionStorage.setItem('gta6auto_fwtried', '1');
      nav('https://www.twitch.tv/directory/following/live', tr('whyFolApi'));
      return;
    }
    // результат уже проверен — в каталоге повторно не проверяем
    sessionStorage.setItem('gta6auto_dirchecked', String(Date.now()));
    nav(dirUrl(true), tr('whyNoPref'));
  }

  // Во время просмотра иногда проверяем, не начал ли кто-то из ⭐/❤ стримить GTA VI
  async function checkUpgrade(ch) {
    if (prefChecking || navigating) return;
    prefChecking = true;
    try {
      const p = await findPreferred();
      const best = bestOf(p, CFG.switchToFollowed);
      if (best && best !== ch && rankOf(best, p) < rankOf(ch, p)) {
        log(tr('logUpgrade', whyLabel(rankOf(best, p)), best, ch));
        goChannel(best, whyLabel(rankOf(best, p)));
      }
    } catch (e) { log('checkUpgrade', e.message); }
    prefChecking = false;
  }

  // Страница «Подписки → В эфире»: берём только тех, кто стримит GTA VI
  function cardIsGta(a) {
    let el = a;
    for (let i = 0; i < 10 && el; i++) {
      el = el.parentElement;
      if (!el) break;
      const links = el.querySelectorAll('a[href*="/directory/category/"], a[href*="/directory/game/"]');
      if (links.length) return [...links].some((l) => isGtaLink(l.getAttribute('href'), l.textContent));
      if (el.tagName === 'ARTICLE') break;
    }
    return false;
  }

  // Если goDirectory только что всё проверил (последние 30 с) — второй раз не проверяем
  let dirPrefChecked = Date.now() - Number(sessionStorage.getItem('gta6auto_dirchecked') || 0) < 30000;
  sessionStorage.removeItem('gta6auto_dirchecked');
  function pickFromDirectory() {
    if (navigating) return;
    const following = location.pathname.startsWith('/directory/following');
    // В общем каталоге сначала один раз проверяем ⭐ приоритетных и ❤ фолловов
    if (!following && !dirPrefChecked) {
      dirPrefChecked = true;
      navigating = true;
      navAt = Date.now(); navUrl = '';
      badge('checkingPref');
      findPreferred().then((p) => {
        const best = bestOf(p, CFG.preferFollowed);
        if (best) return goChannel(best, whyLabel(rankOf(best, p)));
        if (CFG.preferFollowed && p.followed === null && authToken() && !sessionStorage.getItem('gta6auto_fwtried')) {
          sessionStorage.setItem('gta6auto_fwtried', '1'); // страницу «Подписки» пробуем один раз за поиск
          nav('https://www.twitch.tv/directory/following/live', tr('whyFolApi'));
          return;
        }
        navigating = false; navAt = 0;
      }).catch(() => { navigating = false; navAt = 0; });
      return;
    }
    const recent = getRecent();
    const cand = [...new Set(
      $$('a[data-a-target="preview-card-image-link"]')
        .filter((a) => !following || cardIsGta(a))
        .map((a) => ((a.getAttribute('href') || '').split('/').filter(Boolean)[0] || '').toLowerCase())
        .filter(Boolean)
    )].filter((c) => !recent[c] && !CFG.avoidChannels.includes(c) && !RESERVED.includes(c));

    if (cand.length) {
      goChannel(cand[0], following ? '❤' : '');
      return;
    }
    const dirSec = Math.round((now() - startedAt) / 1000);
    if (following) {
      setTab('tagSearch');
      badge('searchingFol', dirSec);
      if (dirSec >= 10) nav(dirUrl(true), tr('whyNoFol')); // в общую категорию
      return;
    }
    setTab('tagSearch');
    badge('searchingCat', dirSec);
    if (dirSec >= 60) {
      // нет стримов с дропсами — пробуем всю категорию, и наоборот
      const withDrops = location.search.includes('tl=DropsEnabled');
      nav(CFG.dropsOnly ? dirUrl(true) : dirUrl(!withDrops), tr('whyDirEmpty'));
    }
  }

  // ---------- проверка текущего канала через API Twitch ----------
  // Страница после конца стрима может «залипнуть» (счётчик зрителей и игра остаются),
  // поэтому раз в 30 с спрашиваем у Twitch, идёт ли эфир на самом деле и какая игра.
  let api = { ch: '', at: 0, live: null, gta: null, game: '' };
  let apiBusy = false, apiAskedAt = 0, apiDown = false;
  function refreshApi(ch) {
    if (apiBusy || !LOGIN_RE.test(ch) || now() - apiAskedAt < 30000) return;
    apiBusy = true;
    apiAskedAt = now();
    gql(`query{user(login:${JSON.stringify(ch)}){login stream{id game{name slug}}}}`)
      .then((d) => {
        const st = d.user && d.user.stream;
        const g = st && st.game;
        api = { ch, at: now(), live: !!st, gta: !!g && isGtaGame(g.slug, g.name), game: g ? g.name : '—' };
        if (apiDown) { apiDown = false; log(tr('logApiBack')); }
      })
      .catch((e) => {
        if (!apiDown) { apiDown = true; log(tr('logApiDown', e.message)); }
        else console.log('[GTA6] API still down:', e.message);
      })
      .finally(() => { apiBusy = false; });
  }

  // Проблема с текущим стримом: [ключ, ...аргументы] для tr() или null
  function problemText(p) { return p ? tr(...p) : ''; }

  function watchTick() {
    if (location.pathname.startsWith('/directory/')) return pickFromDirectory();

    const ch = channelFromPath();
    if (!ch) { badge('notOnChannel'); return goDirectory(); }

    unblock();
    const s = streamState();
    refreshApi(ch);
    // Свежий ответ API (не старше 90 с) главнее того, что нарисовано на странице
    const apiFresh = api.ch === ch && now() - api.at < 90000;
    if (apiFresh) {
      s.live = api.live;
      s.rightGame = api.gta;
      if (api.live) s.game = api.game;
    }

    const v = $('video');
    if (!v || s.ad || v.currentTime !== lastTime) lastMoveAt = now();
    if (v) lastTime = v.currentTime;

    let problem = null;
    if (!s.live) problem = ['offline'];
    else if (!s.rightGame) problem = ['notGta', s.game];
    else if (now() - lastMoveAt >= 60000) problem = ['videoStuck'];

    // первые секунды страница ещё грузится — не пугаемся
    if (problem && !lastOk && !apiFresh && now() - startedAt < 15000) {
      setTab('tagStart');
      badge('loading', ch);
      return;
    }

    lastOk = !problem || s.ad;
    // в журнал — только смену состояния, а не каждую проверку
    const stateKey = ch + '|' + (s.ad ? 'ad' : problem ? problem.join(':') : 'ok');
    if (stateKey !== lastStateKey) {
      lastStateKey = stateKey;
      const src = tr(apiFresh ? 'srcApi' : 'srcPage');
      log(s.ad ? tr('logAd', ch) : problem ? tr('logProblem', ch, problemText(problem), src) : tr('logOk', ch, src));
    }
    if (!problem || s.ad) {
      badSince = 0;
      setTab('tagFarm');
      const why = currentWhy(ch);
      badge('chStatus', ch + (why ? ' ' + why : ''), s.ad ? 'adWait' : 'watching');
      const wantCheck = CFG.priorityChannels.length || (CFG.preferFollowed && CFG.switchToFollowed);
      if (wantCheck && now() - lastPrefCheck >= CFG.preferCheckMin * 60000) {
        lastPrefCheck = now();
        checkUpgrade(ch);
      }
      return;
    }

    setTab('tagWait');
    if (!badSince) badSince = now();
    const badSec = Math.round((now() - badSince) / 1000);
    badge('switchInP', ch, problem, Math.max(0, CFG.switchAfterSec - badSec));
    if (badSec >= CFG.switchAfterSec && !navigating) {
      log(tr('logLeave', ch, problemText(problem), badSec));
      markBad(ch);
      goDirectory();
    }
  }
  // Составные статусы: переводим вложенные ключи в момент отрисовки
  STR.ru.chStatus = STR.en.chStatus = (who, stateKey) => who + ' — ' + tr(stateKey);
  STR.ru.switchInP = STR.en.switchInP = (ch, p, s) => tr('switchIn', ch, problemText(p), s);

  // ---------- режим сбора наград ----------
  const claimStart = Date.now();
  function claimTick() {
    if (!location.pathname.startsWith('/drops/inventory')) {
      if (!navigating) nav('https://www.twitch.tv/drops/inventory', tr('whyClaimLeft'));
      return;
    }
    const btns = $$('button').filter((b) => {
      const t = (b.textContent || '').trim();
      return !b.disabled && /^(claim|получить|забрать)/i.test(t);
    });
    let total = +(sessionStorage.getItem('gta6auto_claimed') || 0);
    btns.forEach((b) => { b.click(); total++; log(tr('logClicked', b.textContent.trim(), total)); });
    sessionStorage.setItem('gta6auto_claimed', String(total));

    setTab('tagRewards', total);
    const claimSec = (Date.now() - claimStart) / 1000;
    const left = CFG.inventoryReloadMin * 60 - claimSec;
    badge('claimStatus', total, Math.ceil(left / 60));
    if (left <= 0 && !navigating) { navigating = true; navAt = Date.now(); navUrl = location.href; location.reload(); }
  }

  function runLoop() {
    clearTimeout(timer);
    const fastUntil = Date.now() + 30000;
    const loop = () => {
      if (!mode) return;
      try { navWatchdog(); (mode === 'watch' ? watchTick : claimTick)(); } catch (e) { log(tr('logError'), e && e.stack ? e.stack.split('\n').slice(0, 2).join(' | ') : e); }
      // Пока страница грузится / в каталоге / ещё не подтвердили стрим — проверяем каждую секунду
      const fast = location.pathname.startsWith('/directory/') ||
        (mode === 'watch' && !lastOk && Date.now() < fastUntil);
      timer = setTimeout(loop, fast ? 1000 : CFG.tickSec * 1000);
    };
    timer = setTimeout(loop, 300);
    if (mode === 'watch') setTab('tagStart');
    else setTab('tagRewards', +(sessionStorage.getItem('gta6auto_claimed') || 0));
    log(tr('logLoaded', VERSION, location.pathname));
  }

  function start() {
    noteVersion();
    watchTitle();
    render();
    // Twitch иногда перерисовывает страницу — возвращаем панель, если её убрали
    let lastInst = newerInstalled();
    setInterval(() => {
      if (!document.getElementById('gta6-panel')) render();
      // в другой вкладке заработала новая версия (запасной путь, если событие storage не пришло)
      const inst = newerInstalled();
      if (inst !== lastInst) { lastInst = inst; render(); }
      if (inst) tryUpdateReload(tr('whyOtherTab', inst));
    }, 3000);
    // окно браузера поменяло размер — плашка и окна не должны уехать за край
    window.addEventListener('resize', () => { const p = document.getElementById('gta6-panel'); if (p) applyPos(p); placeOpenWindow(); });
    window.addEventListener('storage', (e) => {
      // плашку передвинули/свернули в другой вкладке
      if (e.key === SEEN_KEY || e.key === UPD_KEY || e.key === POS_KEY || e.key === MIN_KEY) render();
      if (e.key === SEEN_KEY && newerInstalled()) tryUpdateReload(tr('whyOtherTab', newerInstalled()));
      // язык переключили в другой вкладке — переключаемся и здесь
      if (e.key === SETTINGS_KEY) {
        const l = readSettings().lang || 'auto';
        if (l !== (CFG.lang || 'auto')) { CFG.lang = l; relocalize(); }
      }
    });
    // Проверка обновлений: через 20 с после загрузки (чтобы не мешать странице), потом раз в 10 мин смотрим, не пора ли
    setTimeout(maybeCheckUpdate, 20000);
    setInterval(maybeCheckUpdate, 600000);
    if (mode) runLoop();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
