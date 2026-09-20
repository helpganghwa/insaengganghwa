// 추석 확정 컨셉 세트 검토 페이지(2026-09-19~20) — 세트별·부위별로 최신 후보를 같은 크기로 나란히 두고, 그보다 앞서 만든 그림은 작게 곁들인다.
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

/** options = 같은 부위의 최신 후보들(같은 크기로 나란히, fresh=방금 만든 그림). prev = 그보다 앞서 만든 그림(작게). */
type Option = { key: string; note: string; fresh?: boolean };
type Piece = { slot: string; options: Option[]; prev?: string[] };
const SETS: { title: string; lead: string; pieces: Piece[] }[] = [
  {
    title: '한복',
    lead: '궁중 예복 수준으로 화려하게. 같은 방식으로 두 번 만들어 부위마다 고를 수 있습니다.',
    pieces: [
      {
        slot: '무기',
        options: [
          { key: 'chuseok_hanbok_sword_v2', note: '의장검 · 용을 새긴 칼날, 봉황 머리 자루', fresh: true },
          { key: 'chuseok_hanbok_sword', note: '의장검 · 금 상감 칼날, 연꽃 코등이' },
          { key: 'chuseok_hanbok_bow', note: '금박 각궁' },
        ],
        prev: ['chuseok_hanbok_fan', 'chuseok_hanbok_lantern'],
      },
      {
        slot: '방어구',
        options: [
          { key: 'chuseok_hanbok_hwarot_v2', note: '활옷 · 황금 치마', fresh: true },
          { key: 'chuseok_hanbok_hwarot', note: '활옷 · 남색 속치마' },
          { key: 'chuseok_hanbok_dangui', note: '금박 당의' },
        ],
        prev: ['chuseok_hanbok_v2', 'chuseok_hanbok_v3', 'chuseok_hanbok'],
      },
      {
        slot: '장신구',
        options: [
          { key: 'chuseok_bok_pouch_v4', note: '복주머니 · 학 자수, 진주 테두리', fresh: true },
          { key: 'chuseok_bok_pouch_v3', note: '복주머니 · 봉황 자수, 구슬 술' },
        ],
        prev: ['chuseok_bok_pouch', 'chuseok_bok_pouch_v2'],
      },
    ],
  },
  {
    title: '달토끼',
    lead: '장식을 걷어 내고 형태만 남겼습니다.',
    pieces: [
      {
        slot: '무기',
        options: [
          { key: 'chuseok_rabbit_pestle_v4', note: '절굿공이 · 흰 리본', fresh: true },
          { key: 'chuseok_rabbit_pestle_v3', note: '절굿공이 · 붉은 끈' },
        ],
        prev: ['chuseok_rabbit_pestle', 'chuseok_rabbit_pestle_v2', 'chuseok_moonrabbit_mallet'],
      },
      {
        slot: '방어구',
        options: [
          { key: 'chuseok_moonrabbit_suit_v4', note: '달토끼 옷 · 분홍 리본, 솜꼬리' },
          { key: 'chuseok_moonrabbit_suit_v5', note: '잘못 나옴 · 머리 윤곽이 그려지고 몸에 붙는 옷이 됨', fresh: true },
        ],
        prev: ['chuseok_moonrabbit_suit_v2', 'chuseok_moonrabbit_suit'],
      },
      {
        slot: '장신구',
        options: [
          { key: 'chuseok_rabbit_ears_v4', note: '토끼 귀 · 한쪽 귀가 접힘', fresh: true },
          { key: 'chuseok_rabbit_ears_v3', note: '토끼 귀 · 곧은 귀' },
        ],
        prev: ['chuseok_rabbit_ears', 'chuseok_rabbit_ears_v2', 'chuseok_moonrabbit_headband'],
      },
    ],
  },
  {
    title: '풍물놀이',
    lead: '새 컨셉. 한가위 농악패 차림으로, 알록달록한 축제 분위기입니다.',
    pieces: [
      { slot: '무기', options: [{ key: 'chuseok_pungmul_banner', note: '오색 깃발 창 · 꿩깃 장목, 삼색 띠(세로로 서서 가늘게 나옴)', fresh: true }] },
      { slot: '방어구', options: [{ key: 'chuseok_pungmul_outfit', note: '풍물패 옷 · 흰 옷에 검은 더거리, 삼색 띠', fresh: true }] },
      { slot: '장신구', options: [{ key: 'chuseok_pungmul_gokkal', note: '꽃 고깔 · 오색 종이꽃', fresh: true }], prev: ['chuseok_sangmo'] },
    ],
  },
];

