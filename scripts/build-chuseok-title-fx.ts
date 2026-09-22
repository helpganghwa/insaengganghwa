/**
 * 한가위 순위 칭호 6종 이펙트 미리보기 아티팩트 빌더 — 게임의 title-fx.css를 그대로 인라인해
 * 채팅 행·프로필·목록 행 크기로 보여 준다. 사용: bun run scripts/build-chuseok-title-fx.ts <출력 html>
 */
import { readFileSync, writeFileSync } from 'node:fs';

const out = process.argv[2];
if (!out) throw new Error('출력 경로가 필요합니다');
const css = readFileSync('components/title-fx.css', 'utf8');

type T = { label: string; fx: string; pt?: string; pc?: number; alt?: string; orb?: boolean; rank: string; note: string };
const MOON: T[] = [
  { label: '신월', fx: 'newmoon', alt: '新月', rank: '3등', note: '은빛. 초승달이 숨 쉬듯 밝아질 때 글자가 오른쪽부터 新月로 번지고, 다음 숨에 신월로 돌아옵니다.' },
  { label: '반월', fx: 'halfmoon', alt: '半月', rank: '2등', note: '체리빛. 붉은 반달이 밝아지며 半月로 바뀝니다.' },
  { label: '만월', fx: 'fullmoon', alt: '滿月', rank: '1등', note: '금빛. 가장 큰 보름달이 밝아지며 滿月로 바뀝니다.' },
];
const FLOWER: T[] = [
  { label: '매화', fx: 'plum', orb: true, pt: 'petal', pc: 6, rank: '3등', note: '백매의 흰빛 도는 연분홍. 매화 여기저기서 흰 꽃잎 여섯 장이 글자 앞뒤로 흩날린 뒤 잠시 쉬고, 다시 흩날립니다.' },
  { label: '작약', fx: 'peony', orb: true, pt: 'petal', pc: 6, rank: '2등', note: '분홍. 작약에서 분홍 꽃잎이 흩날립니다. 꽃이 매화보다 큽니다.' },
  { label: '모란', fx: 'moran', orb: true, pt: 'petal', pc: 6, rank: '1등', note: '진홍. 겹꽃 모란에서 진홍 꽃잎이 흩날립니다. 꽃이 가장 크고 꽃술이 금빛입니다.' },
];
// TitleTag.tsx의 Particles()와 같은 4점 배치·지연.
const dots = [0, 1, 2, 3].map((i) => `<i style="left:${12 + i * 24}%;animation-delay:${(i * 1.35).toFixed(2)}s"></i>`).join('');
const tag = (t: T, size: string) => {
  // TitleTag.tsx와 같은 마크업 — 두 겹 라벨은 .ko/.hj/.orb.
  const inner = t.alt
    ? `<span class="fx fx-${t.fx} fx-dual"><span class="ko">${t.label}</span><span class="hj" aria-hidden="true">${t.alt}</span><i class="orb" aria-hidden="true"></i></span>`
    : t.orb
      ? `<span class="fx fx-${t.fx} fx-orb"><span class="ko">${t.label}</span><i class="orb" aria-hidden="true"></i></span>`
      : `<span class="fx fx-${t.fx}">${t.label}</span>`;
  // pc가 있으면 TitleTag의 SpreadParticles와 같은 음수 지연으로 N개.
  const spread = t.pc ? Array.from({ length: t.pc }, (_, k) => `<i style="animation-delay:${(-(4.8 * k) / t.pc!).toFixed(2)}s"></i>`).join('') : dots;
  const body = t.pt ? `<span class="pt pt-${t.pt}">${inner}${spread}</span>` : inner;
  return `<span class="ttag" style="font-size:${size}">${body}</span>`;
};
const moonTag = (fx: string, base: string, label: string, alt: string, size: string) =>
  `<span class="ttag" style="font-size:${size}"><span class="fx fx-${base} ${fx} fx-dual"><span class="ko">${label}</span><span class="hj" aria-hidden="true">${alt}</span><i class="orb" aria-hidden="true"></i></span></span>`;
const cmpCol = (title: string, sfx: string) => `<div class="ph dark"><h4>${title}</h4>
  <div class="row2">${moonTag(sfx ? 'fx-newmoon' + sfx : '', 'newmoon', '신월', '新月', '22px')}${moonTag(sfx ? 'fx-halfmoon' + sfx : '', 'halfmoon', '반월', '半月', '22px')}${moonTag('', 'fullmoon', '만월', '滿月', '22px')}</div>
  <div class="row3">${moonTag(sfx ? 'fx-newmoon' + sfx : '', 'newmoon', '신월', '新月', '13px')}${moonTag(sfx ? 'fx-halfmoon' + sfx : '', 'halfmoon', '반월', '半月', '13px')}${moonTag('', 'fullmoon', '만월', '滿月', '13px')}</div></div>`;
