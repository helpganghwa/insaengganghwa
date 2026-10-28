// 할로윈 후보 1차 검토 페이지(2026-10-20) — 네 세트 × 3부위 × 2안을 같은 크기로 나란히 둔다.
// 실행: bun run scripts/build-halloween-cand.ts <출력 경로>. 유료 호출 없음(public/sprites/halloween-cand/*.png를 data URI로).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { CANDIDATES, SET_NAME, type HalloweenCand } from './gen-halloween-cand';

const ROOT = process.cwd();
const out = process.argv.slice(2).find((a) => !a.startsWith('--'));
if (!out) {
  console.error('출력 경로 필요');
  process.exit(1);
}
const uri = (k: string) => {
  const p = join(ROOT, 'public', 'sprites', 'halloween-cand', `${k}.png`);
  return existsSync(p) ? `data:image/png;base64,${readFileSync(p).toString('base64')}` : null;
};
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const SLOT_KO: Record<HalloweenCand['slot'], string> = { weapon: '무기', armor: '방어구', accessory: '장신구' };
const SETS: { set: HalloweenCand['set']; lead: string }[] = [
  { set: 'smith', lead: '게임 컨셉. 망치(화심의 망치)·고글(재를 막는 눈)을 피해 집게·앞치마·연장 벨트로 구성했습니다. 밝은 꼬리표.' },
  { set: 'bride', lead: '남성 아바타는 낡은 턱시도로 입힐 예정(이미지는 드레스 한 장). 푸른 촛불·검은 면사포로 애잔한 쪽.' },
  { set: 'frank', lead: '초록 피부는 못 올리므로 옷·소품만. 구리 스패너·꿰맨 재킷·목 볼트 초커.' },
  { set: 'maid', lead: '남성 아바타는 집사 연미복으로 입힐 예정. 앞치마가 대장장이와 겹치는 점은 알려진 사항.' },
];

const tile = (c: HalloweenCand) => {
  const u = uri(c.key);
  return `<figure class="opt"><div class="tile">${u ? `<img src="${u}" alt="${esc(c.nameKo)}">` : '<span class="miss">아직 없음</span>'}</div><figcaption><b>${esc(c.nameKo)}</b>${esc(c.concept)}</figcaption></figure>`;
};

const overview = SETS.map(({ set }) => {
  const firsts = (['weapon', 'armor', 'accessory'] as const).map((s) => CANDIDATES.find((c) => c.set === set && c.slot === s && c.key.endsWith('_a'))!);
  return `<div class="ov"><h3>${esc(SET_NAME[set])}</h3><div class="ovrow">${firsts
    .map((c) => {
      const u = uri(c.key);
      return `<div class="ovtile">${u ? `<img src="${u}" alt="${esc(c.nameKo)}">` : '<span class="miss">없음</span>'}</div>`;
    })
    .join('')}</div></div>`;
}).join('');

const sections = SETS.map(({ set, lead }) => {
  const cards = (['weapon', 'armor', 'accessory'] as const)
    .map((slot) => {
      const opts = CANDIDATES.filter((c) => c.set === set && c.slot === slot);
      return `<div class="card"><div class="head"><span class="slot">${SLOT_KO[slot]}</span><span class="note">2안 — 같은 컨셉, 묘사만 다름</span></div><div class="opts">${opts.map(tile).join('')}</div></div>`;
    })
    .join('');
  return `<section id="${set}"><h2>${esc(SET_NAME[set])}</h2><p class="slead">${esc(lead)}</p><div class="cards">${cards}</div></section>`;
}).join('');