let made = 0;
const sections = SETS.map((s) => {
  const cards = s.pieces.map((p) => {
    const tiles = p.options
      .map((o) => {
        const src = uri(o.key);
        if (src) made += 1;
        return `<figure class="opt"><div class="tile">${src ? `<img src="${src}" alt="${esc(nameOf(o.key))}">` : '<span class="miss">생성 실패</span>'}</div><figcaption>${o.fresh ? '<em>새 그림</em>' : ''}${esc(o.note)}</figcaption></figure>`;
      })
      .join('');
    const prev = (p.prev ?? [])
      .map((k) => {
        const ps = uri(k);
        return ps ? `<figure class="prev"><img src="${ps}" alt="${esc(nameOf(k))}"><figcaption>${esc(nameOf(k))}</figcaption></figure>` : '';
      })
      .join('');
    return `<article class="card">
      <div class="head"><span class="slot">${esc(p.slot)}</span><span class="note">후보 ${p.options.length}개</span></div>
      <div class="opts">${tiles}</div>
      ${prev ? `<div class="meta"><p class="plabel">앞서 만든 그림</p><div class="prevs">${prev}</div></div>` : ''}
    </article>`;
  });
  return `<section><h2>${esc(s.title)} 세트</h2><p class="slead">${esc(s.lead)}</p><div class="cards">${cards.join('')}</div></section>`;
});

const html = `<title>추석 확정 세트</title>
<style>
  :root { --bg:#f4f1ea; --panel:#fffdf8; --ink:#1f1b16; --muted:#6b6358; --line:#e3ddd1; --tile:#18181b; --accent:#9b2c2c; --fresh:#0f7a4f; color-scheme: light; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg:#121110; --panel:#1b1917; --ink:#f2eee7; --muted:#a39a8d; --line:#2e2a26; --tile:#0b0b0c; --accent:#e07b6f; --fresh:#5fd0a0; color-scheme: dark; } }
  :root[data-theme="dark"] { --bg:#121110; --panel:#1b1917; --ink:#f2eee7; --muted:#a39a8d; --line:#2e2a26; --tile:#0b0b0c; --accent:#e07b6f; --fresh:#5fd0a0; color-scheme: dark; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font:14px/1.55 "Pretendard","Apple SD Gothic Neo",system-ui,sans-serif; }
  .wrap { max-width:1080px; margin:0 auto; padding-block:28px 56px; padding-inline:16px; }
  h1 { font-size:22px; margin:0 0 6px; }
  .lead { margin:0; color:var(--muted); max-width:68ch; }
  section { margin-top:30px; padding-top:18px; border-top:1px solid var(--line); }
  h2 { font-size:17px; margin:0 0 4px; }
  .slead { margin:0 0 14px; color:var(--muted); font-size:13px; }
  .cards { display:flex; flex-direction:column; gap:16px; }
  .card { background:var(--panel); border:1px solid var(--line); border-radius:12px; overflow:hidden; }
  .head { display:flex; justify-content:space-between; align-items:center; padding:9px 12px; border-bottom:1px solid var(--line); }
  .slot { font-size:12.5px; font-weight:800; color:var(--accent); letter-spacing:.04em; }
  .note { font-size:11.5px; color:var(--muted); }
  .opts { display:grid; grid-template-columns:repeat(auto-fill,minmax(min(100%,210px),1fr)); gap:1px; background:var(--line); }
  .opt { margin:0; background:var(--panel); }
  .opt figcaption { padding:7px 11px 9px; font-size:12px; color:var(--muted); line-height:1.45; }
  .opt figcaption em { font-style:normal; font-weight:800; color:var(--fresh); margin-right:6px; }
  .tile { background:var(--tile); aspect-ratio:1/1; display:grid; place-items:center; }
  .tile img { width:100%; height:100%; object-fit:contain; image-rendering:pixelated; }
  .miss { color:#a1a1aa; font-size:12px; }
  .meta { padding:8px 12px 12px; border-top:1px solid var(--line); }
  .plabel { margin:0 0 4px; font-size:11px; color:var(--muted); letter-spacing:.04em; }
  .prevs { display:flex; gap:8px; flex-wrap:wrap; }
  .prev { margin:0; width:76px; }
  .prev img { width:76px; height:76px; image-rendering:pixelated; background:var(--tile); border-radius:6px; display:block; }
  .prev figcaption { font-size:10.5px; color:var(--muted); margin-top:2px; line-height:1.3; }
</style>
<div class="wrap">
  <h1>추석 확정 세트</h1>
  <p class="lead">확정한 두 컨셉에 새 컨셉(풍물놀이)을 더한 세 세트입니다. 부위마다 최신 후보를 같은 크기로 나란히 두었고, 방금 만든 그림에는 초록색으로 표시했습니다. 그보다 앞서 만든 그림은 아래에 작게 있습니다. 부위별로 하나씩 골라 주세요.</p>
  ${sections.join('')}
</div>
`;
writeFileSync(out, html);
console.log(`검토 페이지 → ${out} (후보 그림 ${made}장)`);