const cmpBlock = `<section class="set"><h2>달 모양 비교<small>A 지금 · B 모양 유지하고 초승달을 두껍게, 신월은 블루문 색 · C 셋 다 둥근 달(블루문·레드문·골든문)</small></h2>
<div class="cmp">${cmpCol('A · 지금', '')}${cmpCol('B · 두꺼운 초승달 + 블루문 색', 'B')}${cmpCol('C · 둥근 달 세 가지 색', 'C')}</div>
<p class="note" style="margin-top:8px">C는 이름(신월=초승달, 반월=반달)과 그림이 어긋납니다. B는 이름을 지키면서 신월에 블루문 색을 얹은 안입니다.</p></section>`;
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
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@700&display=swap">
<style>
  :root { --font-serif-kr: 'Noto Serif KR'; }
  :root { --bg:#f3efe6; --panel:#fffdf7; --ink:#1d1a15; --muted:#6a6155; --line:#e2dacb; --accent:#a3341f; color-scheme: light; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg:#11100e; --panel:#1a1815; --ink:#f1ece2; --muted:#a2998b; --line:#2d2924; --accent:#e8806a; color-scheme: dark; } }
  :root[data-theme="dark"] { --bg:#11100e; --panel:#1a1815; --ink:#f1ece2; --muted:#a2998b; --line:#2d2924; --accent:#e8806a; color-scheme: dark; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font:14px/1.6 "Pretendard","Apple SD Gothic Neo",system-ui,sans-serif; }
  .wrap { max-width:1080px; margin:0 auto; padding-block:28px 64px; padding-inline:16px; }
  h1 { font-size:23px; margin:0 0 6px; }
  .lead { margin:0 0 8px; color:var(--muted); max-width:72ch; }
  .note { font-size:12.5px; color:var(--muted); }
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
<style>
/* 달 모양 비교(미리보기 전용) */
.cmp{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:14px;margin-top:12px}
.cmp .ph{gap:10px}
.cmp h4{margin:0 0 4px;font-size:13px;color:#a1a1aa;font-weight:600}
.cmp .row2{display:flex;align-items:center;gap:26px;height:44px;padding:0 8px;border-radius:10px;background:#18181b}
.cmp .row3{display:flex;align-items:center;gap:18px;height:30px;padding:0 8px;font-size:13px}
/* B: 초승달을 두껍게(안쪽 반지름 10→12.5), 신월은 블루문 색 */
.fx-newmoonB .orb::before{transform:rotate(28deg);background:radial-gradient(circle at 80% 50%,#eaf3ff 0%,#bcd4ff 45%,#7fa6f0 100%);-webkit-mask-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20'><path d='M9 1 A9 9 0 1 1 9 19 A12.5 12.5 0 0 0 9 1 Z'/></svg>");mask-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20'><path d='M9 1 A9 9 0 1 1 9 19 A12.5 12.5 0 0 0 9 1 Z'/></svg>")}
.fx-newmoonB .ko,.fx-newmoonB .hj{color:#9fbdf5}
.fx-newmoonB{--glow-lo:drop-shadow(0 0 1px rgba(150,190,255,.5));--glow-hi:drop-shadow(0 0 1px rgba(200,222,255,.9)) drop-shadow(0 0 3px rgba(120,170,255,.5))}
/* C: 셋 다 둥근 달, 색만 다름(블루문·레드문·골든문) */
.fx-newmoonC .orb::before,.fx-halfmoonC .orb::before{-webkit-mask-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20'><circle cx='10' cy='10' r='9'/></svg>");mask-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20'><circle cx='10' cy='10' r='9'/></svg>");transform:none;filter:none}
.fx-newmoonC .orb::before{background:radial-gradient(circle at 40% 38%,#f0f6ff 0%,#a9c6ff 50%,#5f8be0 100%)}
.fx-newmoonC .ko,.fx-newmoonC .hj{color:#9fbdf5}
.fx-newmoonC{--glow-lo:drop-shadow(0 0 1px rgba(150,190,255,.5));--glow-hi:drop-shadow(0 0 1px rgba(200,222,255,.9)) drop-shadow(0 0 3px rgba(120,170,255,.5))}
.fx-halfmoonC .orb::before{background:radial-gradient(circle at 40% 38%,#ffe3e8 0%,#ff8aa0 50%,#d63a58 100%)}
</style>
<div class="wrap">
  <h1>한가위 칭호 이펙트</h1>
  <p class="lead">2026 한가위 강화 대회 순위 칭호 6종의 전용 이펙트입니다. 왼쪽은 채팅 행과 프로필 크기, 오른쪽은 칭호 목록 행과 아바타 카드 크기입니다. 게임은 항상 어두운 화면이라 그 위에서만 봅니다. 실제 게임의 이펙트 CSS를 그대로 썼으니 보이는 그대로 들어갑니다. 고칠 점이 있으면 아래에 적어 복사해 주세요.</p>
  ${cmpBlock}
  ${setBlock('달토끼 장비', '3등 은빛 · 2등 체리빛 · 1등 금빛 — 달이 밝아질 때 글자가 오른쪽부터 한자로, 다음에 한글로', MOON)}
  ${setBlock('한복 장비', '3등 매화 흰 연분홍 · 2등 작약 분홍 · 1등 모란 진홍 — 꽃에서 꽃잎이 글자 쪽으로 흩날림', FLOWER)}
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
