import { readFileSync, writeFileSync } from 'fs';
const html = readFileSync('sprites-test-review.html','utf8');
// 모든 아이템의 현재 lore를 key→lore 로 스냅샷
const re=/key: '([a-z_]+)'[\s\S]*?lore: '((?:[^'\\]|\\.)*)'/g;
let m: RegExpExecArray | null; const out: Record<string, string> = {};
while((m=re.exec(html))){ out[m[1]]=m[2].replace(/\\'/g,"'"); }
writeFileSync('scripts/_story-old.json', JSON.stringify(out,null,0));
console.log('snapshot keys:', Object.keys(out).length);
