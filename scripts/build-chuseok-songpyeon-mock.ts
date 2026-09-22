/**
 * 송편(강화 성공 적립, 추석 업데이트 3번) 화면 시안 — 배치 안 3가지 + 순위 탭 스트립 + 배너 + 수치 선택.
 * 사용: bun run scripts/build-chuseok-songpyeon-mock.ts <출력 html>
 * 수치 근거: scripts/chuseok-mileage-dist.json의 level(세금식) 분포(최근 7일, 357명). 닉네임·수치 표시는 예시.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const out = process.argv[2];
if (!out) throw new Error('출력 경로가 필요합니다');
const dist: number[] = JSON.parse(readFileSync('scripts/chuseok-mileage-dist.json', 'utf8')).level;
const n = (v: number) => v.toLocaleString('ko-KR');
const LADDER: [number, number, number][] = [[100, 100, 3], [300, 200, 6], [800, 300, 9], [2000, 400, 12], [5000, 500, 15], [12000, 600, 15], [30000, 800, 21]];
const reach = LADDER.map(([m]) => dist.filter((v) => v >= m).length);
const total = LADDER.reduce((a, [, d, b], i) => ({ dia: a.dia + d * reach[i]!, box: a.box + b * reach[i]! }), { dia: 0, box: 0 });
const totalHalf = { dia: Math.round(total.dia / 2), box: total.box };

// ── 공통 조각 ──
const nav = `<div class="nav"><span>🏠<em>홈</em></span><span>🎒<em>인벤토리</em></span><span>⚒️<em>강화</em></span><span>🏰<em>길드</em></span><span>👤<em>프로필</em></span></div>`;
const head = `<div class="bar"><span class="back">‹</span><b>한가위 강화 대회</b><small>2일 09:14:07 남음</small></div>`;
const seg = (on: 'rank' | 'sp') => `<div class="seg"><span class="${on === 'rank' ? 'on' : ''}">순위</span><span class="${on === 'sp' ? 'on' : ''}">송편</span></div>`;
const MY = 1_240, NEXT = 2_000;
const steps = (cls = '') => `<div class="lad ${cls}">${LADDER.map(([m, d, b], i) => {
  const st = MY >= m ? (i < 2 ? 'done' : 'ready') : '';
  return `<div class="st ${st}"><b>${n(m)}</b><span>💎${n(d)} · 📦${b}</span>${st === 'done' ? '<i>받음</i>' : st === 'ready' ? '<i class="btn">받기</i>' : ''}</div>`;
}).join('')}</div>`;
const shop = `<div class="shop"><div class="it"><b>📦 상자 3개</b><span>150</span><i class="btn">교환</i><small>20회 중 3회 남음</small></div><div class="it"><b>💎 100</b><span>400</span><i class="btn">교환</i><small>20회 중 18회 남음</small></div></div>`;
const foot = `<p class="foot">대회가 끝난 뒤 10/3까지 받고 교환할 수 있어요. 그 뒤 남은 송편은 사라져요.</p>`;

// A · 요약 카드 + 격자 사다리 + 교환 목록
const A = `<div class="ph">${head}${seg('sp')}<div class="body">
  <div class="mine"><span class="lab">내 송편</span><b>${n(MY)}</b><span class="nx">다음 보상까지 ${n(NEXT - MY)}</span><div class="gauge"><i style="width:${Math.round((100 * (MY - 800)) / (2000 - 800))}%"></i></div></div>
  <p class="sub2">도달 보상 <small>빚은 송편 총량으로 따져요. 교환에 써도 줄지 않아요.</small></p>${steps()}
  <p class="sub2">교환 <small>쓸 수 있는 송편 ${n(MY - 300)}</small></p>${shop}${foot}</div>${nav}</div>`;

// B · 세로 진행 트랙(타임라인) + 교환은 접이식
const B = `<div class="ph">${head}${seg('sp')}<div class="body">
  <div class="mine slim"><span class="lab">내 송편</span><b>${n(MY)}</b><span class="nx">교환 가능 ${n(MY - 300)}</span></div>
  <div class="tl">${LADDER.map(([m, d, b], i) => { const st = MY >= m ? (i < 2 ? 'done' : 'ready') : ''; return `<div class="tr ${st}"><span class="dot"></span><span class="m">${n(m)}</span><span class="rw">💎${n(d)} · 📦${b}</span>${st === 'done' ? '<i>받음</i>' : st === 'ready' ? '<i class="btn">받기</i>' : `<i class="left">${n(m - MY)} 더</i>`}</div>`; }).join('')}</div>
  <div class="fold"><b>교환</b><span>📦 상자 3개 = 150 · 💎 100 = 400</span><i>펼치기 ⌄</i></div>${foot}</div>${nav}</div>`;

// C · 가로 이정표 게이지(칭호 발견 게이지처럼) + 큰 숫자 + 2칸 교환
const pos = (m: number) => Math.min(100, Math.round((100 * Math.log10(m)) / Math.log10(30000)));
const C = `<div class="ph">${head}${seg('sp')}<div class="body">
  <div class="big"><span class="lab">빚은 송편</span><b>${n(MY)}</b></div>
  <div class="track"><div class="fill" style="width:${pos(MY)}%"></div>${LADDER.map(([m, d, b], i) => { const st = MY >= m ? (i < 2 ? 'done' : 'ready') : ''; return `<div class="ms ${st}" style="left:${pos(m)}%"><span class="pin"></span><span class="lb">${m >= 1000 ? `${m / 1000}k` : m}</span></div>`; }).join('')}</div>
  <div class="next"><span>다음 보상 <b>2,000</b> · 💎400 · 📦12</span><i class="btn">지금 받을 보상 1개</i></div>
  <div class="shop2"><div class="it2"><b>📦 3개</b><span>150 송편</span><i class="btn">교환</i></div><div class="it2"><b>💎 100</b><span>400 송편</span><i class="btn">교환</i></div></div>${foot}</div>${nav}</div>`;

// 순위 탭 위 송편 스트립(있음/없음)
const RANK = (strip: boolean) => `<div class="ph">${head}${seg('rank')}<div class="body">
  ${strip ? `<div class="strip"><span>내 송편 <b>${n(MY)}</b></span><span class="dotr"></span><span>받을 보상 1개</span><i>송편 탭 ›</i></div>` : ''}
  <div class="chips">${['🗡','👘','👝','🔨','🐰','🎀'].map((e, i) => `<span class="chip${i === 2 ? ' on' : ''}"><em>${e}</em><small>${['3등', '27등', '14등', '8등', '없음', '41등'][i]}</small></span>`).join('')}</div>
  <div class="rows">${['달빛모루', '새벽망치', '은하수'].map((nm, i) => `<div class="row"><span class="rk">${i + 1}</span><b>${nm}</b><span class="lv">+${[112, 112, 97][i]}</span></div>`).join('')}<div class="row dim"><span class="rk">⋯</span></div></div></div>${nav}</div>`;

// 홈 배너 2안
const BAN = `<div class="ph short"><div class="bar"><b>인생강화</b><small>⚔ 12,480 · 💎 2,122</small></div><div class="body">
  <p class="cap2">평소</p><div class="banner"><span class="moon"></span><span class="bt"><b>한가위 강화 대회</b><span>추석 장비 6종, 장비마다 10등까지 보상</span></span><i>2일 09:14:07</i></div>
  <p class="cap2">받을 송편 보상이 생겼을 때</p><div class="banner hot"><span class="moon"></span><span class="bt"><b>한가위 강화 대회</b><span>송편 보상 1개를 받을 수 있어요</span></span><i>받기 ›</i></div>
</div></div>`;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
type Dec = { id: string; title: string; help: string; options: { v: string; rec?: boolean }[] };
const DECS: Dec[] = [
  { id: 'layout', title: '송편 탭 배치', help: 'A는 한눈에 다 보이고, B는 단계 사이 거리감이 살고, C는 칭호 발견 게이지와 같은 문법이라 익숙합니다. 세금식은 단계가 100에서 30,000까지 로그 간격이라 C의 가로 게이지는 로그 눈금으로 그렸습니다.', options: [{ v: 'A · 요약 카드 + 격자 사다리 + 교환 목록', rec: true }, { v: 'B · 세로 진행 트랙, 교환은 접이식' }, { v: 'C · 가로 이정표 게이지 + 큰 숫자' }] },
  { id: 'strip', title: '순위 탭 위 송편 스트립', help: '순위 탭에 들어온 사람에게도 송편이 쌓이고 있음이 보입니다. 한 줄이라 순위표를 밀어내지 않습니다.', options: [{ v: '있음(내 송편 · 받을 보상 · 송편 탭 바로가기)', rec: true }, { v: '없음' }] },
  { id: 'ladder', title: '도달 보상 사다리(세금식 기준)', help: `단계 100·300·800·2,000·5,000·12,000·30,000. 지난주 기록이면 닿는 사람은 ${reach.map((r) => `${Math.round((100 * r) / dist.length)}%`).join(' · ')}. 원안 총 지급 추정 💎${n(total.dia)} · 📦${n(total.box)}(순위 보상 💎510,000의 절반이 넘음), 다이아 절반이면 💎${n(totalHalf.dia)}.`, options: [{ v: '원안: 💎100·200·300·400·500·600·800, 📦3·6·9·12·15·15·21' }, { v: '다이아 절반(💎50·100·150·200·250·300·400), 상자 그대로', rec: true }, { v: '단계를 5개로 줄임(100·500·2,000·8,000·30,000)' }] },
  { id: 'exchange', title: '교환 값과 1인 상한', help: '세금식은 상위 25%가 주 9,000 송편이 넘어, 상한이 없으면 다이아를 대량으로 바꿔 갑니다. 1인 상한 20회면 최대 💎2,000·📦60, 10회면 💎1,000·📦30입니다.', options: [{ v: '📦3 = 150 · 💎100 = 400, 각 20회', rec: true }, { v: '📦3 = 150 · 💎100 = 400, 각 10회' }, { v: '📦3 = 100 · 💎100 = 300, 각 20회' }] },
  { id: 'unit', title: '송편 표기', help: '세금식은 +50 성공에 50점이라 숫자가 빨리 커집니다. 10단계당 1개로 보이게 하면 사다리도 10·30·80·200·500·1,200·3,000이 되어 읽기 쉽습니다. 내부 계산은 같고 표시만 다릅니다.', options: [{ v: '1단계 = 송편 1개(숫자 그대로)' }, { v: '10단계 = 송편 1개(표시만 10으로 나눔)', rec: true }] },
  { id: 'banner', title: '홈 배너', help: '배너는 하나이고, 받을 송편 보상이 생기면 문구만 바뀝니다.', options: [{ v: '평소 남은 시간, 보상 생기면 "송편 보상 N개를 받을 수 있어요"', rec: true }, { v: '항상 남은 시간만' }] },
];

const html = `<title>송편 화면 시안</title>
<style>
  :root { --bg:#f3efe6; --panel:#fffdf7; --ink:#1d1a15; --muted:#6a6155; --line:#e2dacb; --accent:#a3341f; --rec:#0f7a4f; --recbg:#e3f4ec; color-scheme: light; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg:#11100e; --panel:#1a1815; --ink:#f1ece2; --muted:#a2998b; --line:#2d2924; --accent:#e8806a; --rec:#5fd0a0; --recbg:#12291f; color-scheme: dark; } }
  :root[data-theme="dark"] { --bg:#11100e; --panel:#1a1815; --ink:#f1ece2; --muted:#a2998b; --line:#2d2924; --accent:#e8806a; --rec:#5fd0a0; --recbg:#12291f; color-scheme: dark; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font:14px/1.6 "Pretendard","Apple SD Gothic Neo",system-ui,sans-serif; }
  .wrap { max-width:1320px; margin:0 auto; padding-block:28px 72px; padding-inline:16px; }
  h1 { font-size:23px; margin:0 0 6px; } h2 { font-size:18px; margin:40px 0 4px; padding-top:20px; border-top:1px solid var(--line); }
  .lead { margin:0; color:var(--muted); max-width:72ch; } .note { margin:10px 0 0; padding:10px 13px; border:1px solid var(--line); border-radius:10px; background:var(--panel); font-size:13px; max-width:80ch; }
  .figs { display:grid; grid-template-columns:repeat(auto-fill,minmax(min(100%,390px),1fr)); gap:34px 26px; margin-top:18px; align-items:start; }
  figure { margin:0; min-width:0; } figure h3 { font-size:14.5px; margin:0 0 8px; } figcaption { font-size:13px; color:var(--muted); margin-top:10px; }
  label.m { display:block; font-size:12px; font-weight:700; color:var(--muted); margin:10px 0 4px; }
  textarea { width:100%; min-height:58px; resize:vertical; font:inherit; font-size:13px; color:var(--ink); background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:8px 10px; }
  textarea:focus-visible, input:focus-visible, button:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
  .ph { width:390px; max-width:100%; background:#09090b; color:#f4f4f5; border-radius:20px; border:1px solid #27272a; overflow:hidden; font-size:13px; line-height:1.4; position:relative; }
  .ph .bar { display:flex; align-items:center; gap:8px; padding:12px 14px; border-bottom:1px solid #1f1f23; font-size:14px; } .ph .bar .back { font-size:20px; line-height:1; color:#a1a1aa; } .ph .bar small { margin-left:auto; font-size:11.5px; color:#fbbf24; font-weight:700; }
  .ph .body { padding:12px 14px 12px; }
  .seg { display:grid; grid-template-columns:1fr 1fr; margin:10px 14px 0; background:#18181b; border-radius:10px; padding:3px; } .seg span { text-align:center; padding:6px; border-radius:8px; font-size:12.5px; color:#a1a1aa; } .seg span.on { background:#27272a; color:#f4f4f5; font-weight:700; }
  .mine { background:#18181b; border:1px solid rgba(245,158,11,.5); border-radius:12px; padding:10px 12px; display:grid; grid-template-columns:1fr auto; gap:2px 10px; align-items:baseline; }
  .mine .lab { font-size:11px; color:#a1a1aa; } .mine b { font-family:ui-monospace,Menlo,monospace; font-size:24px; color:#fde68a; grid-row:2; } .mine .nx { font-size:11px; color:#fcd34d; grid-column:2; grid-row:2; align-self:end; }
  .mine.slim { grid-template-columns:auto 1fr auto; align-items:center; } .mine.slim b { font-size:20px; grid-row:auto; } .mine.slim .nx { grid-column:auto; grid-row:auto; }
  .gauge { grid-column:1/-1; height:5px; border-radius:3px; background:#27272a; margin-top:6px; overflow:hidden; } .gauge i { display:block; height:100%; background:#f59e0b; }
  .sub2 { margin:14px 0 6px; font-size:12.5px; font-weight:700; } .sub2 small { font-weight:500; color:#a1a1aa; margin-left:6px; }
  .lad { display:grid; grid-template-columns:repeat(4,1fr); gap:6px; } .st { background:#18181b; border:1px solid #27272a; border-radius:10px; padding:7px 4px; text-align:center; display:flex; flex-direction:column; gap:2px; }
  .st b { font-family:ui-monospace,Menlo,monospace; font-size:12.5px; } .st span { font-size:9.5px; color:#a1a1aa; } .st i { font-style:normal; font-size:10px; color:#6ee7b7; } .st.done { border-color:#065f46; } .st.ready { border-color:#f59e0b; background:#241c0c; }
  .btn { display:inline-block; font-style:normal; font-size:10.5px; font-weight:800; background:#d97706; color:#fff; border-radius:7px; padding:3px 8px; }
  .shop { display:flex; flex-direction:column; gap:6px; } .it { display:grid; grid-template-columns:1fr auto auto; gap:2px 10px; align-items:center; background:#18181b; border:1px solid #27272a; border-radius:10px; padding:8px 10px; }
  .it b { font-size:12.5px; } .it span { font-family:ui-monospace,Menlo,monospace; font-size:12.5px; color:#fde68a; } .it small { grid-column:1/-1; font-size:10px; color:#71717a; }
  .foot { margin:12px 0 0; font-size:11px; color:#71717a; }
  .tl { position:relative; margin:12px 0 0 8px; padding-left:18px; border-left:2px solid #27272a; display:flex; flex-direction:column; gap:10px; }
  .tr { display:grid; grid-template-columns:auto 1fr auto; gap:2px 10px; align-items:center; position:relative; } .tr .dot { position:absolute; left:-25px; top:6px; width:10px; height:10px; border-radius:50%; background:#3f3f46; border:2px solid #09090b; }
  .tr.done .dot { background:#10b981; } .tr.ready .dot { background:#f59e0b; box-shadow:0 0 0 3px rgba(245,158,11,.25); }
  .tr .m { font-family:ui-monospace,Menlo,monospace; font-size:13px; } .tr .rw { font-size:11px; color:#a1a1aa; } .tr i { font-style:normal; font-size:10.5px; color:#6ee7b7; grid-column:3; grid-row:1/3; } .tr .left { color:#71717a; }
  .fold { margin-top:14px; display:flex; align-items:center; gap:10px; background:#18181b; border:1px solid #27272a; border-radius:10px; padding:9px 12px; } .fold span { flex:1; font-size:11.5px; color:#a1a1aa; } .fold i { font-style:normal; font-size:11px; color:#a1a1aa; }
  .big { text-align:center; padding:6px 0 2px; } .big .lab { display:block; font-size:11px; color:#a1a1aa; } .big b { font-family:ui-monospace,Menlo,monospace; font-size:34px; color:#fde68a; }
  .track { position:relative; height:44px; margin:14px 6px 4px; } .track::before { content:""; position:absolute; left:0; right:0; top:10px; height:6px; border-radius:3px; background:#27272a; }
  .track .fill { position:absolute; left:0; top:10px; height:6px; border-radius:3px; background:#f59e0b; }
  .ms { position:absolute; top:4px; transform:translateX(-50%); display:flex; flex-direction:column; align-items:center; gap:4px; } .ms .pin { width:14px; height:14px; border-radius:50%; border:3px solid #27272a; background:#09090b; } .ms .lb { font-size:9.5px; color:#a1a1aa; }
  .ms.done .pin { background:#10b981; border-color:#10b981; } .ms.ready .pin { background:#f59e0b; border-color:#f59e0b; box-shadow:0 0 0 3px rgba(245,158,11,.25); }
  .next { display:flex; align-items:center; gap:10px; margin-top:10px; background:#18181b; border:1px solid #27272a; border-radius:10px; padding:9px 12px; font-size:12px; } .next span { flex:1; } .next b { color:#fde68a; }
  .shop2 { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:12px; } .it2 { background:#18181b; border:1px solid #27272a; border-radius:10px; padding:10px; display:flex; flex-direction:column; align-items:center; gap:4px; } .it2 b { font-size:13px; } .it2 span { font-size:11px; color:#fde68a; }
  .strip { display:flex; align-items:center; gap:8px; margin-bottom:10px; background:#18181b; border:1px solid rgba(245,158,11,.45); border-radius:10px; padding:7px 10px; font-size:11.5px; } .strip b { color:#fde68a; font-family:ui-monospace,Menlo,monospace; } .strip .dotr { width:6px; height:6px; border-radius:50%; background:#f59e0b; } .strip i { margin-left:auto; font-style:normal; color:#fcd34d; font-weight:700; }
  .chips { display:grid; grid-template-columns:repeat(6,1fr); gap:6px; } .chip { display:flex; flex-direction:column; align-items:center; padding:6px 0 4px; border-radius:10px; background:#18181b; border:1px solid #27272a; } .chip em { font-style:normal; font-size:18px; } .chip small { font-size:10px; color:#a1a1aa; } .chip.on { border-color:#f59e0b; background:#241c0c; } .chip.on small { color:#fcd34d; font-weight:700; }
  .rows { margin-top:12px; border:1px solid #27272a; border-radius:12px; background:#18181b; overflow:hidden; } .row { display:flex; align-items:center; gap:10px; height:44px; padding:0 12px; border-bottom:1px solid #27272a; } .row:last-child { border-bottom:0; } .row.dim { color:#52525b; justify-content:center; } .rk { width:22px; font-family:ui-monospace,Menlo,monospace; color:#a1a1aa; } .row b { flex:1; font-weight:600; } .lv { font-family:ui-monospace,Menlo,monospace; color:#fde68a; }
  .nav { display:grid; grid-template-columns:repeat(5,1fr); border-top:1px solid #1f1f23; padding:6px 0 8px; font-size:16px; text-align:center; } .nav em { display:block; font-style:normal; font-size:9.5px; color:#a1a1aa; }
  .banner { border-radius:12px; padding:12px 14px; background:linear-gradient(100deg,#3b0f0a 0%,#7a1f12 55%,#c9892b 130%); display:flex; align-items:center; gap:12px; } .banner.hot { background:linear-gradient(100deg,#3b2a0a 0%,#8a5a12 55%,#f0c060 130%); }
  .moon { width:42px; height:42px; border-radius:50%; background:radial-gradient(circle at 35% 35%,#fff6d0,#f2c14e 70%); flex:none; } .bt { min-width:0; flex:1; } .bt b { display:block; font-size:14px; } .bt span { display:block; font-size:11px; color:#fde7c0; } .banner i { flex:none; font-style:normal; font-size:10.5px; font-weight:800; background:rgba(0,0,0,.35); padding:4px 9px; border-radius:99px; }
  .cap2 { margin:10px 0 6px; font-size:11px; color:#71717a; }
  .decs { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr)); gap:14px; margin-top:14px; }
  fieldset { margin:0; border:1px solid var(--line); border-radius:12px; background:var(--panel); padding:12px 14px; min-width:0; } legend { font-weight:800; font-size:14px; padding:0 6px; } .help { margin:0 0 8px; font-size:12.5px; color:var(--muted); }
  .o { display:flex; gap:8px; align-items:flex-start; padding:5px 0; font-size:13.5px; cursor:pointer; } .o input { margin-top:4px; accent-color:var(--accent); } .tag { font-size:10.5px; font-weight:800; color:var(--rec); background:var(--recbg); border-radius:99px; padding:1px 7px; margin-left:6px; white-space:nowrap; }
  #out { min-height:200px; font-family:ui-monospace,Menlo,monospace; font-size:12.5px; } .acts { display:flex; flex-wrap:wrap; gap:10px; align-items:center; margin-top:10px; }
  button { font:inherit; font-weight:800; font-size:13.5px; border-radius:10px; padding:9px 16px; border:1px solid var(--line); background:var(--panel); color:var(--ink); cursor:pointer; } button.p { background:var(--accent); border-color:var(--accent); color:#fff; } #toast { font-size:12.5px; color:var(--rec); }
</style>
<div class="wrap">
  <h1>송편 화면 시안</h1>
  <p class="lead">강화에 성공하면 송편을 빚습니다(세금식, 도달 단계 = 송편). 현황판의 송편 탭 배치 세 가지와 순위 탭 스트립, 홈 배너를 실제 화면 크기로 그렸습니다. 닉네임과 수치는 예시이고 내 송편은 1,240으로 두었습니다. 화면마다 의견을 남기고, 아래 정할 것을 고른 뒤 요약을 복사해 채팅에 붙여 주세요.</p>
  <p class="note">세금식은 성공 한 번에 도달 단계만큼 쌓여 숫자가 빨리 커집니다. 사다리는 100에서 30,000까지 로그 간격으로 잡았고, 지난주 실서버 기록으로 닿는 사람 비율과 총 지급을 함께 계산했습니다.</p>
  <h2>송편 탭 배치</h2>
  <div class="figs">
    <figure data-title="A · 요약 카드 + 격자 사다리 + 교환 목록"><h3>A · 요약 카드 + 격자 사다리 + 교환 목록</h3>${A}<figcaption>위에 내 송편과 다음 보상까지, 가운데 일곱 단계 격자, 아래 교환 목록. 한 화면에 다 들어갑니다.</figcaption><label class="m" for="memo_a">의견</label><textarea class="memo" id="memo_a"></textarea></figure>
    <figure data-title="B · 세로 진행 트랙"><h3>B · 세로 진행 트랙, 교환은 접이식</h3>${B}<figcaption>단계를 세로 타임라인으로 늘어놓아 단계 사이 거리감이 살고, 못 받은 단계에는 몇 개 더 필요한지 적힙니다. 교환은 접어 두었습니다.</figcaption><label class="m" for="memo_b">의견</label><textarea class="memo" id="memo_b"></textarea></figure>
    <figure data-title="C · 가로 이정표 게이지"><h3>C · 가로 이정표 게이지 + 큰 숫자</h3>${C}<figcaption>칭호 발견 게이지와 같은 문법입니다. 큰 숫자 아래 로그 눈금 게이지에 이정표 일곱 개, 다음 보상 한 줄, 교환 두 칸.</figcaption><label class="m" for="memo_c">의견</label><textarea class="memo" id="memo_c"></textarea></figure>
  </div>
  <h2>순위 탭과 홈 배너</h2>
  <div class="figs">
    <figure data-title="순위 탭 스트립 있음"><h3>순위 탭 · 송편 스트립 있음</h3>${RANK(true)}<figcaption>순위표 위 한 줄에 내 송편과 받을 보상, 송편 탭 바로가기.</figcaption><label class="m" for="memo_s1">의견</label><textarea class="memo" id="memo_s1"></textarea></figure>
    <figure data-title="순위 탭 스트립 없음"><h3>순위 탭 · 스트립 없음</h3>${RANK(false)}<figcaption>순위표만. 송편은 탭을 눌러야 보입니다.</figcaption><label class="m" for="memo_s2">의견</label><textarea class="memo" id="memo_s2"></textarea></figure>
    <figure data-title="홈 배너"><h3>홈 배너</h3>${BAN}<figcaption>배너는 하나이고 받을 송편 보상이 생기면 문구와 색이 바뀝니다.</figcaption><label class="m" for="memo_ban">의견</label><textarea class="memo" id="memo_ban"></textarea></figure>
  </div>
  <h2>정할 것</h2>
  <div class="decs">${DECS.map((d) => `<fieldset class="dec" data-title="${esc(d.title)}"><legend>${d.title}</legend><p class="help">${d.help}</p>${d.options.map((o, i) => `<label class="o"><input type="radio" name="${d.id}" id="${d.id}_${i}" value="${esc(o.v)}"${o.rec ? ' data-rec="1"' : ''}><span>${o.v}${o.rec ? '<span class="tag">추천</span>' : ''}</span></label>`).join('')}</fieldset>`).join('')}</div>
  <h2>요약</h2>
  <label class="m" for="memo_all">전체 의견</label><textarea class="memo" id="memo_all"></textarea>
  <label class="m" for="out">복사용 요약</label><textarea id="out" readonly></textarea>
  <div class="acts"><button type="button" id="fill">고르지 않은 항목을 추천으로 채우기</button><button type="button" class="p" id="copy">요약 복사</button><span id="toast" role="status"></span></div>
</div>
<script>
(function(){
  var KEY='chuseok-songpyeon-mock-v1';
  function q(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s));}
  function build(){
    var lines=['[송편 화면 시안 점검]'];
    q('fieldset.dec').forEach(function(fs,i){var c=fs.querySelector('input:checked');lines.push((i+1)+'. '+fs.getAttribute('data-title')+': '+(c?c.value:'(미선택)'));});
    q('figure').forEach(function(f){var m=f.querySelector('.memo').value.trim();if(m)lines.push('- '+f.getAttribute('data-title')+': '+m.replace(/\\n+/g,' '));});
    var all=document.getElementById('memo_all').value.trim();if(all)lines.push('- 전체: '+all.replace(/\\n+/g,' '));
    document.getElementById('out').value=lines.join('\\n');
  }
  function save(){try{var st={c:[],t:{}};q('input:checked').forEach(function(i){st.c.push(i.id);});q('.memo').forEach(function(i){if(i.value)st.t[i.id]=i.value;});localStorage.setItem(KEY,JSON.stringify(st));}catch(e){}}
  function load(){try{var st=JSON.parse(localStorage.getItem(KEY)||'null');if(!st)return;(st.c||[]).forEach(function(id){var el=document.getElementById(id);if(el)el.checked=true;});Object.keys(st.t||{}).forEach(function(id){var el=document.getElementById(id);if(el)el.value=st.t[id];});}catch(e){}}
  document.addEventListener('change',function(){build();save();});
  document.addEventListener('input',function(e){if(e.target&&e.target.classList&&e.target.classList.contains('memo')){build();save();}});
  document.getElementById('fill').addEventListener('click',function(){q('fieldset.dec').forEach(function(fs){if(fs.querySelector('input:checked'))return;var r=fs.querySelector('input[data-rec]');if(r)r.checked=true;});build();save();document.getElementById('toast').textContent='고르지 않은 항목만 추천으로 채웠습니다.';});
  document.getElementById('copy').addEventListener('click',function(){var t=document.getElementById('out');function done(){document.getElementById('toast').textContent='복사했습니다. 채팅에 붙여 주세요.';}if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t.value).then(done,function(){t.select();try{document.execCommand('copy');done();}catch(e){}});}else{t.select();try{document.execCommand('copy');done();}catch(e){}}});
  load();build();
})();
</script>
`;
writeFileSync(out, html);
console.log(`wrote ${out} (${(html.length / 1024).toFixed(0)} KB)`);
