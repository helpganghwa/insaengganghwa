/**
 * 한가위 순위 칭호 6종 이펙트 미리보기 아티팩트 빌더 — 게임의 title-fx.css를 그대로 인라인해
 * 채팅 행·프로필·목록 행 크기로 보여 준다. 사용: bun run scripts/build-chuseok-title-fx.ts <출력 html>
 */
import { readFileSync, writeFileSync } from 'node:fs';

const out = process.argv[2];
if (!out) throw new Error('출력 경로가 필요합니다');
const css = readFileSync('components/title-fx.css', 'utf8');

type T = { label: string; fx: string; pt?: string; alt?: string; rank: string; note: string };
const MOON: T[] = [
  { label: '신월', fx: 'newmoon', alt: '新月', rank: '3등', note: '작은 초승달이 글자 위를 좌우로 오가고, 그 빛이 닿은 글자만 新月로 바뀝니다. 비추는 폭이 가장 좁습니다.' },
  { label: '반월', fx: 'halfmoon', alt: '半月', rank: '2등', note: '반달이 오가며 半月로 바뀝니다. 비추는 폭과 빛이 초승달보다 넓고 셉니다.' },
  { label: '만월', fx: 'fullmoon', alt: '滿月', rank: '1등', note: '금빛 보름달이 오가며 滿月로 바뀝니다. 비추는 폭이 가장 넓고 글자에 금빛 후광이 붙습니다.' },
];
const FLOWER: T[] = [
  { label: '매화', fx: 'plum', rank: '3등', note: '흰 꽃잎이 연분홍으로 물들었다 돌아오는 숨결입니다.' },
  { label: '작약', fx: 'peony', rank: '2등', note: '장밋빛과 연분홍이 흐릅니다.' },
  { label: '모란', fx: 'moran', pt: 'petal', rank: '1등', note: '진홍에서 금빛으로 흐르고, 꽃잎이 글자 위에서 떨어집니다.' },
];
// TitleTag.tsx의 Particles()와 같은 4점 배치·지연.
const dots = [0, 1, 2, 3].map((i) => `<i style="left:${12 + i * 24}%;animation-delay:${(i * 1.35).toFixed(2)}s"></i>`).join('');
const tag = (t: T, size: string) => {
  // TitleTag.tsx와 같은 마크업 — 두 겹 라벨은 .ko/.hj/.orb.
  const inner = t.alt
    ? `<span class="fx fx-${t.fx} fx-dual"><span class="ko">${t.label}</span><span class="hj" aria-hidden="true">${t.alt}</span><i class="orb" aria-hidden="true"></i></span>`
    : `<span class="fx fx-${t.fx}">${t.label}</span>`;
  const body = t.pt ? `<span class="pt pt-${t.pt}">${inner}${dots}</span>` : inner;
  return `<span class="ttag" style="font-size:${size}">${body}</span>`;
};
const setBlock = (title: string, sub: string, items: T[]) => `
<section class="set">
  <h2>${title}<small>${sub}</small></h2>
  <div class="rows">
  ${items.map((t) => `<div class="row"><span class="rk">${t.rank}</span>
    <div class="ph dark"><div class="chat">${tag(t, '13px')}<b>달빛모루</b><span>오늘도 두들깁니다</span></div><div class="prof">${tag(t, '22px')}</div></div>
    <div class="ph dark"><div class="lrow">${tag(t, '15px')}<span class="lsub">한가위 · 한정</span><span class="lpill">보유</span></div><div class="card"><span class="av"></span><div><b>달빛모루</b>${tag(t, '12px')}</div><span class="cp">⚔ 12,480</span></div></div>
    <p class="note">${t.note}</p></div>`).join('')}
  </div>
</section>`;

