// ==UserScript==
// @name         Twitch GTA VI Drops — автопросмотр
// @name:en      Twitch GTA VI Drops — auto-watch
// @namespace    gta6-drops
// @version      3.0
// @description  Держит вкладку на живом стриме GTA VI (с дропсами), сам переключает канал, если стрим закончился или стример сменил игру. Во второй вкладке — автосбор наград. Обновляется сам при каждом открытии Twitch.
// @description:en Keeps a tab on a live GTA VI stream with drops and switches channels when the stream ends or the streamer changes game. A second tab can auto-claim rewards. Updates itself every time you open Twitch.
// @homepageURL  https://github.com/Konrik/twitch-gta6-drops
// @supportURL   https://github.com/Konrik/twitch-gta6-drops/issues
// @updateURL    https://raw.githubusercontent.com/Konrik/twitch-gta6-drops/main/twitch-gta6-drops.user.js
// @downloadURL  https://raw.githubusercontent.com/Konrik/twitch-gta6-drops/main/twitch-gta6-drops.user.js
// @match        https://www.twitch.tv/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

/*
  ЗАГРУЗЧИК. Сам скрипт лежит на GitHub в файле gta6-drops.core.js. При каждом открытии Twitch
  загрузчик скачивает его свежую версию и запускает — поэтому обновления начинают работать сразу
  после обновления страницы (GitHub кэширует файл примерно на минуту).

  Последняя рабочая версия сохраняется в браузере (localStorage gta6auto_core). Если GitHub
  не отвечает или новая версия падает при запуске, работает сохранённая копия.

  Этот файл меняется редко. Если меняешь его — подними @version: Tampermonkey обновит загрузчик
  у всех сам (раз в сутки), а скрипт подсветит «⬆» и предложит обновить загрузчик раньше.
*/

(function () {
  'use strict';
  if (window.__gta6Loader) return;   // уже запущен в этой вкладке

  const CORE_URL = 'https://raw.githubusercontent.com/Konrik/twitch-gta6-drops/main/gta6-drops.core.js';
  const CACHE_KEY = 'gta6auto_core';   // { ver, code, at } — последняя версия, которая запустилась без ошибок
  const END_MARK = '// GTA6_CORE_END'; // последняя строка файла: значит, он скачался целиком
  const LOADER_VERSION = (() => {
    try { if (typeof GM_info !== 'undefined' && GM_info.script && GM_info.script.version) return GM_info.script.version; } catch (e) {}
    return '3.0';
  })();

  // Сведения для основного кода: версия загрузчика, хеш адреса (#gta6-claim и т. п. — Twitch может его убрать),
  // откуда взят код и почему не с GitHub
  const info = window.__gta6Loader = { version: LOADER_VERSION, hash: location.hash, source: '', error: '', coreVersion: '' };

  const ru = (() => {
    try {
      const l = (JSON.parse(localStorage.getItem('gta6auto_settings') || '{}').lang) || 'auto';
      if (l === 'ru' || l === 'en') return l === 'ru';
    } catch (e) {}
    return /^(ru|uk|be|kk)/i.test(navigator.language || '');
  })();
  // Запись в общий журнал скрипта (📜)
  function log(msg) {
    console.log('[GTA6 loader]', msg);
    try {
      const arr = JSON.parse(localStorage.getItem('gta6auto_log') || '[]');
      arr.push([Date.now(), sessionStorage.getItem('gta6auto_mode') || '-', String(msg).slice(0, 300)]);
      if (arr.length > 500) arr.splice(0, arr.length - 500);
      localStorage.setItem('gta6auto_log', JSON.stringify(arr));
    } catch (e) {}
  }

  const verOf = (code) => (String(code).match(/^\/\/\s*@version\s+(\S+)/m) || [])[1];
  const valid = (code) => typeof code === 'string' && !!verOf(code) && code.includes(END_MARK);
  function cached() {
    try { const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); return c && valid(c.code) ? c : null; } catch (e) { return null; }
  }
  // Запуск в глобальной области (не видит переменных загрузчика)
  const SRC = '\n//# sourceURL=gta6-drops.core.js';
  function run(code) {
    try {
      (0, eval)(code + SRC);
    } catch (e) {
      // Если eval запрещён политикой безопасности (CSP) — вставляем код на страницу обычным <script>
      if (!(e instanceof EvalError) && !/unsafe-eval|Content Security Policy/i.test(String(e && e.message))) throw e;
      const s = document.createElement('script');
      s.textContent = 'window.__gta6Loader=' + JSON.stringify(info) + ';\n' + code + SRC;
      (document.head || document.documentElement).appendChild(s);
      s.remove();
    }
  }

  async function fetchCore(ms) {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), ms);
    try {
      // метка минуты: все вкладки в течение минуты берут один и тот же файл из кэша GitHub
      const r = await fetch(CORE_URL + '?m=' + Math.floor(Date.now() / 60000), { cache: 'no-cache', signal: ctrl.signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const code = await r.text();
      if (!valid(code)) throw new Error(ru ? 'файл скачался не полностью' : 'file downloaded incompletely');
      return code;
    } catch (e) {
      throw new Error(e.name === 'AbortError' ? (ru ? `нет ответа за ${ms / 1000} с` : `no answer in ${ms / 1000} s`) : e.message);
    } finally { clearTimeout(to); }
  }

  let attempt = 0;
  async function boot() {
    attempt++;
    const old = cached();
    let fresh = null;
    try {
      // есть сохранённая копия — долго GitHub не ждём
      fresh = await fetchCore(old ? 6000 : 15000);
    } catch (e) { info.error = e.message; }

    if (fresh) {
      try {
        info.source = 'github';
        info.coreVersion = verOf(fresh);
        run(fresh);
        if (!old || old.code !== fresh) {
          try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ver: info.coreVersion, code: fresh, at: Date.now() })); } catch (e) {}
        }
        return;
      } catch (e) {
        info.error = (ru ? 'ошибка в версии с GitHub: ' : 'error in the GitHub version: ') + e.message;
        window.__gta6CoreRunning = false;   // упавшая версия могла успеть поставить метку запуска
        // Если запустится сохранённая копия, она сама напишет в журнал, почему. Иначе пишем здесь.
        if (!old || old.code === fresh) log('⚠ ' + info.error);
        if (old && old.code === fresh) return;   // сохранённая копия та же самая — запускать её бессмысленно
      }
    }
    if (old) {
      info.source = 'cache';
      info.coreVersion = old.ver;
      try { run(old.code); } catch (e) { log('⚠ ' + (ru ? 'сохранённая копия тоже не запустилась: ' : 'the saved copy failed too: ') + e.message); }
      return;
    }
    // Ни свежей версии, ни сохранённой — пробуем ещё раз через 30 с
    if (attempt === 1 || attempt % 10 === 0) {
      log('⚠ ' + (ru ? `не удалось скачать скрипт с GitHub (${info.error}), пробую снова каждые 30 с`
        : `could not download the script from GitHub (${info.error}), retrying every 30 s`));
    }
    setTimeout(boot, 30000);
  }
  boot();
})();
