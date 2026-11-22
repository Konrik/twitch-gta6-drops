// Проверка перед публикацией (её же запускает GitHub Actions): node tools/check.mjs
//  • файл скрипта синтаксически верен;
//  • @version в шапке совпадает с запасным значением в константе VERSION;
//  • в CHANGELOG.md и CHANGELOG.en.md есть раздел для этой версии, и он стоит первым, без пустых пунктов;
//  • @updateURL / @downloadURL ведут на raw-файл ветки main без хеша коммита;
//  • в словаре STR у ru и en одинаковые ключи, и все используемые ключи существуют.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(root, 'twitch-gta6-drops.user.js');
const src = readFileSync(SCRIPT, 'utf8');
const errors = [];

try { execFileSync(process.execPath, ['--check', SCRIPT], { stdio: 'pipe' }); }
catch (e) { errors.push('синтаксическая ошибка:\n' + String(e.stderr)); }

const header = (src.match(/^\/\/\s*@version\s+(\S+)/m) || [])[1];
const fallback = (src.match(/GM_info\.script\.version;[\s\S]*?return '([^']+)';/) || [])[1];
if (!header) errors.push('нет @version в шапке');
if (header !== fallback) errors.push(`@version ${header} не совпадает с запасным значением VERSION ${fallback}`);

for (const name of ['CHANGELOG.md', 'CHANGELOG.en.md']) {
  const log = readFileSync(join(root, name), 'utf8');
  const first = (log.match(/^##\s+v?(\d+(?:\.\d+)*)/m) || [])[1];
  if (first !== header) errors.push(`первый раздел ${name} — ${first}, а версия скрипта — ${header}`);
  const section = log.slice(log.search(/^##\s/m)).split(/\n(?=##\s)/)[0];
  if (/^-\s*$/m.test(section)) errors.push(`в ${name} в разделе ${first} остался пустой пункт «- »`);
}

const repo = (src.match(/const REPO = '([^']+)'/) || [])[1];
const raw = `https://raw.githubusercontent.com/${repo}/main/twitch-gta6-drops.user.js`;
for (const k of ['updateURL', 'downloadURL']) {
  const v = (src.match(new RegExp(`^//\\s*@${k}\\s+(\\S+)`, 'm')) || [])[1];
  if (v !== raw) errors.push(`@${k} = ${v}, ожидалось ${raw}`);
}

// Словарь: ключи ru и en должны совпадать
const dict = src.slice(src.indexOf('const STR = {'), src.indexOf('function tr('));
const [ruPart, enPart] = dict.split(/\n {4}en: \{/);
const keys = (s) => new Set([...s.matchAll(/^ {6}(\w+):/gm)].map((m) => m[1]));
const ru = keys(ruPart), en = keys(enPart || '');
for (const k of ru) if (!en.has(k)) errors.push(`в STR.en нет ключа ${k}`);
for (const k of en) if (!ru.has(k)) errors.push(`в STR.ru нет ключа ${k}`);
// Составные статусы задаются ниже по коду: STR.ru.X = STR.en.X = ...
for (const m of src.matchAll(/STR\.ru\.(\w+) = STR\.en\.\w+ =/g)) { ru.add(m[1]); en.add(m[1]); }
const used = [...src.matchAll(/\b(?:tr|badge|setTab)\('(\w+)'(?!\s*\+)/g)].map((m) => m[1]);
const fields = [...src.matchAll(/^ {4}\['(\w+)', '(?:lang|num|bool|list|text)'/gm)].map((m) => 'f_' + m[1]);
for (const k of new Set([...used, ...fields])) if (!ru.has(k)) errors.push(`ключ ${k} используется, но его нет в словаре STR`);
if (ru.size < 50) errors.push(`в словаре STR подозрительно мало ключей (${ru.size}) — check.mjs не смог его разобрать?`);

if (errors.length) { console.error('✖ ' + errors.join('\n✖ ')); process.exit(1); }
console.log(`✔ всё в порядке, версия ${header}, в словаре ${ru.size} ключей на каждом языке`);
