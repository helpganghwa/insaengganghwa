// 추석 후보 검토 페이지(2026-09-19) — public/sprites/chuseok-cand/*.png를 data URI로 넣은 단일 HTML을 만든다(아티팩트 게시용).
// 실행: bun run scripts/build-chuseok-review.ts <출력 경로>
// 부위마다 같은 부위의 기존 아이템 4개를 나란히 둬 화풍·크기가 맞는지 비교한다. 유료 호출 없음.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { CATALOG_ITEMS } from '../lib/game/equipment/catalog';
import { CANDIDATES } from './gen-chuseok-cand';

const ROOT = process.cwd();
const out = process.argv.slice(2).find((a) => !a.startsWith('--'));
/** --batch=2 → 2차 후보만. 없으면 전부. */
const BATCH = process.argv.find((a) => a.startsWith('--batch='))?.slice(8);
if (!out) {
  console.error('출력 경로 필요');
  process.exit(1);
}
const uri = (p: string) => (existsSync(p) ? `data:image/png;base64,${readFileSync(p).toString('base64')}` : null);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const SLOTS = [
  { slot: 'weapon', ko: '무기' },
  { slot: 'armor', ko: '방어구' },
  { slot: 'accessory', ko: '장신구' },
] as const;
// 비교용 기존 아이템 — 지역이 겹치지 않게 부위당 4개.
function refsOf(slot: string) {
  const seen = new Set<string>();
  const out: { name: string; src: string }[] = [];
  for (const it of CATALOG_ITEMS) {
    if (it.slot !== slot || seen.has(it.region)) continue;
    const src = uri(join(ROOT, 'public', 'sprites', slot, `${it.key}.png`));
    if (!src) continue;
    seen.add(it.region);
    out.push({ name: it.nameKo, src });
    if (out.length === 4) break;
  }
  return out;
}

let made = 0;
const sections = SLOTS.map(({ slot, ko }) => {
  const cands = CANDIDATES.filter((c) => c.slot === slot && (!BATCH || String(c.batch) === BATCH)).map((c) => {
    const src = uri(join(ROOT, 'public', 'sprites', 'chuseok-cand', `${c.key}.png`));
    if (src) made += 1;
    return `<figure class="card">
      <div class="tile">${src ? `<img src="${src}" alt="${esc(c.nameKo)}">` : '<span class="miss">생성 실패</span>'}</div>
      <figcaption><b>${esc(c.nameKo)}</b><span>${esc(c.concept)}</span></figcaption>
    </figure>`;
  });
  const refs = refsOf(slot).map(
    (r) => `<figure class="ref"><div class="tile small"><img src="${r.src}" alt="${esc(r.name)}"></div><figcaption>${esc(r.name)}</figcaption></figure>`,
  );
  return `<section>
    <h2>${ko}</h2>
    <div class="cards">${cands.join('')}</div>
    <p class="label">기존 ${ko} 비교</p>
    <div class="refs">${refs.join('')}</div>
  </section>`;
});

const title = BATCH === '2' ? '추석 아이템 후보 2차' : '추석 아이템 후보';
const html = `<title>${title}</title>
<style>
  :root { --bg:#f3f1ec; --panel:#fffdf8; --ink:#1f1b16; --muted:#6b6358; --line:#e3ddd1; --tile:#18181b; --accent:#b4532a; color-scheme: light; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg:#121110; --panel:#1b1917; --ink:#f2eee7; --muted:#a39a8d; --line:#2e2a26; --tile:#0b0b0c; --accent:#e0874f; color-scheme: dark; } }
  :root[data-theme="dark"] { --bg:#121110; --panel:#1b1917; --ink:#f2eee7; --muted:#a39a8d; --line:#2e2a26; --tile:#0b0b0c; --accent:#e0874f; color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font:14px/1.55 "Pretendard","Apple SD Gothic Neo",system-ui,sans-serif; }
  .wrap { max-width:1080px; margin:0 auto; padding:28px 16px 56px; }
  h1 { font-size:22px; margin:0 0 6px; }
  .lead { margin:0; color:var(--muted); max-width:68ch; }
  section { margin-top:30px; padding-top:18px; border-top:1px solid var(--line); }
  h2 { font-size:16px; margin:0 0 12px; }
  .cards { display:grid; grid-template-columns:repeat(auto-fill,minmax(min(100%,220px),1fr)); gap:16px; }
  .card { margin:0; background:var(--panel); border:1px solid var(--line); border-radius:12px; overflow:hidden; }
  .tile { background:var(--tile); aspect-ratio:1/1; display:grid; place-items:center; }
  .tile img { width:100%; height:100%; object-fit:contain; image-rendering:pixelated; }
  .miss { color:#a1a1aa; font-size:12px; }
  figcaption { padding:10px 12px; display:flex; flex-direction:column; gap:2px; }
  figcaption span { color:var(--muted); font-size:12px; }
  .label { margin:16px 0 8px; font-size:12px; color:var(--muted); letter-spacing:.04em; }
  .refs { display:grid; grid-template-columns:repeat(auto-fill,minmax(110px,1fr)); gap:10px; max-width:560px; }
  .ref { margin:0; }
  .ref .tile { border-radius:8px; }
  .ref figcaption { padding:4px 2px; font-size:11px; color:var(--muted); }
</style>
<div class="wrap">
  <h1>${title}</h1>
  <p class="lead">세 번째 Pixellab 키로 만든 후보 ${made}종입니다. 기존 120종과 같은 방식(객체 · 측면 · 256px)으로 만들었고, 부위마다 기존 아이템 4개를 아래에 두어 화풍과 크기를 비교할 수 있게 했습니다. 이름은 검토용 가제입니다.</p>
  ${sections.join('')}
</div>
`;
writeFileSync(out, html);
console.log(`검토 페이지 → ${out} (후보 그림 ${made}/${CANDIDATES.length})`);
