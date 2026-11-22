// ==UserScript==
// @name         Twitch GTA VI Drops — автопросмотр
// @namespace    gta6-drops
// @version      2.4
// @description  Держит вкладку на живом стриме GTA VI (с дропсами), сам переключает канал, если стрим закончился или стример сменил игру. Во второй вкладке — автосбор наград в инвентаре.
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

  ОБНОВЛЕНИЯ: Tampermonkey сам скачивает новую версию с GitHub (раз в сутки).
  Кнопка с версией на плашке (vX.Y) — проверить обновление сейчас и посмотреть, что нового.
  Скрипт и сам проверяет GitHub раз в 6 часов и подсвечивает «⬆», если вышла новая версия.

  ДЛЯ РАЗРАБОТКИ: версия указана в двух местах — @version в шапке и запасное значение
  в константе VERSION. Меняй обе сразу: node tools/bump.mjs 2.5 (заодно добавит раздел в CHANGELOG.md).
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
  };
  const SETTINGS_KEY = 'gta6auto_settings';
  // Версия берётся из шапки скрипта (Tampermonkey), запасное значение — на всякий случай
  const VERSION = (() => {
    try { if (typeof GM_info !== 'undefined' && GM_info.script && GM_info.script.version) return GM_info.script.version; } catch (e) {}
    return '2.4';
  })();
  // Откуда брать обновления (raw-ссылка без хеша коммита — всегда последняя версия из ветки main)
  const REPO = 'Konrik/twitch-gta6-drops';
  const REPO_URL = 'https://github.com/' + REPO;
  const RAW_BASE = 'https://raw.githubusercontent.com/' + REPO + '/main/';
  const SCRIPT_URL = RAW_BASE + 'twitch-gta6-drops.user.js';
  const CHANGELOG_URL = RAW_BASE + 'CHANGELOG.md';
  const CFG = Object.assign({}, DEFAULTS, (() => {
    try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); } catch (e) { return {}; }
  })());
  CFG.categoryNames = ['grand theft auto vi', 'gta vi', 'gta 6'];
  // =====================================================================

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
    log('➡ переход: ' + url.replace('https://www.twitch.tv', '') + (why ? ' — ' + why : ''));
    location.href = url;
  }
  function navWatchdog() {
    if (!navigating || !navAt) return;
    const waited = Math.round((Date.now() - navAt) / 1000);
    if (waited < 25) return;
    navTries++;
    log(`⚠ переход не случился за ${waited} с (попытка ${navTries}): ${navUrl ? navUrl.replace('https://www.twitch.tv', '') : 'ждал ответа Twitch'}`);
    try { window.stop(); } catch (e) {}
    navAt = Date.now();
    if (!navUrl) { navigating = false; return; }          // завис запрос к API — просто начнём поиск заново
    if (navTries >= 4) { log('⚠ перезагружаю вкладку'); location.reload(); return; }
    if (navTries >= 2) { location.replace(navUrl); return; }
    location.assign(navUrl);
  }

  const slug = () => { try { return localStorage.getItem('gta6auto_slug') || CFG.categorySlug; } catch (e) { return CFG.categorySlug; } };
  const dirUrl = (drops) =>
    `https://www.twitch.tv/directory/category/${slug()}?sort=VIEWER_COUNT${drops ? '&tl=DropsEnabled' : ''}`;

  let timer = null;
  let menuOpen = freshTab; // в новой вкладке сразу показываем кнопку запуска
  let lastStatus = '';

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

  function panel() {
    if (!document.body) return null;
    let el = document.getElementById('gta6-panel');
    if (!el) {
      el = document.createElement('div');
      el.id = 'gta6-panel';
      el.style.cssText =
        'position:fixed;bottom:12px;left:12px;z-index:999999;background:#9147ff;color:#fff;' +
        'font:12px/1.4 sans-serif;padding:6px 8px;border-radius:6px;opacity:.95;max-width:480px;' +
        'display:flex;align-items:center;flex-wrap:wrap;gap:4px;box-shadow:0 2px 8px rgba(0,0,0,.4)';
      document.body.appendChild(el);
    }
    return el;
  }

  // ---------- окно журнала ----------
  function logBtn() {
    const b = mkBtn('📜', toggleLogs);
    b.title = 'Журнал событий';
    return b;
  }
  function logText() {
    let arr = [];
    try { arr = JSON.parse(localStorage.getItem(LOG_KEY) || '[]'); } catch (e) {}
    const icon = { watch: '👀', claim: '🎁' };
    return arr.map(([t, m, msg]) => {
      const ts = new Date(t).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
      return `${ts} ${icon[m] || '·'} ${msg}`;
    }).join('\n');
  }
  let logRefresh = null;
  // Одновременно открыто только одно окно (журнал / настройки / обновления)
  const WINDOWS = ['gta6-logs', 'gta6-settings', 'gta6-update'];
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
    title.textContent = '📜 Журнал GTA6 автопросмотра · v' + VERSION + ' (все вкладки, последние 500 записей)';
    title.style.cssText = 'font-weight:700;margin-bottom:8px';
    const pre = document.createElement('pre');
    pre.style.cssText = 'margin:0;height:300px;overflow:auto;background:#0e0e10;padding:8px;border-radius:4px;' +
      'font:11px/1.45 Consolas,monospace;white-space:pre-wrap;word-break:break-word';
    const fill = () => {
      const atBottom = pre.scrollTop + pre.clientHeight >= pre.scrollHeight - 20;
      pre.textContent = logText() || 'Пока пусто';
      if (atBottom) pre.scrollTop = pre.scrollHeight;
    };
    const note = document.createElement('span');
    note.style.cssText = 'color:#bf94ff;margin-left:6px';
    const btns = document.createElement('div');
    btns.style.cssText = 'display:flex;gap:6px;margin-top:8px;align-items:center;flex-wrap:wrap';
    const copy = mkBtn('📋 Копировать', () => {
      const text = 'GTA6 автопросмотр v' + VERSION + '\n' + logText();
      const done = () => { note.textContent = '✔ Скопировано'; };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
      else fallbackCopy(text, done);
    });
    const close = mkBtn('✕ Закрыть', () => { box.remove(); clearInterval(logRefresh); });
    const clear = mkBtn('🗑 Очистить', () => askClear());

    // Подтверждение очистки прямо в окне (без всплывающих окон браузера)
    const confirmRow = document.createElement('div');
    confirmRow.style.cssText = 'display:none;gap:6px;margin-top:8px;align-items:center;flex-wrap:wrap;' +
      'background:#3a1d1d;border:1px solid #e91916;border-radius:4px;padding:6px 8px';
    const q = document.createElement('span');
    q.textContent = 'Точно очистить весь журнал? Это нельзя отменить.';
    q.style.cssText = 'font-weight:600;margin-right:4px';
    const yes = mkBtn('Да, очистить', () => {
      try { localStorage.removeItem(LOG_KEY); } catch (e) {}
      hideConfirm(); fill(); note.textContent = 'Журнал очищен';
    });
    yes.style.background = '#e91916'; yes.style.color = '#fff';
    const no = mkBtn('Отмена', () => { hideConfirm(); note.textContent = ''; });
    [q, yes, no].forEach((b) => { b.style.marginLeft = '0'; confirmRow.appendChild(b); });
    function askClear() { btns.style.display = 'none'; confirmRow.style.display = 'flex'; note.textContent = ''; }
    function hideConfirm() { confirmRow.style.display = 'none'; btns.style.display = 'flex'; }

    [copy, clear, close].forEach((b) => { b.style.marginLeft = '0'; btns.appendChild(b); });
    btns.appendChild(note);
    box.appendChild(title); box.appendChild(pre); box.appendChild(btns); box.appendChild(confirmRow);
    document.body.appendChild(box);
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
    const g = mkBtn('⚙', toggleSettings);
    g.title = 'Настройки';
    return g;
  }

  const FIELDS = [
    ['switchAfterSec', 'Переключать стрим через, сек', 'num', 20],
    ['tickSec', 'Проверять стрим каждые, сек', 'num', 2],
    ['skipBadChannelMin', 'Не возвращаться на ушедший канал, мин', 'num', 0],
    ['inventoryReloadMin', 'Обновлять инвентарь каждые, мин', 'num', 1],
    ['dropsOnly', 'Только стримы с дропсами (без запасного варианта)', 'bool'],
    ['lowQuality', 'Низкое качество 160p (меньше трафика)', 'bool'],
    ['priorityChannels', '⭐ Приоритетные каналы по порядку (через запятую)', 'list'],
    ['preferFollowed', '❤ Сначала искать среди фолловов', 'bool'],
    ['switchToFollowed', '❤ Уходить на фоллова, когда он начал GTA VI', 'bool'],
    ['preferCheckMin', 'Проверять ⭐/❤ во время просмотра каждые, мин', 'num', 1],
    ['avoidChannels', 'Не открывать каналы (через запятую)', 'list'],
    ['categorySlug', 'Адрес категории на Twitch', 'text'],
    ['updateCheck', '⬆ Проверять обновления скрипта (раз в 6 ч)', 'bool'],
    ['updateReload', '⬆ Перезапускать вкладку автопросмотра на новую версию', 'bool'],
  ];

  function toggleSettings() {
    const old = document.getElementById('gta6-settings');
    if (old) { old.remove(); return; }
    closeWindows('gta6-settings');
    const box = document.createElement('div');
    box.id = 'gta6-settings';
    box.style.cssText =
      'position:fixed;bottom:56px;left:12px;z-index:1000000;background:#18181b;color:#efeff1;' +
      'font:12px/1.4 sans-serif;padding:12px;border-radius:8px;width:330px;border:1px solid #9147ff;' +
      'box-shadow:0 4px 16px rgba(0,0,0,.6)';
    const title = document.createElement('div');
    title.textContent = '⚙ Настройки GTA6 автопросмотра · v' + VERSION;
    title.style.cssText = 'font-weight:700;margin-bottom:8px';
    box.appendChild(title);

    const inputs = {};
    for (const [key, label, type, min] of FIELDS) {
      const row = document.createElement('label');
      row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;margin:5px 0';
      const span = document.createElement('span');
      span.textContent = label;
      const inp = document.createElement('input');
      inp.dataset.key = key;
      if (type === 'bool') { inp.type = 'checkbox'; inp.checked = !!CFG[key]; }
      else {
        inp.type = type === 'num' ? 'number' : 'text';
        if (type === 'num') inp.min = String(min);
        inp.value = type === 'list' ? CFG[key].join(', ') : (key === 'categorySlug' ? slug() : CFG[key]);
        inp.style.cssText = 'width:' + (type === 'num' ? '60px' : '130px') +
          ';background:#0e0e10;color:#fff;border:1px solid #555;border-radius:4px;padding:2px 4px';
      }
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

    const save = mkBtn('💾 Сохранить', () => {
      const out = {};
      for (const key in inputs) {
        const { inp, type, min } = inputs[key];
        if (type === 'bool') out[key] = inp.checked;
        else if (type === 'num') out[key] = Math.max(min, Number(inp.value) || DEFAULTS[key]);
        else if (type === 'list') out[key] = inp.value.split(/[\s,]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
        else out[key] = inp.value.trim() || DEFAULTS[key];
      }
      if (out.categorySlug !== slug()) { try { localStorage.setItem('gta6auto_slug', out.categorySlug); } catch (e) {} }
      Object.assign(CFG, out);
      try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(out)); } catch (e) {}
      if (mode === 'watch') applyQuality();
      if (mode) runLoop(); // применить новую частоту проверок
      note.textContent = '✔ Сохранено (действует во всех вкладках, в других — после обновления)';
      log('⚙ настройки сохранены', out);
    });
    const reset = mkBtn('↺ Сбросить по умолчанию', () => {
      try {
        localStorage.removeItem(SETTINGS_KEY);
        localStorage.removeItem('gta6auto_slug');
      } catch (e) {}
      Object.assign(CFG, DEFAULTS, { avoidChannels: [], priorityChannels: [] });
      if (mode === 'watch') applyQuality();
      if (mode) runLoop();
      for (const key in inputs) {
        const { inp, type } = inputs[key];
        if (type === 'bool') inp.checked = !!DEFAULTS[key];
        else inp.value = type === 'list' ? '' : DEFAULTS[key];
      }
      note.textContent = '↺ Настройки сброшены по умолчанию';
      log('⚙ настройки сброшены по умолчанию');
    });
    const close = mkBtn('✕ Закрыть', () => box.remove());
    const upd = mkBtn('⬆ Обновления', toggleUpdate);
    [save, reset, upd, close].forEach((b) => { b.style.marginLeft = '0'; btns.appendChild(b); });
    box.appendChild(btns);
    box.appendChild(note);
    document.body.appendChild(box);
  }

  // ---------- обновления скрипта ----------
  // Tampermonkey сам ставит новую версию по @updateURL (обычно раз в сутки), но уже открытые вкладки
  // продолжают работать на старой, пока их не перезагрузить. Поэтому скрипт:
  //  • раз в 6 ч смотрит @version файла на GitHub и подсвечивает «⬆», если вышла новая;
  //  • запоминает самую новую запущенную версию (gta6auto_seenver). Если в другой вкладке уже
  //    заработала версия новее — вкладка с автопросмотром сама перезагружается на неё.
  const UPD_KEY = 'gta6auto_update';      // { at, latest, notes, err } — общий для всех вкладок
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

  async function getText(url) {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 10000);
    try {
      const r = await fetch(url + '?t=' + Date.now(), { cache: 'no-store', signal: ctrl.signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.text();
    } catch (e) {
      throw new Error(e.name === 'AbortError' ? 'GitHub не ответил за 10 с' : e.message);
    } finally { clearTimeout(to); }
  }

  // Разделы CHANGELOG.md вида «## 2.4 — 22.11.2026» → [{ ver, head, lines }]
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
        if (!m) throw new Error('в файле на GitHub нет строки @version');
        let notes = prev.notes || [];
        try { notes = parseChangelog(await getText(CHANGELOG_URL)).slice(0, 15); } catch (e) {}
        const info = { at: Date.now(), latest: m[1], notes };
        try { localStorage.setItem(UPD_KEY, JSON.stringify(info)); } catch (e) {}
        if (cmpVer(info.latest, VERSION) > 0) {
          if (manual || info.latest !== prev.latest) log(`⬆ на GitHub есть v${info.latest} (в этой вкладке v${VERSION})`);
          tryUpdateReload('на GitHub вышла v' + info.latest);
        } else if (manual) log(`✔ обновлений нет, v${VERSION} — последняя`);
      } catch (e) {
        // Не получилось — попробуем снова через час, а не через 6
        const info = Object.assign({}, prev, { at: Date.now() - UPD_EVERY + 3600000, err: e.message, errAt: Date.now() });
        try { localStorage.setItem(UPD_KEY, JSON.stringify(info)); } catch (e2) {}
        if (manual || !prev.err) log('⚠ не удалось проверить обновления: ' + e.message);
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
      log(`✨ скрипт обновлён: v${prev} → v${VERSION}`);
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
    log(`🔄 перезапускаю вкладку на v${target} (${why})`);
    navigating = true; navAt = Date.now(); navUrl = location.href;
    location.reload();
  }

  function openInstall() {
    // Tampermonkey перехватывает открытие *.user.js и показывает страницу «Обновить»
    window.open(SCRIPT_URL, '_blank', 'noopener');
    log('⬆ открыл установку новой версии с GitHub');
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
    title.textContent = '⬆ Обновления GTA6 автопросмотра · у тебя v' + VERSION;
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

    const install = mkBtn('⬆ Установить', () => {
      openInstall();
      hint.style.display = 'block';
      hint.textContent = 'В открывшейся вкладке Tampermonkey нажми «Обновить», потом вернись сюда и нажми ' +
        '«🔄 Перезапустить вкладку». Остальные вкладки с автопросмотром перезапустятся на новую версию сами.';
      reloadB.style.display = '';
    });
    install.style.background = '#ffd34d'; install.style.color = '#000';
    const reloadB = mkBtn('🔄 Перезапустить вкладку', () => { log('🔄 вкладка перезапущена кнопкой'); location.reload(); });
    const check = mkBtn('🔍 Проверить сейчас', () => runCheck());
    const gh = mkBtn('GitHub', () => window.open(REPO_URL, '_blank', 'noopener'));
    const close = mkBtn('✕ Закрыть', () => box.remove());
    [install, reloadB, check, gh, close].forEach((b) => { b.style.marginLeft = '0'; btns.appendChild(b); });

    function fill() {
      const u = updInfo();
      const onGh = newerOnGithub(), inst = newerInstalled();
      install.style.display = onGh && !inst ? '' : 'none';
      if (onGh && !inst) install.textContent = '⬆ Установить v' + onGh;
      if (inst) {
        status.textContent = `✔ v${inst} уже установлена. Перезапусти вкладку, чтобы она заработала здесь.`;
        reloadB.style.display = '';
      } else if (onGh) {
        status.textContent = `⬆ Вышла v${onGh} (у тебя v${VERSION}).`;
      } else if (u.latest && !u.err) {
        status.textContent = `✔ У тебя последняя версия — v${VERSION}.`;
      } else {
        status.textContent = u.err ? '' : 'Ещё не проверял.';
      }
      if (!inst && hint.style.display === 'none') reloadB.style.display = 'none';
      const ts = (t) => new Date(t).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      const okAt = u.err ? null : u.at;
      when.textContent = (u.err ? `⚠ Не удалось проверить (${ts(u.errAt || Date.now())}): ${u.err}` : okAt ? 'Проверено: ' + ts(okAt) : '') +
        (CFG.updateCheck ? '' : ' · автопроверка выключена в ⚙');
      const notes = u.notes || [];
      const want = onGh || inst
        ? notes.filter((n) => cmpVer(n.ver, VERSION) > 0)
        : notes.filter((n) => cmpVer(n.ver, VERSION) === 0);
      pre.textContent = want.length
        ? (onGh || inst ? 'Что нового:\n\n' : 'Что нового в этой версии:\n\n') +
          want.map((n) => 'v' + n.head + '\n' + n.lines.join('\n')).join('\n\n')
        : 'Список изменений: ' + REPO_URL + '/blob/main/CHANGELOG.md';
    }
    function runCheck() {
      status.textContent = '🔍 Проверяю GitHub…';
      check.disabled = true;
      checkUpdate(true).then(() => { check.disabled = false; if (box.isConnected) fill(); });
    }

    box.appendChild(title); box.appendChild(status); box.appendChild(when); box.appendChild(pre);
    box.appendChild(btns); box.appendChild(hint);
    document.body.appendChild(box);
    fill();
    // Окно открыли — значит, хотят узнать сейчас; не чаще раза в минуту
    if (Date.now() - (updInfo().at || 0) > 60000 || updInfo().err) runCheck();
  }

  // Версия на плашке — это и есть кнопка «проверить обновления»
  function verTag() {
    const inst = newerInstalled(), onGh = newerOnGithub();
    const b = mkBtn('v' + VERSION, toggleUpdate);
    b.style.cssText = 'background:transparent;color:#fff;border:0;border-radius:4px;padding:2px 4px;margin-left:4px;' +
      'font:11px sans-serif;cursor:pointer;opacity:.75';
    b.title = 'Проверить обновления';
    if (inst || onGh) {
      b.textContent = inst ? `🔄 v${inst} — перезапусти` : `⬆ v${onGh}`;
      b.title = inst ? 'Новая версия установлена — перезапусти вкладку' : 'Вышла новая версия — нажми, чтобы обновить';
      b.style.cssText += ';background:#ffd34d;color:#000;opacity:1;font-weight:700';
    } else if (justUpdated) {
      b.textContent = '✨ v' + VERSION;
      b.title = 'Скрипт обновлён с v' + justUpdated + ' — нажми, чтобы посмотреть, что нового';
      b.style.opacity = '1';
    }
    return b;
  }

  function render() {
    const el = panel();
    if (!el) return;
    el.innerHTML = '';
    if (mode) {
      const t = document.createElement('span');
      t.textContent = (mode === 'watch' ? '👀 GTA6: ' : '🎁 GTA6: ') + (lastStatus || 'запускаю…');
      el.appendChild(t);
      if (mode === 'watch') {
        const g = mkBtn('🎁', openClaimTab);
        g.title = 'Открыть сбор наград в новой вкладке';
        el.appendChild(g);
      }
      el.appendChild(gearBtn());
      el.appendChild(logBtn());
      el.appendChild(mkBtn('⏹ Стоп', deactivate));
      el.appendChild(verTag());
    } else if (menuOpen) {
      if (location.pathname.startsWith('/drops/inventory')) {
        el.appendChild(mkBtn('🎁 Собирать награды здесь', () => activate('claim')));
        el.appendChild(mkBtn('👀 Смотреть в этой вкладке', () => activate('watch')));
      } else {
        el.appendChild(mkBtn('👀 Смотреть в этой вкладке', () => activate('watch')));
        el.appendChild(mkBtn('🎁 Награды в новой вкладке', () => { menuOpen = false; render(); openClaimTab(); }));
      }
      el.appendChild(gearBtn());
      el.appendChild(logBtn());
      el.appendChild(mkBtn('✕', () => { menuOpen = false; render(); }));
      el.appendChild(verTag());
    } else {
      const b = mkBtn('🎮 GTA6', () => { menuOpen = true; render(); });
      b.style.marginLeft = '0';
      b.title = 'Автопросмотр дропсов GTA VI';
      el.style.padding = '4px';
      el.appendChild(b);
      el.appendChild(verTag());
      return;
    }
    el.style.padding = '6px 8px';
  }

  function openClaimTab() {
    window.open('https://www.twitch.tv/drops/inventory#gta6-claim', '_blank', 'noopener');
  }

  function badge(text) {
    lastStatus = text;
    render();
  }

  // ---------- метка в названии вкладки ----------
  let tabTag = '';
  const TAG_RE = /^(🟢|🟡|🔎|🎁) [^|]*\| /;
  function applyTitle() {
    const base = document.title.replace(TAG_RE, '');
    const want = tabTag ? tabTag + ' | ' + base : base;
    if (document.title !== want) document.title = want;
  }
  function setTab(tag) { tabTag = tag; applyTitle(); }
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
    log(m === 'watch' ? '▶ включён автопросмотр' : '▶ включён сбор наград');
    // Если уже на нужной странице — начинаем сразу, иначе переходим.
    if (m === 'watch' && !channelFromPath()) { goDirectory(); return; }
    if (m === 'claim' && !location.pathname.startsWith('/drops/inventory')) {
      badge('открываю инвентарь…'); nav('https://www.twitch.tv/drops/inventory', 'сбор наград'); return;
    }
    runLoop();
  }

  function deactivate() {
    mode = null;
    sessionStorage.removeItem(MODE_KEY);
    clearTimeout(timer);
    timer = null;
    lastStatus = '';
    setTab('');
    log('⏹ скрипт остановлен кнопкой');
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
      if (!t) throw new Error('не вошёл в аккаунт');
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
      throw new Error(e.name === 'AbortError' ? 'Twitch не ответил за 10 с' : e.message);
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
      } catch (e) { log('проверка приоритетных не удалась:', e.message); }
    }
    if (CFG.preferFollowed && authToken()) {
      try {
        const d = await gql('query{currentUser{followedLiveUsers(first:100){edges{node{login stream{viewersCount game{name slug}}}}}}}', true);
        const edges = (d.currentUser && d.currentUser.followedLiveUsers && d.currentUser.followedLiveUsers.edges) || [];
        res.followed = edges.map((e) => e.node)
          .filter((n) => n && n.stream && n.stream.game && isGtaGame(n.stream.game.slug, n.stream.game.name))
          .sort((a, b) => (b.stream.viewersCount || 0) - (a.stream.viewersCount || 0))
          .map((n) => n.login.toLowerCase());
      } catch (e) { log('проверка фолловов через API не удалась:', e.message); }
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
    badge('переключаюсь на ' + login + (why ? ' ' + why : ''));
    nav('https://www.twitch.tv/' + login, 'выбран канал ' + login + (why ? ' ' + why : ''));
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
    setTab('🔎 Ищу');
    badge('ищу: ⭐ приоритетные → ❤ фолловы → категория…');
    let p = { priority: [], followed: null };
    try { p = await findPreferred(); } catch (e) {}
    const best = bestOf(p, CFG.preferFollowed);
    if (best) return goChannel(best, whyLabel(rankOf(best, p)));
    // API фолловов не ответил — смотрим страницу «Подписки → В эфире»
    if (CFG.preferFollowed && p.followed === null && authToken() && !sessionStorage.getItem('gta6auto_fwtried')) {
      sessionStorage.setItem('gta6auto_fwtried', '1');
      nav('https://www.twitch.tv/directory/following/live', 'API фолловов не ответил, ищу на странице подписок');
      return;
    }
    // результат уже проверен — в каталоге повторно не проверяем
    sessionStorage.setItem('gta6auto_dirchecked', String(Date.now()));
    nav(dirUrl(true), 'у ⭐/❤ нет GTA VI — общий каталог');
  }

  // Во время просмотра иногда проверяем, не начал ли кто-то из ⭐/❤ стримить GTA VI
  async function checkUpgrade(ch) {
    if (prefChecking || navigating) return;
    prefChecking = true;
    try {
      const p = await findPreferred();
      const best = bestOf(p, CFG.switchToFollowed);
      if (best && best !== ch && rankOf(best, p) < rankOf(ch, p)) {
        log(`${whyLabel(rankOf(best, p))} ${best} начал GTA VI — ухожу с ${ch}`);
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
      badge('проверяю ⭐ приоритетных и ❤ фолловов…');
      findPreferred().then((p) => {
        const best = bestOf(p, CFG.preferFollowed);
        if (best) return goChannel(best, whyLabel(rankOf(best, p)));
        if (CFG.preferFollowed && p.followed === null && authToken() && !sessionStorage.getItem('gta6auto_fwtried')) {
          sessionStorage.setItem('gta6auto_fwtried', '1'); // страницу «Подписки» пробуем один раз за поиск
          nav('https://www.twitch.tv/directory/following/live', 'API фолловов не ответил, ищу на странице подписок');
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
      setTab('🔎 Ищу');
      badge('ищу GTA VI у фолловов… ' + dirSec + 'с');
      if (dirSec >= 10) nav(dirUrl(true), 'у фолловов нет GTA VI'); // в общую категорию
      return;
    }
    setTab('🔎 Ищу');
    badge('ищу стрим в категории… ' + dirSec + 'с');
    if (dirSec >= 60) {
      // нет стримов с дропсами — пробуем всю категорию, и наоборот
      const withDrops = location.search.includes('tl=DropsEnabled');
      nav(CFG.dropsOnly ? dirUrl(true) : dirUrl(!withDrops), 'в каталоге за 60 с не нашлось стримов');
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
        if (apiDown) { apiDown = false; log('✔ API Twitch снова отвечает'); }
      })
      .catch((e) => {
        if (!apiDown) { apiDown = true; log('⚠ API Twitch не отвечает (' + e.message + '), проверяю по странице'); }
        else console.log('[GTA6] API всё ещё не отвечает:', e.message);
      })
      .finally(() => { apiBusy = false; });
  }

  function watchTick() {
    if (location.pathname.startsWith('/directory/')) return pickFromDirectory();

    const ch = channelFromPath();
    if (!ch) { badge('не на канале — ищу стрим'); return goDirectory(); }

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

    let problem = '';
    if (!s.live) problem = 'оффлайн';
    else if (!s.rightGame) problem = 'не GTA VI (' + s.game + ')';
    else if (now() - lastMoveAt >= 60000) problem = 'video';

    // первые секунды страница ещё грузится — не пугаемся
    if (problem && !lastOk && !apiFresh && now() - startedAt < 15000) {
      setTab('🔎 Старт');
      badge(ch + ' — загружается…');
      return;
    }
    if (problem === 'video') problem = 'видео зависло';

    lastOk = !problem || s.ad;
    // в журнал — только смену состояния, а не каждую проверку
    const stateKey = ch + '|' + (s.ad ? 'ad' : problem || 'ok');
    if (stateKey !== lastStateKey) {
      lastStateKey = stateKey;
      const src = apiFresh ? 'по данным Twitch' : 'по странице';
      log(s.ad ? `${ch}: реклама` : problem ? `${ch}: ${problem} (${src})` : `${ch}: смотрю, всё ок (${src})`);
    }
    if (!problem || s.ad) {
      badSince = 0;
      setTab('🟢 Фарм');
      const why = currentWhy(ch);
      badge(ch + (why ? ' ' + why : '') + ' — ' + (s.ad ? 'реклама, жду' : 'смотрю ✔'));
      const wantCheck = CFG.priorityChannels.length || (CFG.preferFollowed && CFG.switchToFollowed);
      if (wantCheck && now() - lastPrefCheck >= CFG.preferCheckMin * 60000) {
        lastPrefCheck = now();
        checkUpgrade(ch);
      }
      return;
    }

    setTab('🟡 Жду');
    if (!badSince) badSince = now();
    const badSec = Math.round((now() - badSince) / 1000);
    badge(`${ch} — ${problem}, переключусь через ${Math.max(0, CFG.switchAfterSec - badSec)}с`);
    if (badSec >= CFG.switchAfterSec && !navigating) {
      log(`↪ ухожу с ${ch}: ${problem} уже ${badSec} с`);
      markBad(ch);
      goDirectory();
    }
  }

  // ---------- режим сбора наград ----------
  const claimStart = Date.now();
  function claimTick() {
    if (!location.pathname.startsWith('/drops/inventory')) {
      if (!navigating) nav('https://www.twitch.tv/drops/inventory', 'вкладка наград ушла с инвентаря');
      return;
    }
    const btns = $$('button').filter((b) => {
      const t = (b.textContent || '').trim();
      return !b.disabled && /^(claim|получить|забрать)/i.test(t);
    });
    let total = +(sessionStorage.getItem('gta6auto_claimed') || 0);
    btns.forEach((b) => { b.click(); total++; log('🎁 нажал «' + b.textContent.trim() + '», всего: ' + total); });
    sessionStorage.setItem('gta6auto_claimed', String(total));

    setTab(`🎁 Награды (${total})`);
    const claimSec = (Date.now() - claimStart) / 1000;
    const left = CFG.inventoryReloadMin * 60 - claimSec;
    badge(`инвентарь · нажато «Получить»: ${total} · обновлю через ${Math.ceil(left / 60)} мин`);
    if (left <= 0 && !navigating) { navigating = true; navAt = Date.now(); navUrl = location.href; location.reload(); }
  }

  function runLoop() {
    clearTimeout(timer);
    const fastUntil = Date.now() + 30000;
    const loop = () => {
      if (!mode) return;
      try { navWatchdog(); (mode === 'watch' ? watchTick : claimTick)(); } catch (e) { log('⚠ ошибка в скрипте:', e && e.stack ? e.stack.split('\n').slice(0, 2).join(' | ') : e); }
      // Пока страница грузится / в каталоге / ещё не подтвердили стрим — проверяем каждую секунду
      const fast = location.pathname.startsWith('/directory/') ||
        (mode === 'watch' && !lastOk && Date.now() < fastUntil);
      timer = setTimeout(loop, fast ? 1000 : CFG.tickSec * 1000);
    };
    timer = setTimeout(loop, 300);
    setTab(mode === 'watch' ? '🔎 Старт' : `🎁 Награды (${+(sessionStorage.getItem('gta6auto_claimed') || 0)})`);
    log(`страница загружена (v${VERSION}): ${location.pathname}`);
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
      if (inst) tryUpdateReload('в другой вкладке уже работает v' + inst);
    }, 3000);
    window.addEventListener('storage', (e) => {
      if (e.key === SEEN_KEY || e.key === UPD_KEY) render();
      if (e.key === SEEN_KEY && newerInstalled()) tryUpdateReload('в другой вкладке уже работает v' + newerInstalled());
    });
    // Проверка обновлений: через 20 с после загрузки (чтобы не мешать странице), потом раз в 10 мин смотрим, не пора ли
    setTimeout(maybeCheckUpdate, 20000);
    setInterval(maybeCheckUpdate, 600000);
    if (mode) runLoop();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