const html = `<title>한가위 칭호 이펙트</title>
<style>
  :root { --bg:#f3efe6; --panel:#fffdf7; --ink:#1d1a15; --muted:#6a6155; --line:#e2dacb; --accent:#a3341f; color-scheme: light; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg:#11100e; --panel:#1a1815; --ink:#f1ece2; --muted:#a2998b; --line:#2d2924; --accent:#e8806a; color-scheme: dark; } }
  :root[data-theme="dark"] { --bg:#11100e; --panel:#1a1815; --ink:#f1ece2; --muted:#a2998b; --line:#2d2924; --accent:#e8806a; color-scheme: dark; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font:14px/1.6 "Pretendard","Apple SD Gothic Neo",system-ui,sans-serif; }
  .wrap { max-width:1080px; margin:0 auto; padding-block:28px 64px; padding-inline:16px; }
  h1 { font-size:23px; margin:0 0 6px; }
  .lead { margin:0 0 8px; color:var(--muted); max-width:72ch; }
  h2 { font-size:18px; margin:36px 0 10px; padding-top:18px; border-top:1px solid var(--line); }
  h2 small { font-weight:500; font-size:12.5px; color:var(--muted); margin-left:10px; }
  .row { display:grid; grid-template-columns:44px 1fr 1fr; gap:12px; align-items:stretch; margin-bottom:12px; }
  .row .note { grid-column:2 / span 2; margin:0; font-size:12.5px; color:var(--muted); }
  .rk { font-size:12px; font-weight:700; color:var(--muted); padding-top:14px; }
  .ph { border-radius:14px; padding:12px 14px; display:flex; flex-direction:column; gap:12px; min-width:0; }
  .ph.dark { background:#09090b; color:#f4f4f5; border:1px solid #27272a; }
  .lrow { display:flex; align-items:center; gap:8px; height:36px; }
  .lsub { font-size:11px; color:#71717a; margin-left:auto; } .lpill { font-size:10.5px; font-weight:700; color:#fcd34d; border:1px solid #78350f; border-radius:99px; padding:2px 8px; }
  .card { display:flex; align-items:center; gap:10px; height:44px; border-radius:10px; background:#18181b; padding:0 10px; }
  .card .av { width:28px; height:28px; border-radius:8px; background:linear-gradient(135deg,#7a5a2a,#3b2a12); flex:none; }
  .card div { display:flex; flex-direction:column; line-height:1.2; } .card b { font-size:13px; }
  .card .cp { margin-left:auto; font-size:12px; color:#a1a1aa; font-variant-numeric:tabular-nums; }
  .chat { display:flex; align-items:center; gap:6px; font-size:13px; white-space:nowrap; overflow:hidden; }
  .chat b { font-weight:600; }
  .chat span { color:#71717a; overflow:hidden; text-overflow:ellipsis; }
  .prof { display:flex; align-items:center; justify-content:center; height:44px; border-radius:10px; }
  .ph.dark .prof { background:#18181b; }
  .ttag { font-weight:700; }
  .ttag .fx { font-weight:700; }
  label.m { display:block; font-size:12px; font-weight:700; color:var(--muted); margin:14px 0 4px; }
  textarea { width:100%; min-height:70px; resize:vertical; font:inherit; font-size:13px; color:var(--ink); background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:8px 10px; }
  textarea:focus-visible, button:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
  .acts { display:flex; gap:10px; align-items:center; margin-top:10px; }
  button { font:inherit; font-weight:800; font-size:13.5px; border-radius:10px; padding:9px 16px; border:1px solid var(--accent); background:var(--accent); color:#fff; cursor:pointer; }
  #toast { font-size:12.5px; color:var(--muted); }
  @media (max-width: 640px) { .row { grid-template-columns:36px 1fr; } .row .note { grid-column:2; } }
  @media (prefers-reduced-motion: reduce) { .ttag span, .ttag .pt>i { animation:none !important; } }
</style>
<style>${css}</style>
<div class="wrap">
  <h1>한가위 칭호 이펙트</h1>
  <p class="lead">2026 한가위 강화 대회 순위 칭호 6종의 전용 이펙트입니다. 왼쪽은 채팅 행과 프로필 크기, 오른쪽은 칭호 목록 행과 아바타 카드 크기입니다. 게임은 항상 어두운 화면이라 그 위에서만 봅니다. 실제 게임의 이펙트 CSS를 그대로 썼으니 보이는 그대로 들어갑니다. 고칠 점이 있으면 아래에 적어 복사해 주세요.</p>
  ${setBlock('달토끼 장비', '3등 신월 · 2등 반월 · 1등 만월 — 달이 지나가면 한자로', MOON)}
  ${setBlock('한복 장비', '3등 매화 · 2등 작약 · 1등 모란 — 연분홍에서 진홍과 금으로', FLOWER)}
  <label class="m" for="memo">의견</label><textarea id="memo" placeholder="칭호별로 바꾸고 싶은 색·움직임"></textarea>
  <div class="acts"><button type="button" id="copy">의견 복사</button><span id="toast" role="status"></span></div>
</div>
<script>
(function(){
  var KEY='chuseok-title-fx-v1', m=document.getElementById('memo');
  try{ var v=localStorage.getItem(KEY); if(v) m.value=v; }catch(e){}
  m.addEventListener('input',function(){ try{ localStorage.setItem(KEY,m.value); }catch(e){} });
  document.getElementById('copy').addEventListener('click',function(){
    var t='[한가위 칭호 이펙트 의견]\\n'+m.value.trim();
    function done(){ document.getElementById('toast').textContent='복사했습니다. 채팅에 붙여 주세요.'; }
    if(navigator.clipboard&&navigator.clipboard.writeText){ navigator.clipboard.writeText(t).then(done,function(){ m.select(); try{document.execCommand('copy');done();}catch(e){} }); }
    else { m.select(); try{document.execCommand('copy');done();}catch(e){} }
  });
})();
</script>
`;
writeFileSync(out, html);
console.log(`wrote ${out} (${(html.length / 1024).toFixed(0)} KB)`);
