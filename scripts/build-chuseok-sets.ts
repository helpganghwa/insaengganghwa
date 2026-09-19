// 추석 확정 컨셉 세트 검토 페이지(2026-09-19) — 세트별로 무기·방어구·장신구를 한 줄에 두고, 다시 만든 부위는 이전 후보를 작게 곁들인다.
// 실행: bun run scripts/build-chuseok-sets.ts <출력 경로>. 유료 호출 없음(public/sprites/chuseok-cand/*.png를 data URI로).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { CANDIDATES } from './gen-chuseok-cand';

const ROOT = process.cwd();
const out = process.argv.slice(2).find((a) => !a.startsWith('--'));
if (!out) {
  console.error('출력 경로 필요');
  process.exit(1);
}
const uri = (k: string) => {
  const p = join(ROOT, 'public', 'sprites', 'chuseok-cand', `${k}.png`);
  return existsSync(p) ? `data:image/png;base64,${readFileSync(p).toString('base64')}` : null;
};
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const nameOf = (k: string) => CANDIDATES.find((c) => c.key === k)?.nameKo ?? k;

/** alt = 같은 부위의 다른 안(5차). 본 그림과 같은 크기로 나란히 둔다. */
type Piece = { slot: string; key: string; note: string; alt?: { key: string; note: string }; prev?: string[] };
const SETS: { title: string; lead: string; pieces: Piece[] }[] = [
  {
    title: '한복',
    lead: '복주머니의 진홍 비단과 금빛에 색을 맞췄습니다. 무기는 합죽선과 청사초롱 두 가지를 만들었습니다.',
    pieces: [
      { slot: '무기', key: 'chuseok_hanbok_fan', note: '가안 · 합죽선', alt: { key: 'chuseok_hanbok_lantern', note: '나안 · 청사초롱' } },
      { slot: '방어구', key: 'chuseok_hanbok_v2', note: '가안 · 옥색 저고리', alt: { key: 'chuseok_hanbok_v3', note: '나안 · 미색 저고리, 금박 꽃무늬' }, prev: ['chuseok_hanbok', 'chuseok_moonrise_hanbok'] },
      { slot: '장신구', key: 'chuseok_bok_pouch', note: '가안 · 1차 그림(달토끼 자수)', alt: { key: 'chuseok_bok_pouch_v2', note: '나안 · 모란 자수' } },
    ],
  },
  {
    title: '달토끼',
    lead: '달에서 떡방아를 찧는 토끼를 세 부위로 나눴습니다. 나안은 달 장식을 덜어 낸 쪽입니다.',
    pieces: [
      { slot: '무기', key: 'chuseok_rabbit_pestle', note: '가안 · 달 장식', alt: { key: 'chuseok_rabbit_pestle_v2', note: '나안 · 토끼 얼굴, 방울술' }, prev: ['chuseok_moonrabbit_mallet'] },
      { slot: '방어구', key: 'chuseok_moonrabbit_suit_v2', note: '가안 · 연보라 띠, 달 장식', alt: { key: 'chuseok_moonrabbit_suit_v3', note: '나안 · 분홍 리본(그림이 작게 나옴)' }, prev: ['chuseok_moonrabbit_suit'] },
      { slot: '장신구', key: 'chuseok_rabbit_ears', note: '가안 · 달 장식', alt: { key: 'chuseok_rabbit_ears_v2', note: '나안 · 분홍 리본, 방울' }, prev: ['chuseok_moonrabbit_headband'] },
    ],
  },
];

