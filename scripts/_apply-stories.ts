// _story-new.json 의 new lore 를 sprites-test-review.html 의 각 key 항목에 적용.
import { readFileSync, writeFileSync } from 'fs';
let html = readFileSync('sprites-test-review.html', 'utf8');
const NEW = JSON.parse(readFileSync('scripts/_story-new.json', 'utf8'));
let n = 0; const miss: string[] = [];
for (const [key, o] of Object.entries<any>(NEW)) {
  const re = new RegExp(`(key: '${key}'[\\s\\S]*?lore: ')(?:[^'\\\\]|\\\\.)*(')`);
  if (!re.test(html)) { miss.push(key); continue; }
  html = html.replace(re, (_m, p1, p2) => p1 + o.new + p2);
  n++;
}
writeFileSync('sprites-test-review.html', html);
console.log(`applied ${n} / missing ${miss.length}${miss.length ? ': ' + miss.join(',') : ''}`);