const made = CANDIDATES.filter((c) => uri(c.key)).length;
const html = `<title>할로윈 후보 1차</title>
<style>
  :root { --bg:#f3eee6; --panel:#fffcf6; --ink:#1f1a17; --muted:#6c6259; --line:#e4dccf; --tile:#17171a; --accent:#b4461c; color-scheme: light; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg:#121012; --panel:#1b181b; --ink:#f1ece6; --muted:#a79c90; --line:#2f2a2e; --tile:#0b0b0d; --accent:#f08a4b; color-scheme: dark; } }
  :root[data-theme="dark"] { --bg:#121012; --panel:#1b181b; --ink:#f1ece6; --muted:#a79c90; --line:#2f2a2e; --tile:#0b0b0d; --accent:#f08a4b; color-scheme: dark; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font:14px/1.55 "Pretendard","Apple SD Gothic Neo",system-ui,sans-serif; }
  .wrap { max-width:1080px; margin:0 auto; padding-block:28px 56px; padding-inline:16px; }
  h1 { font-size:22px; margin:0 0 6px; }
  .lead { margin:0; color:var(--muted); max-width:68ch; }
  .lead b { color:var(--ink); }
  nav { display:flex; flex-wrap:wrap; gap:6px; margin-top:14px; }
  nav a { font-size:12px; padding:4px 10px; border:1px solid var(--line); border-radius:999px; color:var(--ink); text-decoration:none; background:var(--panel); }
  .ovs { display:grid; grid-template-columns:repeat(2,1fr); gap:12px; margin-top:22px; }
  @media (max-width:640px) { .ovs { grid-template-columns:1fr; } }
  .ov { background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:10px 12px 12px; }
  .ov h3 { margin:0 0 8px; font-size:14px; color:var(--accent); }
  .ovrow { display:grid; grid-template-columns:repeat(3,1fr); gap:6px; }
  .ovtile { background:var(--tile); aspect-ratio:1/1; display:grid; place-items:center; border-radius:8px; overflow:hidden; }
  .ovtile img { width:100%; height:100%; object-fit:contain; image-rendering:pixelated; }
  section { margin-top:30px; padding-top:18px; border-top:1px solid var(--line); }
  h2 { font-size:17px; margin:0 0 4px; }
  .slead { margin:0 0 14px; color:var(--muted); font-size:13px; max-width:72ch; }
  .cards { display:flex; flex-direction:column; gap:16px; }
  .card { background:var(--panel); border:1px solid var(--line); border-radius:12px; overflow:hidden; }
  .head { display:flex; flex-wrap:wrap; justify-content:space-between; align-items:baseline; gap:4px 12px; padding:9px 12px; border-bottom:1px solid var(--line); }
  .slot { font-size:14px; font-weight:800; color:var(--accent); }
  .note { font-size:11.5px; color:var(--muted); }
  .opts { display:grid; grid-template-columns:repeat(2,1fr); gap:1px; background:var(--line); }
  @media (max-width:560px) { .opts { grid-template-columns:1fr; } }
  .opt { margin:0; background:var(--panel); }
  .opt figcaption { padding:7px 11px 9px; font-size:12px; color:var(--muted); line-height:1.45; }
  .opt figcaption b { display:block; font-size:12px; color:var(--ink); margin-bottom:2px; }
  .tile { background:var(--tile); aspect-ratio:1/1; display:grid; place-items:center; }
  .tile img { width:100%; height:100%; object-fit:contain; image-rendering:pixelated; }
  .miss { color:#a1a1aa; font-size:12px; }
</style>
<div class="wrap">
  <h1>할로윈 후보 1차</h1>
  <p class="lead">10월 20일 · 네 세트 × 3부위 × 2안 = 24장(생성됨 <b>${made}</b>장) · Pixellab 객체 256px, 추석 후보와 같은 조건. 어두운 세트는 꼬리표에서 'not gothic'을 뺐습니다. 부위마다 a·b 중 하나를 고르거나 '다시'를 말씀해 주세요.</p>
  <nav>${SETS.map(({ set }) => `<a href="#${set}">${esc(SET_NAME[set])}</a>`).join('')}</nav>
  <div class="ovs">${overview}</div>
  ${sections}
</div>
`;
writeFileSync(out, html);
console.log(`${out} — ${made}/${CANDIDATES.length}장 포함`);
