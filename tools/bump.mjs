// Поднять версию скрипта: node tools/bump.mjs 2.6
// Меняет @version в шапке, запасное значение в константе VERSION
// и добавляет раздел в CHANGELOG.md и CHANGELOG.en.md.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(root, 'twitch-gta6-drops.user.js');
const CHANGELOGS = ['CHANGELOG.md', 'CHANGELOG.en.md'];

const next = process.argv[2];
if (!/^\d+(\.\d+)+$/.test(next || '')) {
  console.error('Укажи новую версию, например: node tools/bump.mjs 2.6');
  process.exit(1);
}

let src = readFileSync(SCRIPT, 'utf8');
const cur = (src.match(/^\/\/\s*@version\s+(\S+)/m) || [])[1];
const cmp = (a, b) => {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  return 0;
};
if (cur && cmp(next, cur) <= 0) {
  console.error(`Новая версия ${next} должна быть больше текущей ${cur}`);
  process.exit(1);
}

src = src.replace(/^(\/\/\s*@version\s+)\S+/m, `$1${next}`);
const before = src;
src = src.replace(/(GM_info\.script\.version;[\s\S]*?return ')[^']+(';)/, `$1${next}$2`);
if (src === before) { console.error('Не нашёл запасное значение версии в константе VERSION'); process.exit(1); }
writeFileSync(SCRIPT, src);

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
console.log(`Версия ${cur} → ${next}. Допиши, что изменилось, в ${CHANGELOGS.join(' и ')}, потом commit и push.`);
