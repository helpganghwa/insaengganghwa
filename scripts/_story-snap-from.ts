import { readFileSync, writeFileSync } from 'fs';
const src = process.argv[2];
const html = readFileSync(src, 'utf8');
const re = /key: '([a-z_]+)'[\s\S]*?lore: '((?:[^'\\]|\\.)*)'/g;
let m: RegExpExecArray | null; const out: Record<string, string> = {};
while ((m = re.exec(html))) { out[m[1]] = m[2].replace(/\\'/g, "'"); }
writeFileSync('scripts/_story-old.json', JSON.stringify(out, null, 0));
console.log('snapshot keys:', Object.keys(out).length);
