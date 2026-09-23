// 추석 시험 아바타 검토 페이지(2026-09-19) — scripts/out/chuseok-avatars/<n>.png와 조합 정보로 단일 HTML(데이터 URI).
// 실행: bun run scripts/build-chuseok-avatar-review.ts <출력 경로>. 유료 호출 없음.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { CATALOG_ITEMS } from '../lib/game/equipment/catalog';

import { CANDIDATES } from './gen-chuseok-cand';

const ROOT = process.cwd();
const SET = Number(process.argv.find((a) => a.startsWith('--set='))?.slice(6) ?? 1);
const OUT_DIR = join(ROOT, 'scripts', 'out', SET >= 3 ? `chuseok-avatars-${SET}` : SET === 2 ? 'chuseok-avatars-2' : 'chuseok-avatars');
const out = process.argv.slice(2).find((a) => !a.startsWith('--'));
if (!out) {
  console.error('출력 경로 필요');
  process.exit(1);
}
const uri = (p: string) => (existsSync(p) ? `data:image/png;base64,${readFileSync(p).toString('base64')}` : null);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const nameOf = (k: string) => CATALOG_ITEMS.find((c) => c.key === k)?.nameKo ?? CANDIDATES.find((c) => c.key === k)?.nameKo ?? k;
/** 확정 6종은 슬롯 폴더(정본), 후보는 chuseok-cand. */
const itemImg = (k: string) => {
  const cat = CATALOG_ITEMS.find((c) => c.key === k);
  return uri(cat ? join(ROOT, 'public', 'sprites', cat.slot, `${k}.png`) : join(ROOT, 'public', 'sprites', 'chuseok-cand', `${k}.png`));
};

type Meta = { gender: 'male' | 'female'; weapon: string; armor: string; accessory: string };
const cards: string[] = [];
let made = 0;
for (let n = 1; n <= 8; n++) {
  const mp = join(OUT_DIR, `${n}.json`);
  if (!existsSync(mp)) continue;
  const m = JSON.parse(readFileSync(mp, 'utf8')) as Meta;
  const av = uri(join(OUT_DIR, `${n}.png`));
  if (av) made += 1;
  const items = [m.weapon, m.armor, m.accessory]
    .map((k) => {
      const src = itemImg(k);
      return `<li>${src ? `<img src="${src}" alt="">` : ''}<span>${esc(nameOf(k))}</span></li>`;
    })
    .join('');
  cards.push(`<article class="card">
    <div class="av">${av ? `<img src="${av}" alt="시험 아바타 ${n}">` : '<span class="miss">생성 실패</span>'}</div>
    <div class="meta"><div class="no">#${n} · ${m.gender === 'male' ? '남성' : '여성'}</div><ul>${items}</ul></div>
  </article>`);
}

const title = SET >= 3 ? `추석 시험 아바타 ${SET}차` : SET === 2 ? '추석 시험 아바타 2차' : '추석 시험 아바타';
const html = `<title>${title}</title>
<style>
  :root { --bg:#f3f1ec; --panel:#fffdf8; --ink:#1f1b16; --muted:#6b6358; --line:#e3ddd1; --stage:#e9e4da; color-scheme: light; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg:#121110; --panel:#1b1917; --ink:#f2eee7; --muted:#a39a8d; --line:#2e2a26; --stage:#26231f; color-scheme: dark; } }
  :root[data-theme="dark"] { --bg:#121110; --panel:#1b1917; --ink:#f2eee7; --muted:#a39a8d; --line:#2e2a26; --stage:#26231f; color-scheme: dark; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font:14px/1.55 "Pretendard","Apple SD Gothic Neo",system-ui,sans-serif; }
  .wrap { max-width:1120px; margin:0 auto; padding:28px 16px 56px; }
  h1 { font-size:22px; margin:0 0 6px; }
  .lead { margin:0 0 22px; color:var(--muted); max-width:70ch; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(min(100%,250px),1fr)); gap:16px; }
  .card { background:var(--panel); border:1px solid var(--line); border-radius:12px; overflow:hidden; }
  .av { background:var(--stage); aspect-ratio:1/1; display:grid; place-items:center; }
  .av img { width:100%; height:100%; object-fit:contain; image-rendering:pixelated; }
  .miss { color:var(--muted); font-size:12px; }
  .meta { padding:10px 12px 12px; }
  .no { font-weight:700; font-size:13px; margin-bottom:6px; }
  ul { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:4px; }
  li { display:flex; align-items:center; gap:8px; font-size:12.5px; color:var(--muted); }
  li img { width:32px; height:32px; image-rendering:pixelated; background:#18181b; border-radius:6px; }
</style>
<div class="wrap">
  <h1>${title}</h1>
  <p class="lead">실서버와 같은 생성 과정(장비 그림을 보고 AI가 설명을 조립한 뒤 Pixellab이 그림)으로 만든 시험 아바타 ${made}개입니다. 조합마다 입힌 장비 세 개를 아래에 두었습니다. ${SET === 6 ? '남성 한복을 저고리·배자·바지로, 절굿공이를 양 끝이 굵고 가운데가 잘록한 형태로 고친 뒤 다시 만든 4개입니다. 남성 한복 2개, 절굿공이 3개가 들어 있습니다.' : SET === 5 ? '절굿공이 비유를 없애고 남성 한복을 hanbok으로 명명한 뒤 다시 만든 4개입니다. 남성 한복 2개, 절굿공이 3개가 들어 있습니다.' : SET === 4 ? '착용 묘사를 고친 뒤 다시 만든 4개입니다. 남성 한복 2개, 절굿공이 3개, 여성 토끼 인형 옷 2개가 들어 있습니다.' : SET === 3 ? '확정 6종을 카탈로그 정본 그대로 입혔습니다. 한복 세트와 달토끼 세트는 남녀 완성형으로, 나머지는 교차 조합이며 한복 방어구는 남성에게 두 번 입혀 치마가 남성 한복으로 옮겨지는지 봅니다.' : SET === 2 ? '왕 · 무관 · 저승사자 · 선비 코스튬을 완성형으로 넣고, 새 방어구는 남녀로 한 번씩 입혔습니다.' : '방어구 세 종은 남녀로 한 번씩, 무기와 장신구는 고루 섞었습니다.'}</p>
  <div class="grid">${cards.join('')}</div>
</div>
`;
writeFileSync(out, html);
console.log(`검토 페이지 → ${out} (아바타 ${made}개)`);
