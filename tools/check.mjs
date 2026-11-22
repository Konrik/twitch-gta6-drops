// Проверка перед публикацией (её же запускает GitHub Actions): node tools/check.mjs
//  • файл скрипта синтаксически верен;
//  • @version в шапке совпадает с запасным значением в константе VERSION;
//  • в CHANGELOG.md есть раздел для этой версии, и он стоит первым;
//  • @updateURL / @downloadURL ведут на raw-файл ветки main без хеша коммита.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(root, 'twitch-gta6-drops.user.js');
const src = readFileSync(SCRIPT, 'utf8');
const log = readFileSync(join(root, 'CHANGELOG.md'), 'utf8');
const errors = [];

try { execFileSync(process.execPath, ['--check', SCRIPT], { stdio: 'pipe' }); }
catch (e) { errors.push('синтаксическая ошибка:\n' + String(e.stderr)); }

const header = (src.match(/^\/\/\s*@version\s+(\S+)/m) || [])[1];
const fallback = (src.match(/GM_info\.script\.version;[\s\S]*?return '([^']+)';/) || [])[1];
if (!header) errors.push('нет @version в шапке');
if (header !== fallback) errors.push(`@version ${header} не совпадает с запасным значением VERSION ${fallback}`);

const first = (log.match(/^##\s+v?(\d+(?:\.\d+)*)/m) || [])[1];
if (first !== header) errors.push(`первый раздел CHANGELOG.md — ${first}, а версия скрипта — ${header}`);

const repo = (src.match(/const REPO = '([^']+)'/) || [])[1];
const raw = `https://raw.githubusercontent.com/${repo}/main/twitch-gta6-drops.user.js`;
for (const k of ['updateURL', 'downloadURL']) {
  const v = (src.match(new RegExp(`^//\\s*@${k}\\s+(\\S+)`, 'm')) || [])[1];
  if (v !== raw) errors.push(`@${k} = ${v}, ожидалось ${raw}`);
}

if (errors.length) { console.error('✖ ' + errors.join('\n✖ ')); process.exit(1); }
console.log(`✔ всё в порядке, версия ${header}`);
