// Поднять версию.
//   node tools/bump.mjs 3.1            — основной код (gta6-drops.core.js): строка «// @version» и константа VERSION,
//                                        плюс новый раздел в CHANGELOG.md и CHANGELOG.en.md
//   node tools/bump.mjs --loader 3.1   — загрузчик (twitch-gta6-drops.user.js): @version и запасная версия в коде.
//                                        Нужно только если менялся сам загрузчик.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const isLoader = args[0] === '--loader';
const next = isLoader ? args[1] : args[0];
if (!/^\d+(\.\d+)+$/.test(next || '')) {
  console.error('Укажи новую версию, например: node tools/bump.mjs 3.1  (или --loader 3.1 для загрузчика)');
  process.exit(1);
}
const cmp = (a, b) => {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  return 0;
};
function bumpFile(file, fallbackRe) {
  let src = readFileSync(file, 'utf8');
  const cur = (src.match(/^\/\/\s*@version\s+(\S+)/m) || [])[1];
  if (cur && cmp(next, cur) <= 0) { console.error(`Новая версия ${next} должна быть больше текущей ${cur}`); process.exit(1); }
  src = src.replace(/^(\/\/\s*@version\s+)\S+/m, `$1${next}`);
  const before = src;
  src = src.replace(fallbackRe, `$1${next}$2`);
  if (src === before) { console.error('Не нашёл вторую копию версии в коде ' + file); process.exit(1); }
  writeFileSync(file, src);
  return cur;
}

if (isLoader) {
  const cur = bumpFile(join(root, 'twitch-gta6-drops.user.js'), /(GM_info\.script\.version;[\s\S]*?return ')[^']+(';)/);
  console.log(`Загрузчик ${cur} → ${next}. Tampermonkey обновит его у всех сам.`);
  process.exit(0);
}

const cur = bumpFile(join(root, 'gta6-drops.core.js'), /(^ {2}const VERSION = ')[^']+(';)/m);
const CHANGELOGS = ['CHANGELOG.md', 'CHANGELOG.en.md'];
const d = new Date();
const date = [d.getDate(), d.getMonth() + 1].map((x) => String(x).padStart(2, '0')).join('.') + '.' + d.getFullYear();
for (const name of CHANGELOGS) {
  const file = join(root, name);
  let log = readFileSync(file, 'utf8');
  if (new RegExp(`^##\\s+v?${next.replace(/\./g, '\\.')}\\b`, 'm').test(log)) continue;
  const at = log.search(/^##\s/m);
  const entry = `## ${next} — ${date}\n- \n\n`;
  log = at >= 0 ? log.slice(0, at) + entry + log.slice(at) : log + '\n' + entry;
  writeFileSync(file, log);
}
console.log(`Основной код ${cur} → ${next}. Допиши, что изменилось, в ${CHANGELOGS.join(' и ')}, потом commit и push.`);
