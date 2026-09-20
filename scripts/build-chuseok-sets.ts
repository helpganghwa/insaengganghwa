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

/** 세트마다 분위기 갈래(look)를 두고, 갈래마다 무기·방어구·장신구를 한 줄로 보여 준다. alts = 같은 갈래에서 앞서 만든 다른 그림(작게). */
type Item = { slot: '무기' | '방어구' | '장신구'; key: string; note: string };
type Look = { title: string; note: string; fresh?: boolean; items: Item[]; alts?: string[] };
const SETS: { title: string; lead: string; looks: Look[] }[] = [
  {
    title: '한복',
    lead: '같은 컨셉을 두 가지 분위기로 만들었습니다.',
    looks: [
      {
        title: '화려하게',
        note: '궁중 예복. 진홍 비단에 금실 자수, 옥과 산호 구슬.',
        items: [
          { slot: '무기', key: 'chuseok_hanbok_sword_v2', note: '의장검 · 용을 새긴 칼날' },
          { slot: '방어구', key: 'chuseok_hanbok_hwarot_v2', note: '활옷 · 황금 치마' },
          { slot: '장신구', key: 'chuseok_bok_pouch_v4', note: '복주머니 · 학 자수' },
        ],
        alts: ['chuseok_hanbok_sword', 'chuseok_hanbok_bow', 'chuseok_hanbok_hwarot', 'chuseok_hanbok_dangui', 'chuseok_bok_pouch_v3'],
      },
      {
        title: '단아하게',
        note: '미색과 연분홍, 연보라에 은실 매화. 무기는 은장도.',
        fresh: true,
        items: [
          { slot: '무기', key: 'chuseok_hanbok_dagger', note: '은장도 · 은 세공 자루, 연보라 술' },
          { slot: '방어구', key: 'chuseok_hanbok_pastel', note: '매화 한복 · 분홍에서 연보라로 번지는 치마' },
          { slot: '장신구', key: 'chuseok_bok_pouch_v5', note: '매화 복주머니 · 은실 매화, 진주' },
        ],
      },
    ],
  },
  {
    title: '달토끼',
    lead: '장식을 걷어 낸 쪽과 동화풍으로 귀엽게 만든 쪽입니다.',
    looks: [
      {
        title: '심플하게',
        note: '형태만 남긴 깨끗한 흰색.',
        items: [
          { slot: '무기', key: 'chuseok_rabbit_pestle_v3', note: '절굿공이 · 붉은 끈' },
          { slot: '방어구', key: 'chuseok_moonrabbit_suit_v4', note: '달토끼 옷 · 분홍 리본, 솜꼬리' },
          { slot: '장신구', key: 'chuseok_rabbit_ears_v4', note: '토끼 귀 · 한쪽 귀가 접힘' },
        ],
        alts: ['chuseok_rabbit_pestle_v4', 'chuseok_rabbit_ears_v3'],
      },
      {
        title: '동화풍으로',
        note: '크림색과 분홍 리본. 떡이 묻은 절굿공이, 롬퍼, 늘어진 귀.',
        fresh: true,
        items: [
          { slot: '무기', key: 'chuseok_rabbit_pestle_v5', note: '떡 묻은 절굿공이 · 큰 분홍 리본' },
          { slot: '방어구', key: 'chuseok_rabbit_romper', note: '토끼 롬퍼 · 방울 단추, 솜꼬리, 분홍 구두' },
          { slot: '장신구', key: 'chuseok_rabbit_lop_ears', note: '늘어진 토끼 귀 · 분홍 리본' },
        ],
      },
    ],
  },
  {
    title: '새 컨셉',
    lead: '세 번째 세트 후보 두 가지입니다.',
    looks: [
      {
        title: '풍물놀이',
        note: '한가위 농악패. 알록달록한 축제 분위기.',
        items: [
          { slot: '무기', key: 'chuseok_pungmul_banner', note: '오색 깃발 창 · 세로로 서서 가늘게 나옴' },
          { slot: '방어구', key: 'chuseok_pungmul_outfit', note: '풍물패 옷 · 삼색 띠' },
          { slot: '장신구', key: 'chuseok_pungmul_gokkal', note: '꽃 고깔 · 오색 종이꽃' },
        ],
      },
      {
        title: '추수',
        note: '풍년 들판. 벼 이삭과 햇과일.',
        fresh: true,
        items: [
          { slot: '무기', key: 'chuseok_harvest_sickle', note: '황금 낫 · 벼 이삭 묶음, 붉은 리본' },
          { slot: '방어구', key: 'chuseok_harvest_outfit', note: '가을걷이 옷 · 짚 조끼, 밤과 감이 든 주머니' },
          { slot: '장신구', key: 'chuseok_harvest_hat', note: '참새 밀짚모자 · 챙에 앉은 참새' },
        ],
      },
    ],
  },
];

let made = 0;
const sections = SETS.map((s) => {
  const looks = s.looks.map((l) => {
    const tiles = l.items
      .map((it) => {
        const src = uri(it.key);
        if (src) made += 1;
        return `<figure class="opt"><div class="tile">${src ? `<img src="${src}" alt="${esc(nameOf(it.key))}">` : '<span class="miss">생성 실패</span>'}</div><figcaption><b>${esc(it.slot)}</b>${esc(it.note)}</figcaption></figure>`;
      })
      .join('');
    const alts = (l.alts ?? [])
      .map((k) => {
        const ps = uri(k);
        return ps ? `<figure class="prev"><img src="${ps}" alt="${esc(nameOf(k))}"><figcaption>${esc(nameOf(k))}</figcaption></figure>` : '';
      })
      .join('');
    return `<article class="card">
      <div class="head"><span class="slot">${esc(l.title)}${l.fresh ? '<em>새 그림</em>' : ''}</span><span class="note">${esc(l.note)}</span></div>
      <div class="opts">${tiles}</div>
      ${alts ? `<div class="meta"><p class="plabel">같은 분위기로 만든 다른 그림</p><div class="prevs">${alts}</div></div>` : ''}
    </article>`;
  });
  return `<section><h2>${esc(s.title)} 세트</h2><p class="slead">${esc(s.lead)}</p><div class="cards">${looks.join('')}</div></section>`;
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
  .head { display:flex; flex-wrap:wrap; justify-content:space-between; align-items:baseline; gap:4px 12px; padding:9px 12px; border-bottom:1px solid var(--line); }
  .slot { font-size:14px; font-weight:800; color:var(--accent); }
  .slot em { font-style:normal; font-size:11px; font-weight:800; color:var(--fresh); margin-left:8px; }
  .note { font-size:11.5px; color:var(--muted); }
  .opts { display:grid; grid-template-columns:repeat(3,1fr); gap:1px; background:var(--line); }
  @media (max-width:560px) { .opts { grid-template-columns:1fr; } }
  .opt { margin:0; background:var(--panel); }
  .opt figcaption { padding:7px 11px 9px; font-size:12px; color:var(--muted); line-height:1.45; }
  .opt figcaption b { display:block; font-size:11px; color:var(--ink); letter-spacing:.04em; }
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
  <p class="lead">세트마다 분위기를 두 갈래로 만들었습니다. 갈래 하나가 무기, 방어구, 장신구 한 벌입니다. 방금 만든 갈래는 초록색으로 표시했습니다. 세트별로 어느 갈래로 갈지 골라 주세요. 부위를 섞어 고르셔도 됩니다.</p>
  ${sections.join('')}
</div>
`;
writeFileSync(out, html);
console.log(`검토 페이지 → ${out} (후보 그림 ${made}장)`);
