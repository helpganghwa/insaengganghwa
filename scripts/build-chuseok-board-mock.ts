/**
 * 한가위 강화 대회 현황판 — UI/UX 점검용 시안 아티팩트 빌더.
 * 사용: bun run scripts/build-chuseok-board-mock.ts <출력 html>
 * 화면 속 닉네임·단계·시각은 전부 지어낸 예시다(실유저 데이터 아님).
 */
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';

const out = process.argv[2];
if (!out) throw new Error('출력 경로가 필요합니다');

const DIR = 'public/sprites/chuseok-cand';
async function uri(key: string, size = 96): Promise<string> {
  const buf = await sharp(`${DIR}/${key}.png`)
    .resize(size, size, { kernel: 'nearest', fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
  return `data:image/png;base64,${buf.toString('base64')}`;
}

type Item = { id: string; slot: string; name: string; key: string; temp: boolean; my: number | null; myLv: number | null; top: [string, number] };
const ITEMS: Item[] = [
  { id: 'hw', slot: '한복 무기', name: '한복 무기', key: 'chuseok_songpyeon_spear', temp: true, my: 3, myLv: 96, top: ['달빛모루', 118] },
  { id: 'ha', slot: '한복 방어구', name: '한복 방어구', key: 'chuseok_hanbok_v6', temp: true, my: 27, myLv: 31, top: ['새벽망치', 121] },
  { id: 'hc', slot: '한복 장신구', name: '한가위 복주머니', key: 'chuseok_bok_pouch', temp: false, my: 14, myLv: 52, top: ['달빛모루', 112] },
  { id: 'rw', slot: '달토끼 무기', name: '달토끼 무기', key: 'chuseok_rabbit_mallet_ears', temp: true, my: 8, myLv: 66, top: ['은하수', 104] },
  { id: 'ra', slot: '달토끼 방어구', name: '달토끼 방어구', key: 'chuseok_rabbit_suit_zip', temp: true, my: null, myLv: null, top: ['새벽망치', 109] },
  { id: 'rc', slot: '달토끼 장신구', name: '토끼 귀', key: 'chuseok_rabbit_ears_v4', temp: false, my: 41, myLv: 12, top: ['달빛모루', 99] },
];
const img: Record<string, string> = {};
for (const it of ITEMS) img[it.id] = await uri(it.key);

const ROWS: [string, number, string][] = [
  ['달빛모루', 112, '9/27 21:14'],
  ['새벽망치', 112, '9/28 03:40'],
  ['은하수', 97, '9/28 11:02'],
  ['호두까기', 88, '9/27 09:31'],
  ['밤송이', 81, '9/28 13:55'],
  ['감나무집', 74, '9/26 22:08'],
  ['솔바람', 70, '9/28 08:17'],
  ['도토리묵', 66, '9/27 17:46'],
  ['곶감장수', 61, '9/28 12:20'],
  ['보름이', 58, '9/28 10:03'],
];
// 사용자가 논의 결과에 적은 수치(미확정) — 시안에서 자리와 길이를 보기 위한 값.
const REWARD: [string, number, number][] = [
  ['1등', 50000, 600],
  ['2등', 30000, 300],
  ['3등', 20000, 150],
  ['4~5등', 10000, 90],
  ['6~10등', 5000, 60],
];
const rewardOf = (rank: number) => REWARD[rank === 1 ? 0 : rank === 2 ? 1 : rank === 3 ? 2 : rank <= 5 ? 3 : 4];
const n = (v: number) => v.toLocaleString('ko-KR');
const HUES = [28, 205, 262, 140, 345, 48, 180, 300, 95, 12];
const av = (i: number, ch: string) =>
  `<span class="av" style="background:linear-gradient(135deg,hsl(${HUES[i % 10]} 45% 38%),hsl(${HUES[i % 10]} 50% 22%))">${ch}</span>`;

const nav = `<div class="nav"><span>🏠<em>홈</em></span><span>🎒<em>인벤토리</em></span><span>⚒️<em>강화</em></span><span>🏰<em>길드</em></span><span>👤<em>프로필</em></span></div>`;
const head = (right: string) => `<div class="bar"><span class="back">‹</span><b>한가위 강화 대회</b><small>${right}</small></div>`;

const chips = (sel: string, showMine = true) =>
  `<div class="chips">${ITEMS.map(
    (it) =>
      `<span class="chip${it.id === sel ? ' on' : ''}"><img src="${img[it.id]}" alt=""><em>${showMine ? (it.my ? `${it.my}등` : '없음') : '&nbsp;'}</em></span>`,
  ).join('')}</div>`;

const itemHead = (it: Item, sub: string) =>
  `<div class="ihead"><img src="${img[it.id]}" alt=""><div><b>${it.name}</b><span>${sub}</span></div><i class="rbtn">보상 보기</i></div>`;

const list = (opts: { reward: boolean; meAt?: number; final?: boolean }) =>
  `<ol class="rows">${ROWS.map(([nm, lv, at], i) => {
    const me = opts.meAt === i + 1;
    const r = rewardOf(i + 1);
    return `<li class="${me ? 'me' : ''}${i < 3 ? ' top' : ''}"><span class="rk">${i + 1}</span>${av(i, me ? '나' : nm[0])}<span class="who"><b>${me ? '나' : nm}</b><span>${at} 도달</span></span><span class="lv"><b>+${lv}</b>${opts.reward ? `<span>💎${n(r[1])} · 📦${n(r[2])}</span>` : ''}</span></li>`;
  }).join('')}</ol>`;

const phoneA = `<div class="ph">${head('2일 9시간 남음')}
<div class="body">
  ${chips('hc')}
  ${itemHead(ITEMS[2], '순위는 지금 단계로 매겨요. 같은 단계면 먼저 오른 사람이 앞서요.')}
  ${list({ reward: true })}
</div>
<div class="mine"><span class="rk">14</span><span class="who"><b>나</b><span>10등까지 +7</span></span><span class="lv"><b>+52</b></span><i class="go">강화하러 가기</i></div>
${nav}</div>`;

const phoneB = `<div class="ph">${head('2일 9시간 남음')}
<div class="body">
  <p class="hint">추석 장비 6종마다 10등까지 보상을 드려요.</p>
  <div class="cards">${ITEMS.map(
    (it) =>
      `<div class="card"><img src="${img[it.id]}" alt=""><b>${it.name}</b><span class="c1">1등 ${it.top[0]} <strong>+${it.top[1]}</strong></span><span class="c2${it.my && it.my <= 10 ? ' in' : ''}">${it.my ? `나 ${it.my}등 · +${it.myLv}` : '아직 없어요'}</span></div>`,
  ).join('')}</div>
  <div class="btn gray">순위별 보상 보기</div>
</div>
${nav}</div>`;

const phoneIn = `<div class="ph">${head('2일 9시간 남음')}
<div class="body">
  ${chips('rw')}
  ${itemHead(ITEMS[3], '순위는 지금 단계로 매겨요. 같은 단계면 먼저 오른 사람이 앞서요.')}
  ${list({ reward: true, meAt: 8 })}
</div>
<div class="mine in"><span class="rk">8</span><span class="who"><b>나</b><span>7등까지 +5 · 9등과 +5 차이</span></span><span class="lv"><b>+66</b></span><i class="go">강화하러 가기</i></div>
${nav}</div>`;

const phoneNone = `<div class="ph">${head('2일 9시간 남음')}
<div class="body">
  ${chips('ra')}
  ${itemHead(ITEMS[4], '순위는 지금 단계로 매겨요. 같은 단계면 먼저 오른 사람이 앞서요.')}
  ${list({ reward: false }).replace(/<li[\s\S]*$/, (m) => m.split('</li>').slice(0, 4).join('</li>') + '</li></ol>')}
  <p class="more">⋯</p>
</div>
<div class="mine none"><span class="who"><b>아직 이 장비가 없어요</b></span></div>
${nav}</div>`;

const sheet = `<div class="ph">${head('2일 9시간 남음')}
<div class="body dim">
  ${chips('hc')}
  ${itemHead(ITEMS[2], '순위는 지금 단계로 매겨요.')}
  ${list({ reward: true })}
</div>
<div class="sheet">
  <div class="grab"></div>
  <b class="st">순위별 보상</b>
  <p class="sd">장비 6종마다 따로 드려요. 여러 장비에서 순위에 들면 모두 받아요.</p>
  <table class="rt"><thead><tr><th>순위</th><th>다이아</th><th>상자</th><th>칭호</th></tr></thead><tbody>
  ${REWARD.map(([r, d, b], i) => `<tr><td>${r}</td><td>💎 ${n(d)}</td><td>📦 ${n(b)}</td><td>${i < 3 ? '한정 칭호' : ''}</td></tr>`).join('')}
  </tbody></table>
  <p class="sd">상자는 무기·방어구·장신구 상자를 같은 수로 나눠 드려요.</p>
  <p class="sd">9/30 23:59까지 수령한 강화 결과만 인정돼요. 보상은 순위 확인을 거쳐 10/1에 우편으로 보내 드려요.</p>
  <div class="btn gray">닫기</div>
</div></div>`;

const phoneFinal = `<div class="ph">${head('대회 종료')}
<div class="body">
  <div class="fin"><b>최종 순위예요</b><span>9/30 23:59에 확정됐어요. 보상은 순위 확인을 거쳐 10/1에 우편으로 보내 드려요.</span></div>
  ${chips('hc')}
  ${itemHead(ITEMS[2], '9/30 23:59 확정')}
  ${list({ reward: true, final: true })}
</div>
<div class="mine"><span class="rk">12</span><span class="who"><b>나</b><span>최종 12등</span></span><span class="lv"><b>+63</b></span></div>
${nav}</div>`;

const phoneHome = `<div class="ph"><div class="bar"><b>인생강화</b><small>⚔ 12,480 · 💎 2,122</small></div>
<div class="body">
  <div class="banner"><span class="moon"></span><span class="bt"><b>한가위 강화 대회</b><span>추석 장비 6종, 장비마다 10등까지 보상</span></span><i>9/30까지</i></div>
  <div class="stub"></div><div class="stub"></div>
  <p class="cap2">종료 뒤 일주일</p>
  <div class="banner done"><span class="moon"></span><span class="bt"><b>한가위 강화 대회 결과</b><span>최종 순위를 확인해 보세요</span></span><i>결과 보기</i></div>
</div>
${nav}</div>`;

type Fig = { id: string; title: string; phone: string; cap: string; checks: string[] };
const FIGS: Fig[] = [
  { id: 'a', title: '안 A · 장비 칩으로 바로 전환', phone: phoneA, cap: '들어오자마자 순위표가 보입니다. 위쪽 칩 여섯 개가 장비 선택이자 내 순위 요약입니다.',
    checks: ['칩 아래 숫자(3등, 14등, 없음)만으로 여섯 장비의 내 위치가 읽히는지', '행 오른쪽에 단계와 보상을 함께 둔 것이 복잡해 보이지 않는지', '내 순위 줄을 화면 아래에 고정하고 그 안에 [강화하러 가기]를 둔 위치'] },
  { id: 'b', title: '안 B · 여섯 장비 요약이 먼저', phone: phoneB, cap: '첫 화면은 장비 카드 여섯 장입니다. 카드를 누르면 안 A와 같은 순위표로 들어갑니다.',
    checks: ['한 번 더 눌러야 순위표가 나오는 것이 번거롭지 않은지', '카드에 1등과 내 순위만 보여 주는 정보량이 적당한지'] },
  { id: 'in', title: '내가 10등 안에 있을 때', phone: phoneIn, cap: '목록의 내 줄이 강조되고, 아래 고정 줄은 윗자리까지 남은 단계와 아랫자리와의 차이를 함께 보여 줍니다.',
    checks: ['지금 단계 기준이라 단계가 내려가면 순위도 내려갑니다. 아랫자리와의 차이를 함께 보여 주는 것이 도움이 되는지', '1~3등 행의 금색 강조 정도'] },
  { id: 'none', title: '장비가 없을 때', phone: phoneNone, cap: '논의에서 얻는 방법 안내는 빼기로 하셔서, 없다는 사실만 알립니다.',
    checks: ['이 한 줄로 충분한지, 칩의 "없음" 표기가 어색하지 않은지'] },
  { id: 'sheet', title: '순위별 보상 시트', phone: sheet, cap: '[보상 보기]를 누르면 아래에서 올라옵니다. 수치는 논의 결과에 적어 주신 값이고 아직 확정 전입니다.',
    checks: ['칭호는 이름을 밝히지 않고 "한정 칭호"로만 적었습니다', '인정 기준과 지급 일정을 이 시트에 두는 것이 맞는지'] },
  { id: 'final', title: '종료 뒤 최종 결과', phone: phoneFinal, cap: '종료 시각의 순위를 그대로 보여 줍니다. 지급이 끝나면 위 안내가 "보상을 우편으로 보냈어요"로 바뀝니다.',
    checks: ['종료 뒤에는 [강화하러 가기]를 뺐습니다', '지급 전과 지급 후 안내 문구'] },
  { id: 'home', title: '홈 배너', phone: phoneHome, cap: '진행 중에는 위 배너, 종료 뒤에는 결과 배너로 바뀌고 공개 기간이 지나면 사라집니다.',
    checks: ['배너 문구와 기한 표기(9/30까지)', '기존 일일 보급 배너와 함께 넘겨 보는 방식'] },
];

type Dec = { id: string; title: string; help: string; options: { v: string; rec?: boolean }[] };
const DECS: Dec[] = [
  { id: 'layout', title: '첫 화면 구성', help: '안 A는 칩에 내 순위가 함께 보여 요약 화면 역할까지 합니다. 한 번 덜 누릅니다.', options: [{ v: '안 A · 장비 칩으로 바로 전환', rec: true }, { v: '안 B · 여섯 장비 요약이 먼저' }] },
  { id: 'rowreward', title: '순위표 행에 보상 표시', help: '행에서 바로 보이면 한 계단 위의 보상이 동기가 됩니다. 대신 행이 조금 빽빽해집니다.', options: [{ v: '행마다 보상을 함께 표시', rec: true }, { v: '보상은 시트에서만' }] },
  { id: 'time', title: '도달 시각 표기', help: '동률을 가르는 근거라서 누가 봐도 같은 값인 날짜와 시각이 시비가 적습니다.', options: [{ v: '날짜와 시각(9/27 21:14)', rec: true }, { v: '지난 시간(18시간 전)' }] },
  { id: 'mine', title: '내 순위 줄의 위치', help: '랭킹 화면이 이미 아래 고정 방식이라 같은 자리에 두면 익숙합니다.', options: [{ v: '화면 아래 고정', rec: true }, { v: '순위표 위에 카드로' }] },
  { id: 'keep', title: '종료 뒤 결과 공개 기간', help: '지급(10/1)을 확인하고 자랑할 시간을 주되, 홈 배너 자리를 오래 차지하지 않는 길이입니다.', options: [{ v: '7일(10/7까지)', rec: true }, { v: '3일(10/3까지)' }, { v: '14일(10/14까지)' }] },
];

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

const html = `<title>한가위 현황판 시안</title>
<style>
  :root { --bg:#f3efe6; --panel:#fffdf7; --ink:#1d1a15; --muted:#6a6155; --line:#e2dacb; --accent:#a3341f; --rec:#0f7a4f; --recbg:#e3f4ec; color-scheme: light; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg:#11100e; --panel:#1a1815; --ink:#f1ece2; --muted:#a2998b; --line:#2d2924; --accent:#e8806a; --rec:#5fd0a0; --recbg:#12291f; color-scheme: dark; } }
  :root[data-theme="dark"] { --bg:#11100e; --panel:#1a1815; --ink:#f1ece2; --muted:#a2998b; --line:#2d2924; --accent:#e8806a; --rec:#5fd0a0; --recbg:#12291f; color-scheme: dark; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font:14px/1.6 "Pretendard","Apple SD Gothic Neo",system-ui,sans-serif; }
  .wrap { max-width:1320px; margin:0 auto; padding-block:28px 72px; padding-inline:16px; }
  h1 { font-size:23px; margin:0 0 6px; }
  .lead { margin:0; color:var(--muted); max-width:72ch; }
  h2 { font-size:18px; margin:40px 0 4px; padding-top:20px; border-top:1px solid var(--line); }
  .note { margin:10px 0 0; padding:10px 13px; border:1px solid var(--line); border-radius:10px; background:var(--panel); font-size:13px; max-width:80ch; }
  .figs { display:grid; grid-template-columns:repeat(auto-fill,minmax(min(100%,390px),1fr)); gap:34px 26px; margin-top:18px; align-items:start; }
  figure { margin:0; min-width:0; }
  figure h3 { font-size:14.5px; margin:0 0 8px; }
  figcaption { font-size:13px; color:var(--muted); margin-top:10px; }
  .checks { margin:8px 0 0; padding-left:18px; font-size:13px; }
  .checks li { margin:2px 0; }
  label.m { display:block; font-size:12px; font-weight:700; color:var(--muted); margin:10px 0 4px; }
  textarea { width:100%; min-height:58px; resize:vertical; font:inherit; font-size:13px; color:var(--ink); background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:8px 10px; }
  textarea:focus-visible, input:focus-visible, button:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
  /* 게임 화면 — 실제 앱과 같은 어두운 바탕 고정 */
  .ph { width:390px; max-width:100%; background:#09090b; color:#f4f4f5; border-radius:20px; border:1px solid #27272a; overflow:hidden; font-size:13px; line-height:1.4; position:relative; }
  .ph .bar { display:flex; align-items:center; gap:8px; padding:12px 14px; border-bottom:1px solid #1f1f23; font-size:14px; }
  .ph .bar .back { font-size:20px; line-height:1; color:#a1a1aa; }
  .ph .bar small { margin-left:auto; font-size:11.5px; color:#fbbf24; font-weight:700; }
  .ph .body { padding:12px 14px 12px; }
  .ph .body.dim { opacity:.35; }
  .chips { display:grid; grid-template-columns:repeat(6,1fr); gap:6px; }
  .chip { display:flex; flex-direction:column; align-items:center; gap:1px; padding:5px 0 4px; border-radius:10px; background:#18181b; border:1px solid #27272a; }
  .chip.on { border-color:#f59e0b; background:#241c0c; }
  .chip img { width:40px; height:40px; image-rendering:pixelated; }
  .chip em { font-style:normal; font-size:10.5px; color:#a1a1aa; font-variant-numeric:tabular-nums; }
  .chip.on em { color:#fcd34d; font-weight:700; }
  .ihead { display:flex; align-items:center; gap:10px; margin:12px 0 8px; }
  .ihead img { width:44px; height:44px; image-rendering:pixelated; flex:none; }
  .ihead div { min-width:0; flex:1; }
  .ihead b { display:block; font-size:14.5px; }
  .ihead span { display:block; font-size:10.5px; color:#a1a1aa; }
  .rbtn { flex:none; font-style:normal; font-size:11px; font-weight:700; color:#fcd34d; border:1px solid #78350f; border-radius:99px; padding:4px 10px; }
  .rows { list-style:none; margin:0; padding:0; border:1px solid #27272a; border-radius:12px; background:#18181b; overflow:hidden; }
  .rows li { display:flex; align-items:center; gap:10px; height:52px; padding:0 12px; border-bottom:1px solid #27272a; }
  .rows li:last-child { border-bottom:0; }
  .rows li.me { background:#2a1f0a; }
  .rk { width:24px; flex:none; text-align:center; font-family:ui-monospace,Menlo,monospace; font-size:13px; color:#a1a1aa; font-variant-numeric:tabular-nums; }
  .rows li.top .rk { color:#fcd34d; font-weight:700; }
  .av { width:34px; height:34px; flex:none; border-radius:8px; display:grid; place-items:center; font-size:13px; font-weight:700; color:rgba(255,255,255,.85); }
  .who { min-width:0; flex:1; display:flex; flex-direction:column; }
  .who b { font-size:13.5px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .who span { font-size:10.5px; color:#a1a1aa; font-variant-numeric:tabular-nums; }
  .lv { flex:none; text-align:right; display:flex; flex-direction:column; }
  .lv b { font-family:ui-monospace,Menlo,monospace; font-size:14px; color:#fde68a; font-variant-numeric:tabular-nums; }
  .lv span { font-size:10px; color:#a1a1aa; font-variant-numeric:tabular-nums; }
  .mine { display:flex; align-items:center; gap:10px; margin:0 14px 10px; padding:9px 12px; border-radius:12px; border:1px solid rgba(245,158,11,.6); background:#0c0c0e; }
  .mine .rk { color:#fcd34d; font-weight:700; }
  .mine .who span { color:#fcd34d; }
  .mine.none { border-color:#3f3f46; } .mine.none .who b { color:#a1a1aa; font-weight:500; }
  .go { flex:none; font-style:normal; font-size:11.5px; font-weight:800; background:#d97706; color:#fff; border-radius:9px; padding:7px 10px; }
  .nav { display:grid; grid-template-columns:repeat(5,1fr); border-top:1px solid #1f1f23; padding:6px 0 8px; font-size:16px; text-align:center; }
  .nav em { display:block; font-style:normal; font-size:9.5px; color:#a1a1aa; }
  .hint { margin:0 0 10px; font-size:12px; color:#a1a1aa; }
  .cards { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
  .card { background:#18181b; border:1px solid #27272a; border-radius:12px; padding:10px; display:flex; flex-direction:column; align-items:center; text-align:center; gap:2px; }
  .card img { width:56px; height:56px; image-rendering:pixelated; }
  .card b { font-size:13px; }
  .c1 { font-size:11px; color:#a1a1aa; } .c1 strong { color:#fde68a; font-family:ui-monospace,Menlo,monospace; }
  .c2 { font-size:11.5px; color:#d4d4d8; margin-top:2px; } .c2.in { color:#fcd34d; font-weight:700; }
  .btn { text-align:center; border-radius:10px; padding:9px; font-weight:800; font-size:12.5px; margin-top:10px; background:#d97706; color:#fff; }
  .btn.gray { background:#27272a; color:#e4e4e7; }
  .more { text-align:center; color:#52525b; margin:4px 0 0; }
  .sheet { position:absolute; left:0; right:0; bottom:0; background:#18181b; border-top:1px solid #3f3f46; border-radius:18px 18px 0 0; padding:8px 16px 16px; }
  .grab { width:36px; height:4px; border-radius:2px; background:#3f3f46; margin:0 auto 10px; }
  .st { font-size:15px; } .sd { margin:6px 0 0; font-size:11.5px; color:#a1a1aa; }
  .rt { width:100%; border-collapse:collapse; margin-top:10px; font-size:12.5px; font-variant-numeric:tabular-nums; }
  .rt th { text-align:left; font-size:10.5px; color:#a1a1aa; font-weight:600; padding:4px 6px; border-bottom:1px solid #3f3f46; }
  .rt td { color:#f4f4f5; font-size:12.5px; padding:7px 6px; border-bottom:1px solid #27272a; white-space:nowrap; }
  .rt td:last-child { color:#fcd34d; font-size:11.5px; }
  .fin { background:#241c0c; border:1px solid #78350f; border-radius:12px; padding:10px 12px; margin-bottom:12px; }
  .fin b { display:block; font-size:14px; color:#fde68a; } .fin span { font-size:11.5px; color:#d4d4d8; }
  .banner { border-radius:12px; padding:12px 14px; background:linear-gradient(100deg,#3b0f0a 0%,#7a1f12 55%,#c9892b 130%); display:flex; align-items:center; gap:12px; }
  .banner.done { background:linear-gradient(100deg,#1c1917,#44403c); }
  .moon { width:42px; height:42px; border-radius:50%; background:radial-gradient(circle at 35% 35%,#fff6d0,#f2c14e 70%); flex:none; box-shadow:0 0 14px rgba(242,193,78,.5); }
  .bt { min-width:0; flex:1; } .bt b { display:block; font-size:14px; } .bt span { display:block; font-size:11px; color:#fde7c0; }
  .banner i { flex:none; font-style:normal; font-size:10.5px; font-weight:800; background:rgba(0,0,0,.35); padding:4px 9px; border-radius:99px; }
  .stub { height:44px; border-radius:12px; background:#141417; border:1px solid #202024; margin-top:10px; }
  .cap2 { margin:16px 0 6px; font-size:11px; color:#71717a; }
  /* 결정 */
  .decs { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr)); gap:14px; margin-top:14px; }
  fieldset { margin:0; border:1px solid var(--line); border-radius:12px; background:var(--panel); padding:12px 14px; min-width:0; }
  legend { font-weight:800; font-size:14px; padding:0 6px; }
  .help { margin:0 0 8px; font-size:12.5px; color:var(--muted); }
  .o { display:flex; gap:8px; align-items:flex-start; padding:5px 0; font-size:13.5px; cursor:pointer; }
  .o input { margin-top:4px; accent-color:var(--accent); }
  .tag { font-size:10.5px; font-weight:800; color:var(--rec); background:var(--recbg); border-radius:99px; padding:1px 7px; margin-left:6px; white-space:nowrap; }
  .sum { margin-top:14px; }
  #out { min-height:200px; font-family:ui-monospace,Menlo,monospace; font-size:12.5px; }
  .acts { display:flex; flex-wrap:wrap; gap:10px; align-items:center; margin-top:10px; }
  button { font:inherit; font-weight:800; font-size:13.5px; border-radius:10px; padding:9px 16px; border:1px solid var(--line); background:var(--panel); color:var(--ink); cursor:pointer; }
  button.p { background:var(--accent); border-color:var(--accent); color:#fff; }
  #toast { font-size:12.5px; color:var(--rec); }
</style>
<div class="wrap">
  <h1>한가위 현황판 시안</h1>
  <p class="lead">논의에서 고르신 내용(장비 6종마다 1~10등, 지금 단계 기준, 도달 시각, 내 순위와 윗자리 차이, 보상 표, 종료 뒤 결과 공개)을 실제 게임 화면 크기로 옮겼습니다. 화면마다 확인할 점을 적어 두었으니 의견을 남기고 맨 아래 요약을 복사해 채팅에 붙여 주세요.</p>
  <p class="note">닉네임, 단계, 시각은 모두 지어낸 예시입니다. 장비 네 부위의 그림과 이름은 아직 고르기 전이라 후보 그림을 임시로 넣었습니다. 보상 수치는 논의 결과에 적어 주신 값이며 확정 전입니다.</p>

  <h2>화면</h2>
  <div class="figs">
  ${FIGS.map(
    (f) => `<figure class="fig" data-title="${esc(f.title)}"><h3>${f.title}</h3>${f.phone}
    <figcaption>${f.cap}</figcaption>
    <ul class="checks">${f.checks.map((c) => `<li>${c}</li>`).join('')}</ul>
    <label class="m" for="memo_${f.id}">의견</label><textarea class="memo" id="memo_${f.id}" placeholder="이 화면에서 바꾸고 싶은 점"></textarea></figure>`,
  ).join('\n')}
  </div>

  <h2>정할 것</h2>
  <div class="decs">
  ${DECS.map(
    (d) => `<fieldset class="dec" data-title="${esc(d.title)}"><legend>${d.title}</legend><p class="help">${d.help}</p>
    ${d.options.map((o, i) => `<label class="o"><input type="radio" name="${d.id}" id="${d.id}_${i}" value="${esc(o.v)}"${o.rec ? ' data-rec="1"' : ''}><span>${o.v}${o.rec ? '<span class="tag">추천</span>' : ''}</span></label>`).join('')}</fieldset>`,
  ).join('\n')}
  </div>

  <h2>요약</h2>
  <div class="sum">
    <label class="m" for="memo_all">전체 의견</label><textarea class="memo" id="memo_all" placeholder="화면 전반에 대한 의견"></textarea>
    <label class="m" for="out">복사용 요약</label><textarea id="out" readonly></textarea>
    <div class="acts"><button type="button" id="fill">고르지 않은 항목을 추천으로 채우기</button><button type="button" class="p" id="copy">요약 복사</button><span id="toast" role="status"></span></div>
  </div>
</div>
<script>
(function(){
  var KEY='chuseok-board-mock-v1';
  function q(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s));}
  function build(){
    var lines=['[한가위 현황판 시안 점검]'];
    q('fieldset.dec').forEach(function(fs,i){
      var c=fs.querySelector('input:checked');
      lines.push((i+1)+'. '+fs.getAttribute('data-title')+': '+(c?c.value:'(미선택)'));
    });
    q('figure.fig').forEach(function(f){
      var m=f.querySelector('.memo').value.trim();
      if(m)lines.push('- '+f.getAttribute('data-title')+': '+m.replace(/\\n+/g,' '));
    });
    var all=document.getElementById('memo_all').value.trim();
    if(all)lines.push('- 전체: '+all.replace(/\\n+/g,' '));
    document.getElementById('out').value=lines.join('\\n');
  }
  function save(){try{var st={c:[],t:{}};q('input:checked').forEach(function(i){st.c.push(i.id);});q('.memo').forEach(function(i){if(i.value)st.t[i.id]=i.value;});localStorage.setItem(KEY,JSON.stringify(st));}catch(e){}}
  function load(){try{var st=JSON.parse(localStorage.getItem(KEY)||'null');if(!st)return;(st.c||[]).forEach(function(id){var el=document.getElementById(id);if(el)el.checked=true;});Object.keys(st.t||{}).forEach(function(id){var el=document.getElementById(id);if(el)el.value=st.t[id];});}catch(e){}}
  document.addEventListener('change',function(){build();save();});
  document.addEventListener('input',function(e){if(e.target&&e.target.classList&&e.target.classList.contains('memo')){build();save();}});
  document.getElementById('fill').addEventListener('click',function(){
    q('fieldset.dec').forEach(function(fs){if(fs.querySelector('input:checked'))return;var r=fs.querySelector('input[data-rec]');if(r)r.checked=true;});
    build();save();document.getElementById('toast').textContent='고르지 않은 항목만 추천으로 채웠습니다.';
  });
  document.getElementById('copy').addEventListener('click',function(){
    var t=document.getElementById('out');
    function done(){document.getElementById('toast').textContent='복사했습니다. 채팅에 붙여 주세요.';}
    if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t.value).then(done,function(){t.select();try{document.execCommand('copy');done();}catch(e){}});}
    else{t.select();try{document.execCommand('copy');done();}catch(e){}}
  });
  load();build();
})();
</script>
`;
writeFileSync(out, html);
console.log(`wrote ${out} (${(html.length / 1024).toFixed(0)} KB)`);
