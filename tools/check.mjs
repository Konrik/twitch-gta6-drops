// Проверка перед публикацией (её же запускает GitHub Actions): node tools/check.mjs
// Основной код (gta6-drops.core.js):
//  • синтаксически верен и кончается меткой // GTA6_CORE_END (по ней загрузчик понимает, что файл скачан целиком);
//  • строка «// @version» в начале совпадает с константой VERSION;
//  • в CHANGELOG.md и CHANGELOG.en.md первый раздел — для этой версии, без пустых пунктов;
//  • в словаре STR у ru и en одинаковые ключи, и все используемые ключи существуют.
// Загрузчик (twitch-gta6-drops.user.js):
//  • синтаксически верен, @version совпадает с запасной версией в коде;
//  • @updateURL / @downloadURL и адрес основного кода ведут на raw-файлы ветки main без хеша коммита.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const CORE = join(root, 'gta6-drops.core.js');
const LOADER = join(root, 'twitch-gta6-drops.user.js');
const core = readFileSync(CORE, 'utf8');
const loader = readFileSync(LOADER, 'utf8');
const errors = [];

for (const f of [CORE, LOADER]) {
  try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); }
  catch (e) { errors.push('синтаксическая ошибка:\n' + String(e.stderr)); }
}

// ---------- основной код ----------
const coreVer = (core.match(/^\/\/\s*@version\s+(\S+)/m) || [])[1];
const coreConst = (core.match(/^ {2}const VERSION = '([^']+)';/m) || [])[1];
if (!coreVer) errors.push('в gta6-drops.core.js нет строки «// @version»');
if (core.indexOf('// @version') > 1024) errors.push('строка «// @version» должна быть в первом килобайте файла (её читают по Range: bytes=0-1023)');
if (coreVer !== coreConst) errors.push(`// @version ${coreVer} не совпадает с константой VERSION ${coreConst}`);
if (!/\/\/ GTA6_CORE_END\s*$/.test(core)) errors.push('gta6-drops.core.js должен кончаться строкой // GTA6_CORE_END');
if (/\bGM_info\b/.test(core.replace(/^\s*\/\/.*$/gm, ''))) errors.push('в основном коде нельзя использовать GM_info: его запускает загрузчик, а не Tampermonkey');

for (const name of ['CHANGELOG.md', 'CHANGELOG.en.md']) {
  const log = readFileSync(join(root, name), 'utf8');
  const first = (log.match(/^##\s+v?(\d+(?:\.\d+)*)/m) || [])[1];
  if (first !== coreVer) errors.push(`первый раздел ${name} — ${first}, а версия основного кода — ${coreVer}`);
  const section = log.slice(log.search(/^##\s/m)).split(/\n(?=##\s)/)[0];
  if (/^-\s*$/m.test(section)) errors.push(`в ${name} в разделе ${first} остался пустой пункт «- »`);
}

// Словарь: ключи ru и en должны совпадать
const dict = core.slice(core.indexOf('const STR = {'), core.indexOf('function tr('));
const [ruPart, enPart] = dict.split(/\n {4}en: \{/);
const keys = (s) => new Set([...s.matchAll(/^ {6}(\w+):/gm)].map((m) => m[1]));
const ru = keys(ruPart), en = keys(enPart || '');
for (const k of ru) if (!en.has(k)) errors.push(`в STR.en нет ключа ${k}`);
for (const k of en) if (!ru.has(k)) errors.push(`в STR.ru нет ключа ${k}`);
// Составные статусы задаются ниже по коду: STR.ru.X = STR.en.X = ...
for (const m of core.matchAll(/STR\.ru\.(\w+) = STR\.en\.\w+ =/g)) { ru.add(m[1]); en.add(m[1]); }
const used = [...core.matchAll(/\b(?:tr|badge|setTab)\('(\w+)'(?!\s*\+)/g)].map((m) => m[1]);
const fields = [...core.matchAll(/^ {4}\['(\w+)', '(?:lang|num|bool|list|text)'/gm)].map((m) => 'f_' + m[1]);
for (const k of new Set([...used, ...fields])) if (!ru.has(k)) errors.push(`ключ ${k} используется, но его нет в словаре STR`);
if (ru.size < 50) errors.push(`в словаре STR подозрительно мало ключей (${ru.size}) — check.mjs не смог его разобрать?`);

// ---------- загрузчик ----------
const repo = (core.match(/const REPO = '([^']+)'/) || [])[1];
const raw = (f) => `https://raw.githubusercontent.com/${repo}/main/${f}`;
const ldrVer = (loader.match(/^\/\/\s*@version\s+(\S+)/m) || [])[1];
const ldrFallback = (loader.match(/GM_info\.script\.version;[\s\S]*?return '([^']+)';/) || [])[1];
if (ldrVer !== ldrFallback) errors.push(`@version загрузчика ${ldrVer} не совпадает с запасной версией в его коде ${ldrFallback}`);
for (const k of ['updateURL', 'downloadURL']) {
  const v = (loader.match(new RegExp(`^//\\s*@${k}\\s+(\\S+)`, 'm')) || [])[1];
  if (v !== raw('twitch-gta6-drops.user.js')) errors.push(`@${k} = ${v}, ожидалось ${raw('twitch-gta6-drops.user.js')}`);
}
const coreUrl = (loader.match(/const CORE_URL = '([^']+)'/) || [])[1];
if (coreUrl !== raw('gta6-drops.core.js')) errors.push(`CORE_URL в загрузчике = ${coreUrl}, ожидалось ${raw('gta6-drops.core.js')}`);

if (errors.length) { console.error('✖ ' + errors.join('\n✖ ')); process.exit(1); }
console.log(`✔ всё в порядке: основной код v${coreVer} (в словаре ${ru.size} ключей на каждом языке), загрузчик v${ldrVer}`);