let made = 0;
const sections = SETS.map((s) => {
  const cards = s.pieces.map((p) => {
    const src = uri(p.key);
    if (src) made += 1;
    const prev = (p.prev ?? [])
      .map((k) => {
        const ps = uri(k);
        return ps ? `<figure class="prev"><img src="${ps}" alt="${esc(nameOf(k))}"><figcaption>${esc(nameOf(k))}</figcaption></figure>` : '';
      })
      .join('');
    const altSrc = p.alt ? uri(p.alt.key) : null;
    if (altSrc) made += 1;
    const tile = (s: string | null, k: string, note: string) =>
      `<figure class="opt"><div class="tile">${s ? `<img src="${s}" alt="${esc(nameOf(k))}">` : '<span class="miss">생성 실패</span>'}</div><figcaption>${esc(note)}</figcaption></figure>`;
    return `<article class="card">
      <div class="opts">${tile(src, p.key, p.note)}${p.alt ? tile(altSrc, p.alt.key, p.alt.note) : ''}</div>
      <div class="meta">
        <div class="row"><span class="slot">${esc(p.slot)}</span></div>
        ${prev ? `<p class="plabel">이전 후보</p><div class="prevs">${prev}</div>` : ''}
      </div>
    </article>`;
  });
  return `<section><h2>${esc(s.title)} 세트</h2><p class="slead">${esc(s.lead)}</p><div class="cards">${cards.join('')}</div></section>`;
});

const html = `<title>추석 확정 세트</title>
<style>
  :root { --bg:#f4f1ea; --panel:#fffdf8; --ink:#1f1b16; --muted:#6b6358; --line:#e3ddd1; --tile:#18181b; --accent:#9b2c2c; color-scheme: light; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg:#121110; --panel:#1b1917; --ink:#f2eee7; --muted:#a39a8d; --line:#2e2a26; --tile:#0b0b0c; --accent:#e07b6f; color-scheme: dark; } }
  :root[data-theme="dark"] { --bg:#121110; --panel:#1b1917; --ink:#f2eee7; --muted:#a39a8d; --line:#2e2a26; --tile:#0b0b0c; --accent:#e07b6f; color-scheme: dark; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font:14px/1.55 "Pretendard","Apple SD Gothic Neo",system-ui,sans-serif; }
  .wrap { max-width:1080px; margin:0 auto; padding:28px 16px 56px; }
  h1 { font-size:22px; margin:0 0 6px; }
  .lead { margin:0; color:var(--muted); max-width:68ch; }
  section { margin-top:30px; padding-top:18px; border-top:1px solid var(--line); }
  h2 { font-size:17px; margin:0 0 4px; }
  .slead { margin:0 0 14px; color:var(--muted); font-size:13px; }
  .cards { display:grid; grid-template-columns:repeat(auto-fill,minmax(min(100%,320px),1fr)); gap:16px; }
  .opts { display:grid; grid-template-columns:1fr 1fr; gap:1px; background:var(--line); }
  .opt { margin:0; background:var(--panel); }
  .opt figcaption { padding:6px 10px 8px; font-size:11.5px; color:var(--muted); }
  .card { background:var(--panel); border:1px solid var(--line); border-radius:12px; overflow:hidden; }
  .tile { background:var(--tile); aspect-ratio:1/1; display:grid; place-items:center; }
  .tile img { width:100%; height:100%; object-fit:contain; image-rendering:pixelated; }
  .miss { color:#a1a1aa; font-size:12px; }
  .meta { padding:10px 12px 12px; display:flex; flex-direction:column; gap:4px; }
  .row { display:flex; justify-content:space-between; align-items:center; gap:8px; }
  .slot { font-size:12px; font-weight:700; color:var(--accent); letter-spacing:.04em; }
  .note { font-size:11.5px; color:var(--muted); }
  .plabel { margin:8px 0 2px; font-size:11px; color:var(--muted); letter-spacing:.04em; }
  .prevs { display:flex; gap:8px; flex-wrap:wrap; }
  .prev { margin:0; width:76px; }
  .prev img { width:76px; height:76px; image-rendering:pixelated; background:var(--tile); border-radius:6px; display:block; }
  .prev figcaption { font-size:10.5px; color:var(--muted); margin-top:2px; line-height:1.3; }
</style>
<div class="wrap">
  <h1>추석 확정 세트</h1>
  <p class="lead">확정한 두 컨셉을 세트로 모았습니다. 부위마다 가안(먼저 만든 그림)과 나안(다시 만든 그림)을 나란히 두었고, 그보다 앞선 후보는 아래에 작게 두었습니다. 부위별로 하나씩 골라 주세요.</p>
  ${sections.join('')}
</div>
`;
writeFileSync(out, html);
console.log(`검토 페이지 → ${out} (그림 ${made}/12)`);
