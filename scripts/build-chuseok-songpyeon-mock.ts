/**
 * 송편(강화 성공 적립, 추석 업데이트 3번) 화면 시안 — 배치 안 3가지 + 순위 탭 스트립 + 배너 + 수치 선택.
 * 사용: bun run scripts/build-chuseok-songpyeon-mock.ts <출력 html>
 * 수치 근거: scripts/chuseok-mileage-dist.json의 level(세금식) 분포(최근 7일, 357명). 닉네임·수치 표시는 예시.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

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
const MY = 1_240, NEXT = 2_000, USED = 300, AVAIL = MY - USED;
const UI = 'public/sprites/chuseok-ui';
const img = async (k: string, w: number): Promise<string | null> => {
  const f = `${UI}/${k}.png`; if (!existsSync(f)) return null;
  const buf = await sharp(f).resize({ width: w, kernel: 'nearest' }).png().toBuffer();
  return `data:image/png;base64,${buf.toString('base64')}`;
};
const SPA = await img('songpyeon_a', 64);
const SPB = await img('songpyeon_b', 64);
const SPC = await img('songpyeon_c', 64);
const SP = SPC ?? SPA ?? SPB;
const BGA = await img('banner_a', 768);
const BGB = await img('banner_b', 768);
const spIcon = (size = '.9em') => SP ? `<img class="spi" src="${SP}" alt="" style="width:${size};height:${size}">` : '🥟';
const foot = `<p class="foot">대회가 끝난 뒤 10/3까지 받고 교환할 수 있어요. 그 뒤 남은 송편은 사라져요.</p>`;
// 누적/사용 가능을 한 카드에(사용자 확정)
const oneCard = `<div class="one"><div class="oc"><span class="lab">누적 송편</span><b>${spIcon()}${n(MY)}</b><small>다음 보상까지 ${n(NEXT - MY)}</small></div><span class="vsep"></span><div class="oc"><span class="lab">사용 가능</span><b>${spIcon()}${n(AVAIL)}</b><small>교환에 쓴 ${n(USED)}</small></div></div>`;
// 교환: 상자·다이아 각각 버튼(수량은 팝업에서)
const xrows = `<div class="xrows"><div class="xr"><b>📦 상자 3개</b><span>150 송편 · 20회 중 17회 남음</span><i class="btn">교환</i></div><div class="xr"><b>💎 100</b><span>400 송편 · 20회 중 18회 남음</span><i class="btn">교환</i></div></div>`;
const tl = `<div class="tl">${LADDER.map(([m, d, b], i) => { const st = MY >= m ? (i < 2 ? 'done' : 'ready') : ''; return `<div class="tr ${st}"><span class="dot"></span><span class="m">${n(m)}</span><span class="rw">💎${n(d)} · 📦${b}</span>${st === 'done' ? '<i>받음</i>' : st === 'ready' ? '<i class="btn">받기</i>' : `<i class="left">${n(m - MY)} 더</i>`}</div>`; }).join('')}</div>`;
const B2 = `<div class="ph">${head}${seg('sp')}<div class="body">
  ${oneCard}
  <p class="sub2">도달 보상 <small>누적 송편으로 따져요. 교환에 써도 줄지 않아요.</small></p>${tl}
  <p class="sub2">교환 <small>사용 가능 송편으로 바꿔요</small></p>${xrows}${foot}</div>${nav}</div>`;
// 수량 팝업(상품 하나): 개수 조절 → 필요한 송편·교환 뒤 사용 가능·남은 횟수
const POP2 = `<div class="ph">${head}${seg('sp')}<div class="body">${oneCard}<p class="sub2">도달 보상</p>${tl}<p class="sub2">교환</p>${xrows}${foot}</div>
<div class="dimmer"></div><div class="modal"><div class="mh"><b class="st2">📦 상자 3개 교환</b><p class="sd">한 번에 150 송편 · 20회 중 17회 남음</p></div>
<div class="mb">
  <div class="qty"><i>−</i><b>2</b><i>+</i><small>최대 6</small></div>
  <div class="tot"><span>받는 것</span><b>📦 6</b><span>필요한 송편</span><b>300</b><span>교환 뒤 사용 가능</span><b>${n(AVAIL - 300)}</b></div>
</div><div class="mf"><span class="mbtn">취소</span><span class="mbtn p">300 송편으로 교환</span></div></div></div>`;

// 순위 탭 위 송편 스트립(있음/없음)
const RANK = (strip: boolean) => `<div class="ph">${head}${seg('rank')}<div class="body">
  ${strip ? `<div class="strip"><span>내 송편 <b>${n(MY)}</b></span><span class="dotr"></span><span>받을 보상 1개</span><i>송편 탭 ›</i></div>` : ''}
  <div class="chips">${['🗡','👘','👝','🔨','🐰','🎀'].map((e, i) => `<span class="chip${i === 2 ? ' on' : ''}"><em>${e}</em><small>${['3등', '27등', '14등', '8등', '없음', '41등'][i]}</small></span>`).join('')}</div>
  <div class="rows">${['달빛모루', '새벽망치', '은하수'].map((nm, i) => `<div class="row"><span class="rk">${i + 1}</span><b>${nm}</b><span class="lv">+${[112, 112, 97][i]}</span></div>`).join('')}<div class="row dim"><span class="rk">⋯</span></div></div></div>${nav}</div>`;

// 홈 배너: 평소(순위 딥링크) / 받을 보상 있을 때(송편 딥링크). 배경은 Pixellab 생성 그림(있으면).
const bannerBg = (src: string | null, cls: string) => src ? `style="background-image:url(${src});background-size:cover;background-position:center"` : `class="${cls}"`;
const BAN = `<div class="ph short"><div class="bar"><b>인생강화</b><small>⚔ 12,480 · 💎 2,122</small></div><div class="body">
  <p class="cap2">평소 → 누르면 순위 탭</p><div class="banner img" ${bannerBg(BGA, '')}><span class="bt"><b>한가위 강화 대회</b><span>추석 장비 6종, 장비마다 10등까지 보상</span></span><i>2일 09:14:07</i></div>
  <p class="cap2">받을 송편 보상이 생겼을 때 → 누르면 송편 탭</p><div class="banner img" ${bannerBg(BGB, 'hot')}><span class="bt"><b>송편 보상을 받을 수 있어요</b><span>한가위 강화 대회 · 800단계 도달</span></span><i>받기 ›</i></div>
</div></div>`;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
type Dec = { id: string; title: string; help: string; options: { v: string; rec?: boolean }[] };
const DECS: Dec[] = [
  { id: 'popup', title: '수량 팝업', help: '상품마다 따로 열리고, 개수 조절과 합계, 남은 횟수를 보여 줍니다.', options: [{ v: '시안대로', rec: true }, { v: '개수 없이 1개씩만 교환' }] },
  { id: 'ladderpos', title: '트랙에서 못 받은 단계의 표시', help: '지금은 몇 개 더 필요한지 적었습니다.', options: [{ v: '"N 더"로 남은 양 표시', rec: true }, { v: '보상만 보이고 남은 양은 숨김' }] },
];
const FIXED: [string, string][] = [
  ['송편 탭 배치', 'B안(세로 진행 트랙) 개정: 누적·사용 가능 한 카드, 교환은 상자·다이아 별도 버튼'],
  ['교환 수량', '상품별 팝업에서 개수 선택'],
  ['순위 탭', '스트립 없음'],
  ['홈 배너', '평소/보상 있을 때 문구·배경 교체, 누르면 해당 세그먼트가 선택된 상태로 진입'],
  ['송편 표기', '1단계 = 송편 1개'],
  ['송편 아이콘 · 배너 배경', '선택 폼에서 고름(여러 후보 생성)'],
  ['도달 보상 사다리 · 교환 비율', '더 고민(시안의 숫자는 가안)'],
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
  .spi { display:inline-block; vertical-align:-.12em; margin-right:.15em; image-rendering:pixelated; }
  .one { display:grid; grid-template-columns:1fr auto 1fr; gap:10px; align-items:center; background:#18181b; border:1px solid rgba(245,158,11,.5); border-radius:12px; padding:10px 12px; } .oc { display:flex; flex-direction:column; gap:1px; } .oc .lab { font-size:10.5px; color:#a1a1aa; } .oc b { font-family:ui-monospace,Menlo,monospace; font-size:20px; color:#fde68a; } .oc small { font-size:10px; color:#71717a; } .vsep { width:1px; height:34px; background:#27272a; }
  .xrows { display:flex; flex-direction:column; gap:6px; } .xr { display:grid; grid-template-columns:1fr auto; gap:0 10px; align-items:center; background:#18181b; border:1px solid #27272a; border-radius:10px; padding:8px 10px; } .xr b { font-size:12.5px; } .xr span { grid-column:1; font-size:10.5px; color:#71717a; } .xr i { grid-column:2; grid-row:1/3; }
  .qty { display:flex; align-items:center; justify-content:center; gap:14px; padding:6px 0 2px; } .qty i { font-style:normal; width:32px; height:32px; border-radius:8px; background:#27272a; display:grid; place-items:center; font-weight:800; font-size:16px; } .qty b { font-family:ui-monospace,Menlo,monospace; font-size:22px; min-width:28px; text-align:center; color:#fde68a; } .qty small { font-size:10px; color:#71717a; }
  .two { display:grid; grid-template-columns:1fr 1fr; gap:8px; } .tn { background:#18181b; border:1px solid #27272a; border-radius:12px; padding:9px 11px; display:flex; flex-direction:column; gap:1px; } .tn:first-child { border-color:rgba(245,158,11,.5); }
  .tn .lab { font-size:10.5px; color:#a1a1aa; } .tn b { font-family:ui-monospace,Menlo,monospace; font-size:20px; color:#fde68a; } .tn small { font-size:10px; color:#71717a; } .two.compact .tn b { font-size:17px; }
  .gauge.solo { margin:8px 2px 0; } .xbtn { margin-top:12px; text-align:center; background:#d97706; color:#fff; border-radius:10px; padding:9px; font-weight:800; font-size:12.5px; } .xbtn small { font-weight:500; color:#fff3c4; margin-left:6px; }
  .dish { display:flex; align-items:center; gap:14px; background:#18181b; border:1px solid rgba(245,158,11,.5); border-radius:14px; padding:10px 12px; } .dishimg { width:72px; height:72px; image-rendering:pixelated; } .dishph { font-size:44px; } .dn { display:flex; flex-direction:column; gap:1px; } .dn .lab { font-size:10.5px; color:#a1a1aa; } .dn b { font-family:ui-monospace,Menlo,monospace; font-size:22px; color:#fde68a; } .dn em { font-style:normal; color:#fde68a; font-family:ui-monospace,Menlo,monospace; }
  .hs { display:flex; gap:8px; overflow:hidden; margin-top:12px; } .hc { flex:0 0 92px; background:#18181b; border:1px solid #27272a; border-radius:12px; padding:9px 6px; text-align:center; display:flex; flex-direction:column; gap:2px; } .hc b { font-family:ui-monospace,Menlo,monospace; font-size:13px; } .hc span { font-size:10px; color:#a1a1aa; } .hc i { font-style:normal; font-size:10px; color:#6ee7b7; margin-top:2px; } .hc .left { color:#71717a; } .hc.done { border-color:#065f46; } .hc.ready { border-color:#f59e0b; background:#241c0c; }
  .hint { margin:6px 0 0; font-size:10.5px; color:#71717a; text-align:center; }
  .stamps { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; } .stp { display:flex; flex-direction:column; align-items:center; gap:3px; } .ring { width:40px; height:40px; border-radius:50%; border:2px dashed #3f3f46; display:grid; place-items:center; font-size:15px; color:#fbbf24; font-weight:900; } .stp.done .ring { border:2px solid #10b981; background:#052e2b; } .stp.ready .ring { border:2px solid #f59e0b; background:#241c0c; } .stp b { font-family:ui-monospace,Menlo,monospace; font-size:11.5px; } .stp small { font-size:9px; color:#a1a1aa; }
  .readybar { margin-top:12px; display:flex; align-items:center; gap:10px; background:#241c0c; border:1px solid #f59e0b; border-radius:10px; padding:8px 10px; font-size:11.5px; } .readybar span { flex:1; } .readybar b { color:#fde68a; }
  .fixbar { display:flex; align-items:center; gap:10px; margin:0 14px 10px; padding:9px 12px; border-radius:12px; border:1px solid rgba(245,158,11,.6); background:#0c0c0e; font-size:12px; } .fixbar span { flex:1; } .fixbar b { font-family:ui-monospace,Menlo,monospace; color:#fde68a; } .btn.big { font-size:12px; padding:7px 14px; }
  .fh { display:grid; grid-template-columns:1fr 1fr auto; gap:10px; align-items:center; } .fh .lab { display:block; font-size:10.5px; color:#a1a1aa; } .fh b { font-family:ui-monospace,Menlo,monospace; font-size:19px; color:#fde68a; }
  .frows { margin-top:10px; border:1px solid #27272a; border-radius:12px; background:#18181b; overflow:hidden; } .fr { display:grid; grid-template-columns:auto 1fr auto; gap:10px; align-items:center; height:42px; padding:0 12px; border-bottom:1px solid #27272a; } .fr:last-child { border-bottom:0; } .fr b { font-family:ui-monospace,Menlo,monospace; font-size:13px; min-width:52px; } .fr span { font-size:11px; color:#a1a1aa; } .fr i { font-style:normal; font-size:10.5px; } .fr .ok { color:#6ee7b7; } .fr .left { color:#71717a; } .fr.ready { background:#241c0c; }
  .dimmer { position:absolute; inset:0; background:rgba(0,0,0,.72); } .modal { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); width:320px; max-width:calc(100% - 32px); display:flex; flex-direction:column; gap:10px; }
  .mh { text-align:center; } .st2 { font-size:15px; font-weight:800; } .sd { margin:4px 0 0; font-size:11.5px; color:#a1a1aa; } .mb { background:#18181b; border-radius:16px; padding:12px 14px; display:flex; flex-direction:column; gap:8px; }
  .pr { display:grid; grid-template-columns:1fr auto auto; gap:2px 10px; align-items:center; background:#09090b; border:1px solid #27272a; border-radius:10px; padding:8px 10px; } .pr b { font-size:12.5px; } .pr span { font-family:ui-monospace,Menlo,monospace; font-size:11.5px; color:#fde68a; } .pr small { grid-column:1/-1; font-size:10px; color:#71717a; }
  .step { display:flex; align-items:center; gap:8px; } .step i { font-style:normal; width:22px; height:22px; border-radius:6px; background:#27272a; display:grid; place-items:center; font-weight:800; } .step b { font-family:ui-monospace,Menlo,monospace; min-width:14px; text-align:center; }
  .tot { display:grid; grid-template-columns:1fr auto; gap:2px 10px; padding-top:6px; border-top:1px solid #27272a; font-size:11.5px; color:#a1a1aa; } .tot b { font-family:ui-monospace,Menlo,monospace; color:#fde68a; text-align:right; }
  .mf { display:flex; gap:8px; } .mbtn { flex:1; text-align:center; border-radius:12px; padding:10px; font-size:13px; font-weight:800; background:#27272a; color:#e4e4e7; } .mbtn.p { background:#d97706; color:#fff; }
  .banner.img { position:relative; overflow:hidden; min-height:64px; } .banner.img::before { content:""; position:absolute; inset:0; background:linear-gradient(90deg,rgba(0,0,0,.55),rgba(0,0,0,.15)); } .banner.img .bt, .banner.img i { position:relative; }
  .icons { display:flex; gap:10px; } .icf { margin:0; width:64px; text-align:center; } .icf img { width:64px; height:64px; image-rendering:pixelated; background:#18181b; border-radius:8px; display:block; } .icf figcaption { font-size:10.5px; color:#a1a1aa; margin-top:2px; } .icph { width:64px; height:64px; border-radius:8px; background:#18181b; border:1px dashed #3f3f46; display:grid; place-items:center; font-size:11px; color:#71717a; }
  .bgs { display:grid; grid-template-columns:1fr 1fr; gap:8px; } .bgf { margin:0; } .bgf img { width:100%; height:auto; border-radius:8px; image-rendering:pixelated; display:block; } .bgf figcaption { font-size:10.5px; color:#a1a1aa; text-align:center; margin-top:2px; } .bgph { height:56px; border-radius:8px; background:#18181b; border:1px dashed #3f3f46; display:grid; place-items:center; font-size:11px; color:#71717a; }
  .tw { overflow-x:auto; margin-top:12px; } .fx { border-collapse:collapse; width:100%; max-width:760px; font-size:13.5px; } .fx th { text-align:left; font-weight:700; color:var(--muted); padding:8px 10px; border-bottom:1px solid var(--line); white-space:nowrap; width:34%; } .fx td { padding:8px 10px; border-bottom:1px solid var(--line); }
  .decs { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr)); gap:14px; margin-top:14px; }
  fieldset { margin:0; border:1px solid var(--line); border-radius:12px; background:var(--panel); padding:12px 14px; min-width:0; } legend { font-weight:800; font-size:14px; padding:0 6px; } .help { margin:0 0 8px; font-size:12.5px; color:var(--muted); }
  .o { display:flex; gap:8px; align-items:flex-start; padding:5px 0; font-size:13.5px; cursor:pointer; } .o input { margin-top:4px; accent-color:var(--accent); } .tag { font-size:10.5px; font-weight:800; color:var(--rec); background:var(--recbg); border-radius:99px; padding:1px 7px; margin-left:6px; white-space:nowrap; }
  #out { min-height:200px; font-family:ui-monospace,Menlo,monospace; font-size:12.5px; } .acts { display:flex; flex-wrap:wrap; gap:10px; align-items:center; margin-top:10px; }
  button { font:inherit; font-weight:800; font-size:13.5px; border-radius:10px; padding:9px 16px; border:1px solid var(--line); background:var(--panel); color:var(--ink); cursor:pointer; } button.p { background:var(--accent); border-color:var(--accent); color:#fff; } #toast { font-size:12.5px; color:var(--rec); }
</style>
<div class="wrap">
  <h1>송편 화면 시안</h1>
  <p class="lead">3차 시안입니다. 고르신 B안(세로 진행 트랙)을 기준으로 누적 송편과 사용 가능 송편을 한 카드에 넣고, 교환은 상자와 다이아 각각의 버튼에서 수량 팝업으로 하도록 고쳤습니다. 예시 값은 누적 1,240 · 사용 가능 940이고, 사다리와 교환 비율 숫자는 가안입니다. 송편 아이콘과 배너 배경은 선택 폼에서 고르시면 반영합니다.</p>
  <p class="note">세금식은 성공 한 번에 도달 단계만큼 쌓여 숫자가 빨리 커집니다. 사다리는 100에서 30,000까지 로그 간격으로 잡았고, 지난주 실서버 기록으로 닿는 사람 비율과 총 지급을 함께 계산했습니다.</p>
  <h2>송편 탭 · B안 개정</h2>
  <div class="figs">
    <figure data-title="송편 탭(B 개정)"><h3>송편 탭 · 한 카드에 누적과 사용 가능, 세로 트랙, 교환 버튼 둘</h3>${B2}<figcaption>위 카드 한 장에 누적 송편과 사용 가능 송편이 나란히 있고, 가운데 세로 트랙, 아래에 상자와 다이아 교환 줄이 따로 있습니다. 각 줄의 [교환]을 누르면 수량 팝업이 뜹니다.</figcaption><label class="m" for="memo_b2">의견</label><textarea class="memo" id="memo_b2"></textarea></figure>
    <figure data-title="수량 팝업"><h3>수량 팝업 · 상품 하나씩</h3>${POP2}<figcaption>공통 팝업 레이아웃. 개수를 조절하면 받는 양, 필요한 송편, 교환 뒤 남는 사용 가능 송편이 계산됩니다. 최대 개수는 남은 횟수와 사용 가능 송편으로 정해집니다.</figcaption><label class="m" for="memo_pop2">의견</label><textarea class="memo" id="memo_pop2"></textarea></figure>
  </div>
  <h2>순위 탭과 홈 배너</h2>
  <div class="figs">
    <figure data-title="순위 탭"><h3>순위 탭 · 스트립 없음(확정)</h3>${RANK(false)}<figcaption>순위표만 둡니다.</figcaption><label class="m" for="memo_s2">의견</label><textarea class="memo" id="memo_s2"></textarea></figure>
    <figure data-title="홈 배너"><h3>홈 배너 · 문구와 배경 교체, 세그먼트 딥링크</h3>${BAN}<figcaption>배경 그림과 송편 아이콘은 선택 폼에서 고르신 것으로 바꿔 넣습니다. 지금은 1차 후보로 채워 두었습니다.</figcaption><label class="m" for="memo_ban">의견</label><textarea class="memo" id="memo_ban"></textarea></figure>
  </div>
  <h2>정해진 것</h2>
  <div class="tw"><table class="fx"><tbody>${FIXED.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')}</tbody></table></div>
  <h2>정할 것</h2>
  <div class="decs">${DECS.map((d) => `<fieldset class="dec" data-title="${esc(d.title)}"><legend>${d.title}</legend><p class="help">${d.help}</p>${d.options.map((o, i) => `<label class="o"><input type="radio" name="${d.id}" id="${d.id}_${i}" value="${esc(o.v)}"${o.rec ? ' data-rec="1"' : ''}><span>${o.v}${o.rec ? '<span class="tag">추천</span>' : ''}</span></label>`).join('')}</fieldset>`).join('')}</div>
  <h2>요약</h2>
  <label class="m" for="memo_all">전체 의견</label><textarea class="memo" id="memo_all"></textarea>
  <label class="m" for="out">복사용 요약</label><textarea id="out" readonly></textarea>
  <div class="acts"><button type="button" id="fill">고르지 않은 항목을 추천으로 채우기</button><button type="button" class="p" id="copy">요약 복사</button><span id="toast" role="status"></span></div>
</div>
<script>
(function(){
  var KEY='chuseok-songpyeon-mock-v3';
  function q(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s));}
  function build(){
    var lines=['[송편 화면 시안 3차 점검]'];
    q('fieldset.dec').forEach(function(fs,i){var c=fs.querySelector('input:checked');lines.push((i+1)+'. '+fs.getAttribute('data-title')+': '+(c?c.value:'(미선택)'));});
    q('figure[data-title]').forEach(function(f){var el=f.querySelector('.memo');if(!el)return;var m=el.value.trim();if(m)lines.push('- '+f.getAttribute('data-title')+': '+m.replace(/\\n+/g,' '));});
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
