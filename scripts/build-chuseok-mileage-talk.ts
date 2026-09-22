/**
 * 강화 마일리지(추석 업데이트 3번) 논의 아티팩트 빌더 — 안건마다 배경 숫자 · 제안 · 선택지 · 의견 칸.
 *   실행: bun run scripts/build-chuseok-mileage-talk.ts <출력 html 경로>
 * 숫자는 2026-09-22 저녁 1서버 최근 7일 강화 성공 기록(읽기 전용)을 유저×날짜로 모아 적립 방식별로 돌린 값.
 * 유저별 분포는 scripts/chuseok-mileage-dist.json(방식별 유저 점수 배열, 익명).
 */
import { readFileSync, writeFileSync } from 'node:fs';

const out = process.argv[2];
if (!out) throw new Error('출력 경로 필요');

type Option = { v: string; rec?: boolean; help?: string };
type Topic = {
  id: string;
  title: string;
  status: 'open' | 'fixed';
  /** 배경 — 왜 정해야 하는지, 근거 숫자. HTML 허용(표). */
  background: string;
  /** 제안과 이유. */
  proposal: string;
  options?: Option[];
  multi?: boolean;
  free?: string;
  /** 딸린 질문(선택지에 따라 추가로 정할 것). */
  follow?: { id: string; label: string; options: Option[]; free?: string; help?: string };
};

// ── 시뮬레이션 자료(유저 357명, 최근 7일) ──
const DIST: Record<string, number[]> = JSON.parse(readFileSync('scripts/chuseok-mileage-dist.json', 'utf8'));
const pct = (arr: number[], p: number) => { const a = [...arr].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(p * (a.length - 1)))]!; };
const n = (v: number) => v.toLocaleString('ko-KR');
const SCHEMES: { key: string; name: string; note: string }[] = [
  { key: 'flat', name: '성공 1회 = 1', note: '상한 없음' },
  { key: 'flatCap50', name: '성공 1회 = 1, 하루 상한 50', note: '추천' },
  { key: 'flatCap30', name: '성공 1회 = 1, 하루 상한 30', note: '' },
  { key: 'level', name: '세금식: 도달 단계 = 점수', note: '+99 성공 = 99점' },
  { key: 'levelCap1500', name: '세금식 + 하루 상한 1,500', note: '' },
  { key: 'band', name: '단계 구간 가중 1~5점', note: '+1~24 = 1 · +25~49 = 2 · … · +100 이상 = 5' },
  { key: 'bandCap100', name: '단계 구간 가중 + 하루 상한 100', note: '' },
  { key: 'time', name: '시간제: 성공한 강화의 소요 시간 10분 = 1', note: '등록 시점 시간, 다이아 단축과 무관' },
  { key: 'timeCap50', name: '시간제 + 하루 상한 50', note: '' },
];
const simRows = SCHEMES.map((sc) => {
  const d = DIST[sc.key]!;
  const p50 = pct(d, 0.5), p90 = pct(d, 0.9), p99 = pct(d, 0.99), mx = Math.max(...d);
  return `<tr><td>${sc.name}${sc.note ? `<br><small style="color:var(--muted)">${sc.note}</small>` : ''}</td><td>${n(pct(d, 0.25))}</td><td>${n(p50)}</td><td>${n(pct(d, 0.75))}</td><td>${n(p90)}</td><td>${n(p99)}</td><td>${n(mx)}</td><td><b>${(p90 / Math.max(1, p50)).toFixed(0)}배</b></td><td>${(mx / Math.max(1, p50)).toFixed(0)}배</td></tr>`;
}).join('');
// 도달 보상 사다리(추천안, 방식 B 기준) — 각 단계 도달 인원과 총 지급 추정
const LADDER: [number, number, number][] = [[10, 100, 3], [30, 200, 6], [60, 300, 9], [100, 400, 12], [150, 500, 15], [220, 500, 15], [300, 600, 15]];
const ladderFor = (key: string) => {
  const d = DIST[key]!;
  let dia = 0, box = 0;
  const rows = LADDER.map(([m, dd, bb]) => { const reach = d.filter((v) => v >= m).length; dia += reach * dd; box += reach * bb; return `<tr><td>${n(m)}</td><td>💎${n(dd)} · 📦${bb}</td><td>${reach}명 (${((100 * reach) / d.length).toFixed(0)}%)</td></tr>`; }).join('');
  return { rows, dia, box, users: d.length };
};
const LB = ladderFor('flatCap50');
const LF = ladderFor('flat');
const LL = ladderFor('level');
// 마일리지 탭 목업(390px)
const mock = `<div class="ph"><div class="bar"><span>‹</span><b>한가위 강화 대회</b><small>2일 09:14:07 남음</small></div>
<div class="seg"><span>순위</span><span class="on">마일리지</span></div>
<div class="body">
  <div class="mine"><span class="lab">내 강화 마일리지</span><b>128</b><span class="nx">다음 도달 보상까지 22</span><div class="gauge"><i style="width:57%"></i></div></div>
  <p class="sub2">도달 보상 <small>쌓은 총량으로 따져요. 교환에 써도 줄지 않아요.</small></p>
  <div class="lad">
    <div class="st done"><b>10</b><span>💎100 · 📦3</span><i>받음</i></div><div class="st done"><b>30</b><span>💎200 · 📦6</span><i>받음</i></div><div class="st done"><b>60</b><span>💎300 · 📦9</span><i>받음</i></div>
    <div class="st ready"><b>100</b><span>💎400 · 📦12</span><i class="btn">받기</i></div><div class="st"><b>150</b><span>💎500 · 📦15</span></div><div class="st"><b>220</b><span>💎500 · 📦15</span></div><div class="st"><b>300</b><span>💎600 · 📦15</span></div>
  </div>
  <p class="sub2">교환 <small>쓸 수 있는 마일리지 98</small></p>
  <div class="shop">
    <div class="it"><b>📦 상자 3개</b><span>10</span><i class="btn">교환</i></div>
    <div class="it"><b>💎 100</b><span>20</span><i class="btn">교환</i></div>
    <div class="it"><b>추석 장비 선택 상자</b><span>120</span><i class="btn dis">부족</i></div>
  </div>
  <p class="foot">대회가 끝난 뒤 10/3까지 받고 교환할 수 있어요.</p>
</div></div>`;

const TOPICS: Topic[] = [
  {
    id: 'page',
    title: '어디에 둘까 — 페이지와 배너',
    status: 'open',
    background: `<p>순위 보상과 마일리지는 같은 기간, 같은 서버 단위, 같은 강화 행동을 다룹니다. 홈 배너는 이미 정시 보급 배너와 자리를 나눠 쓰고 있어 배너를 더 늘리면 넘겨 보는 부담이 커집니다. 아래는 현황판 상단에 세그먼트를 두고 마일리지 탭을 연 모습입니다. 닉네임과 수치는 예시입니다.</p>${mock}`,
    proposal: '현황판과 같은 페이지에 넣고, 상단 세그먼트(순위 | 마일리지)로 나눕니다. 배너는 하나로 두되 받을 도달 보상이 생기면 배너 문구가 "받을 보상이 있어요"로 바뀌어 마일리지 탭으로 들어갑니다. 한 라우트, 한 타이머라 구현도 가장 쌉니다.',
    options: [{ v: '현황판과 같은 페이지, 세그먼트로 나눔, 배너 하나', rec: true }, { v: '별도 페이지와 별도 배너' }, { v: '같은 페이지에 위아래로 이어 붙임(세그먼트 없이)' }],
  },
  {
    id: 'accrual',
    title: '무엇으로 얼마나 쌓나',
    status: 'open',
    background: `<p>최근 7일 강화 성공(단계 상승) 기록을 유저×날짜로 모아 일곱 가지 방식으로 돌렸습니다. 유저 357명, 성공 90,118회. 성공 한 번의 도달 단계는 보통 유저가 평균 +7.6, 상위 10% 유저가 평균 +42입니다. 열은 유저별 주간 적립량의 분포이고, 마지막 두 열은 상위 10%와 최상위가 중앙값의 몇 배인지입니다.</p>
<div class="scroll"><table><thead><tr><th>방식</th><th>하위 25%</th><th>중앙값</th><th>상위 25%</th><th>상위 10%</th><th>상위 1%</th><th>최대</th><th>상위 10% ÷ 중앙값</th><th>최대 ÷ 중앙값</th></tr></thead><tbody>${simRows}</tbody></table></div>
<p class="sub" style="margin-top:14px">시간 대비 효율 — 한 슬롯에서 그 단계를 계속 강화할 때 시간당 기대 점수(다이아 단축 없이 끝까지 기다림)</p>
<div class="scroll"><table><thead><tr><th>단계</th><th>시도 시간</th><th>성공률</th><th>횟수제 점/시간</th><th>세금식 점/시간</th><th>구간제 점/시간</th><th>시간제 점/시간</th></tr></thead><tbody>
<tr><td>+5</td><td>2.5분</td><td>100%</td><td>23.6</td><td>142</td><td>23.6</td><td>6.0</td></tr>
<tr><td>+10</td><td>5분</td><td>100%</td><td>12</td><td>132</td><td>12</td><td>6.0</td></tr>
<tr><td>+30</td><td>28분</td><td>70%</td><td>1.5</td><td>46</td><td>3.0</td><td>4.2</td></tr>
<tr><td>+50</td><td>51분</td><td>51%</td><td>0.6</td><td>30</td><td>1.8</td><td>3.1</td></tr>
<tr><td>+99</td><td>108분</td><td>25%</td><td>0.14</td><td>14</td><td>0.7</td><td>1.5</td></tr>
<tr><td>+110</td><td>10분</td><td>100%</td><td>6</td><td>666</td><td>30</td><td>6.0</td></tr>
<tr><td>+199</td><td>215분</td><td>25%</td><td>0.07</td><td>14</td><td>0.35</td><td>1.5</td></tr>
<tr><td>+399</td><td>860분</td><td>25%</td><td>0.02</td><td>7</td><td>0.09</td><td>1.5</td></tr>
</tbody></table></div>
<p>시간을 들이는 사람 기준으로는 어느 방식이든 낮은 단계가 유리합니다. 시도 시간이 +0에서 +99까지 천 배 넘게 늘어나는데 단계 점수는 백 배만 늘고 성공률은 4분의 1로 떨어지기 때문입니다. 횟수제는 +10과 +99의 차이가 86배, 세금식은 9배, 시간제는 4배로 좁혀집니다. 세금식은 격차를 줄이지만 뒤집지는 못하고, 각 사이클이 시작되는 +100·+200 직후(10초에서 10분짜리 시도에 100% 성공, 점수는 100 이상)에서는 시간당 666점으로 튑니다. 상위 유저의 장비가 많이 머무는 구간입니다.</p>
<p>그런데 유저 단위 격차는 정반대로 나옵니다. 상위 유저는 시간을 들이지 않고 다이아로 시간을 사기 때문(단축이 다이아 지출의 79%)에, 시간에 비례하는 점수를 다이아로 살 수 있는 방식일수록 격차가 커집니다. 세금식(도달 단계 = 점수)은 상위권에 크게 유리합니다. 상위 유저는 성공 횟수가 많을 뿐 아니라 높은 단계에서 성공하므로 한 번의 점수도 다섯 배가 넘고, 두 효과가 곱해져 격차가 66배(상한을 걸어도 29배)가 됩니다. 낮은 단계 되풀이로 점수를 부풀리는 걱정은 실제로는 작습니다. 되풀이하는 사람도 결국 상위 지출 유저이고, 그들은 세금식에서 더 벌어 갑니다. 격차를 가장 좁히는 것은 횟수 그대로에 하루 상한을 두는 방식입니다(8배).</p>`,
    proposal: '성공 1회 = 1점, 하루 상한 50점(주 최대 350)으로 합니다. 시간 공정성은 이 게임에서 이미 다이아가 맡고 있으므로(다이아로 시간을 삼), 이벤트 보상까지 시간이나 단계에 비례시키면 같은 사람에게 두 번 주는 셈이 됩니다. 마일리지는 참여를 세는 장치로 두고 상위권은 순위 보상이 맡게 합니다. 보통 유저(하루 6회)는 상한에 닿지 않고, 상위 유저는 상한에 묶여 사다리를 다 채우는 정도에서 멈춥니다.',
    options: [
      { v: '성공 1회 = 1, 하루 상한 50', rec: true, help: '상위 10% ÷ 중앙값 8배' },
      { v: '성공 1회 = 1, 상한 없음', help: '17배' },
      { v: '세금식: 도달 단계 = 점수', help: '66배, 상위권에 유리' },
      { v: '세금식 + 하루 상한 1,500', help: '29배' },
      { v: '단계 구간 가중 1~5점(+25마다 1점씩)', help: '30배' },
      { v: '단계 구간 가중 + 하루 상한 100', help: '15배' },
      { v: '시간제: 성공한 강화의 소요 시간 10분 = 1', help: '111배. 보통 유저는 주 21점밖에 못 모음' },
      { v: '시간제 + 하루 상한 50', help: '19배' },
    ],
    free: '다른 상한이나 방식',
  },
  {
    id: 'ladder',
    title: '도달 보상 사다리',
    status: 'open',
    background: `<p>추천 적립 방식(1회 1점, 하루 상한 50)을 최근 7일 기록에 적용했을 때 각 단계에 닿는 사람 수와 총 지급 추정입니다. 실제 이벤트 주간은 강화가 더 늘 테니 이보다 위로 봐야 합니다.</p>
<div class="scroll"><table><thead><tr><th>단계</th><th>보상</th><th>닿는 사람(357명 중)</th></tr></thead><tbody>${LB.rows}</tbody></table></div>
<p>사다리 전부 합치면 1인 최대 💎2,600·📦75. 지난주 기록 기준 총 지급 추정은 💎${n(LB.dia)}·📦${n(LB.box)}입니다. 같은 사다리를 상한 없는 횟수에 적용하면 💎${n(LF.dia)}·📦${n(LF.box)}, 세금식에 적용하면 단계 숫자를 다시 잡아야 하므로 비교하지 않았습니다.</p>`,
    proposal: '일곱 단계로 10·30·60·100·150·220·300에 두고, 보상은 💎100·📦3에서 시작해 💎600·📦15까지 올립니다. 보통 유저는 두세 단계, 상위 유저는 전부 받습니다. 첫 단계(10)는 하루 강화만으로 닿아 첫날 안에 첫 보상을 받게 합니다.',
    options: [{ v: '위 사다리 그대로', rec: true }, { v: '단계 수는 그대로, 보상 절반' }, { v: '단계 수는 그대로, 보상 1.5배' }],
    free: '단계나 수치 직접 지정',
  },
  {
    id: 'shop',
    title: '교환 목록',
    status: 'open',
    background: `<p>도달 보상은 쌓은 총량으로 따지고, 교환은 남은 마일리지를 씁니다. 교환 목록에 추석 장비 선택 상자(6종 중 하나를 골라 받음)를 넣으면, 상자를 아무리 열어도 원하는 추석 장비를 못 뽑은 사람이 강화 대회에 들어올 길이 생깁니다. 상한 50 기준 상위 유저는 주 350점이라 선택 상자 두 개쯤 됩니다.</p>`,
    proposal: '📦 3개 = 10점, 💎 100 = 20점, 추석 장비 선택 상자 1개 = 120점. 다이아 교환은 도달 보상과 겹치지 않게 비싸게 두고, 선택 상자가 목표가 되게 합니다.',
    options: [{ v: '📦3 = 10 · 💎100 = 20 · 추석 장비 선택 상자 = 120', rec: true }, { v: '선택 상자 없이 상자·다이아만' }, { v: '선택 상자 값을 200으로 올림(상위 유저도 1개)' }],
    free: '다른 구성',
  },
  {
    id: 'after',
    title: '종료 뒤 받고 교환할 수 있는 기간',
    status: 'open',
    background: `<p>대회 종료 9/30 23:59 뒤에도 못 받은 도달 보상과 남은 마일리지를 정리할 시간이 필요합니다. 현황판 결과 공개는 3일(10/3까지)로 정하셨습니다.</p>`,
    proposal: '현황판과 같이 10/3까지로 맞춥니다. 그 뒤 남은 마일리지는 사라지며, 이 점을 화면 아래에 적어 둡니다.',
    options: [{ v: '10/3까지(현황판과 같음)', rec: true }, { v: '10/7까지' }],
  },
  {
    id: 'name',
    title: '이름',
    status: 'open',
    background: `<p>결제 마일리지가 이미 상점 포인트 탭에서 "마일리지"라는 이름을 쓰고 있습니다. 화면과 우편에서 구분되어야 합니다.</p>`,
    proposal: '"강화 마일리지"로 두고 화면 어디서나 앞에 "강화"를 붙입니다. 결제 쪽은 "마일리지" 그대로라 둘이 나란히 보여도 구분됩니다.',
    options: [{ v: '강화 마일리지', rec: true }, { v: '송편(강화에 성공하면 송편을 빚는다)' }],
    free: '다른 이름',
  },
];


const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const optsHtml = (name: string, options: Option[], multi: boolean, free?: string) => {
  const type = multi ? 'checkbox' : 'radio';
  const rows = options
    .map(
      (o, i) => `<label class="opt"><input type="${type}" name="${name}" id="${name}_${i}" value="${esc(o.v)}"${o.rec ? ' data-rec="1"' : ''}>
        <span><b>${esc(o.v)}</b>${o.rec ? '<em>추천</em>' : ''}${o.help ? `<small>${esc(o.help)}</small>` : ''}</span></label>`,
    )
    .join('');
  const fr = free
    ? `<label class="opt"><input type="${type}" name="${name}" id="${name}_free" value="__free__"><span><b>${esc(free)}</b></span></label>
       <input type="text" class="txt" id="free_${name}" placeholder="직접 입력" aria-label="${esc(free)}">`
    : '';
  return rows + fr;
};

const topicHtml = (t: Topic, i: number) => `
  <section class="topic" data-topic="${t.id}" data-title="${esc(t.title)}"${t.multi ? ' data-multi="1"' : ''}>
    <h2><span class="no">${i + 1}</span>${esc(t.title)}<span class="chip ${t.status === 'fixed' ? 'ok' : 'todo'}">${t.status === 'fixed' ? '확정안 재확인' : '정할 것'}</span></h2>
    <div class="bg"><p class="sub">배경</p>${t.background}</div>
    <div class="prop"><p class="sub">제안</p><p>${esc(t.proposal)}</p></div>
    <fieldset class="dec"><legend>${t.multi ? '넣을 것을 모두 고르기' : '선택'}</legend>${optsHtml(`t_${t.id}`, t.options ?? [], !!t.multi, t.free)}</fieldset>
    ${
      t.follow
        ? `<fieldset class="dec follow" data-follow="${t.follow.id}" data-label="${esc(t.follow.label)}"><legend>${esc(t.follow.label)}</legend>${t.follow.help ? `<p class="help">${esc(t.follow.help)}</p>` : ''}${optsHtml(`f_${t.follow.id}`, t.follow.options, false, t.follow.free)}</fieldset>`
        : ''
    }
    <label class="sub" for="memo_${t.id}">의견</label>
    <textarea class="memo" id="memo_${t.id}" rows="3" placeholder="다르게 보시는 점, 더 따져 볼 것, 조건을 붙이고 싶은 것을 적어 주세요"></textarea>
  </section>`;

const html = `<title>강화 마일리지 논의</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&family=Noto+Sans+KR:wght@400;500;700&display=swap">
<style>
:root{
  --bg:#f4f6f8; --surface:#ffffff; --ink:#1b2437; --muted:#5b6578; --line:#d9dee7;
  --jade:#1f6f5c; --jade-soft:#e3f1ec; --moon:#b9860f; --moon-soft:#fbf1d4; --quote:#eef1f6;
}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){
    --bg:#10151f; --surface:#182131; --ink:#e6eaf2; --muted:#9aa5b8; --line:#2b364a;
    --jade:#5cc2a6; --jade-soft:#17332d; --moon:#f0c75e; --moon-soft:#3a3016; --quote:#1f2a3c;
  }
}
:root[data-theme="dark"]{
  --bg:#10151f; --surface:#182131; --ink:#e6eaf2; --muted:#9aa5b8; --line:#2b364a;
  --jade:#5cc2a6; --jade-soft:#17332d; --moon:#f0c75e; --moon-soft:#3a3016; --quote:#1f2a3c;
}
*{box-sizing:border-box}
body{background:var(--bg);color:var(--ink);font-family:'Noto Sans KR',system-ui,-apple-system,'Apple SD Gothic Neo',sans-serif;font-size:15px;line-height:1.7;word-break:keep-all;overflow-wrap:anywhere}
.wrap{max-width:800px;margin:0 auto;padding-inline:18px;padding-block:28px 56px;display:flex;flex-direction:column;gap:20px}
h1,h2{font-family:'Gowun Batang','Noto Serif KR',serif;text-wrap:balance;margin:0}
h1{font-size:30px;letter-spacing:-.01em}
h2{font-size:20px;display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
h2 .no{color:var(--moon);font-weight:700;font-variant-numeric:tabular-nums}
.lead{margin:6px 0 0;color:var(--muted);max-width:62ch}
p{margin:0}
nav.toc{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:14px 16px}
nav.toc ol{margin:0;padding-left:20px;columns:2;column-gap:24px;font-size:14px}
nav.toc a{color:var(--ink);text-decoration:none}
nav.toc a:hover{color:var(--jade);text-decoration:underline}
nav.toc li.done a{color:var(--jade)}
nav.toc li.done::marker{color:var(--jade)}
section.topic{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:20px;display:flex;flex-direction:column;gap:12px;scroll-margin-top:12px}
.chip{font:700 11.5px/1 'Noto Sans KR',sans-serif;padding:5px 8px;border-radius:999px;white-space:nowrap}
.chip.ok{background:var(--jade-soft);color:var(--jade)}
.chip.todo{background:var(--moon-soft);color:var(--moon)}
.sub{font-weight:700;font-size:12.5px;letter-spacing:.06em;color:var(--muted);margin:0 0 4px;display:block}
.bg{display:flex;flex-direction:column;gap:8px;color:var(--ink)}
.bg p{max-width:66ch}
.prop{background:var(--quote);border-radius:10px;padding:12px 14px}
.prop p{max-width:64ch}
table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums;font-size:14px}
th,td{text-align:left;padding:7px 8px;border-bottom:1px solid var(--line);vertical-align:top}
th{color:var(--muted);font-weight:500;font-size:12.5px}
td:first-child{color:var(--muted)}
.scroll{overflow-x:auto}
.dec{border:0;margin:0;padding:0;display:flex;flex-direction:column;gap:8px;min-width:0}
.dec legend{font-weight:700;font-size:12.5px;letter-spacing:.06em;color:var(--muted);padding:0;margin-bottom:6px}
.dec.follow{border-left:3px solid var(--moon);padding-left:12px}
.help{color:var(--muted);font-size:13.5px;max-width:64ch}
.opt{display:flex;gap:10px;align-items:flex-start;border:1px solid var(--line);border-radius:10px;padding:10px 12px;cursor:pointer;background:var(--bg)}
.opt:has(input:checked){border-color:var(--jade);background:var(--jade-soft)}
.opt input{margin-top:6px;accent-color:var(--jade)}
.opt span{display:flex;flex-direction:column;gap:2px;min-width:0}
.opt b{font-weight:500}
.opt em{font-style:normal;font-weight:700;font-size:11.5px;color:var(--moon)}
.opt small{color:var(--muted);font-size:12.5px;line-height:1.5}
.txt,.memo{width:100%;border:1px solid var(--line);border-radius:8px;padding:9px 11px;font:inherit;font-size:14px;background:var(--bg);color:var(--ink)}
.memo{resize:vertical;line-height:1.6}
.txt:focus-visible,.memo:focus-visible,button:focus-visible,.opt input:focus-visible,nav.toc a:focus-visible{outline:2px solid var(--moon);outline-offset:2px}
.result{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:20px;display:flex;flex-direction:column;gap:10px}
#out{width:100%;min-height:240px;border:1px solid var(--line);border-radius:10px;padding:12px;font:13px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;background:var(--bg);color:var(--ink);resize:vertical}
.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
button{font:700 14px/1 'Noto Sans KR',sans-serif;border-radius:10px;padding:11px 14px;border:1px solid var(--line);background:var(--surface);color:var(--ink);cursor:pointer}
button.primary{background:var(--jade);border-color:var(--jade);color:#fff}
:root[data-theme="dark"] button.primary{color:#0d1a16}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]) button.primary{color:#0d1a16}}
#toast{font-size:13px;color:var(--jade);min-height:1em}
/* 마일리지 탭 목업(390px, 게임 다크 고정) */
.ph{width:390px;max-width:100%;margin:12px 0 4px;background:#09090b;color:#f4f4f5;border-radius:18px;border:1px solid #27272a;overflow:hidden;font:13px/1.4 "Pretendard","Apple SD Gothic Neo",system-ui,sans-serif}
.ph .bar{display:flex;align-items:center;gap:8px;padding:11px 14px;border-bottom:1px solid #1f1f23;font-size:14px}
.ph .bar small{margin-left:auto;font-size:11.5px;color:#fbbf24;font-weight:700}
.ph .seg{display:grid;grid-template-columns:1fr 1fr;margin:10px 14px 0;background:#18181b;border-radius:10px;padding:3px}
.ph .seg span{text-align:center;padding:6px;border-radius:8px;font-size:12.5px;color:#a1a1aa}
.ph .seg span.on{background:#27272a;color:#f4f4f5;font-weight:700}
.ph .body{padding:12px 14px 14px}
.ph .mine{background:#18181b;border:1px solid rgba(245,158,11,.5);border-radius:12px;padding:10px 12px;display:grid;grid-template-columns:1fr auto;gap:2px 10px;align-items:baseline}
.ph .mine .lab{font-size:11px;color:#a1a1aa}
.ph .mine b{font-family:ui-monospace,Menlo,monospace;font-size:24px;color:#fde68a;grid-row:2}
.ph .mine .nx{font-size:11px;color:#fcd34d;grid-column:2;grid-row:2;align-self:end}
.ph .gauge{grid-column:1/-1;height:5px;border-radius:3px;background:#27272a;margin-top:6px;overflow:hidden}
.ph .gauge i{display:block;height:100%;background:#f59e0b}
.ph .sub2{margin:14px 0 6px;font-size:12.5px;font-weight:700;color:#f4f4f5}
.ph .sub2 small{font-weight:500;color:#a1a1aa;margin-left:6px}
.ph .lad{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
.ph .st{background:#18181b;border:1px solid #27272a;border-radius:10px;padding:7px 4px;text-align:center;display:flex;flex-direction:column;gap:2px}
.ph .st b{font-family:ui-monospace,Menlo,monospace;font-size:13px;color:#f4f4f5}
.ph .st span{font-size:9.5px;color:#a1a1aa;font-variant-numeric:tabular-nums}
.ph .st i{font-style:normal;font-size:10px;color:#6ee7b7}
.ph .st.done{border-color:#065f46}.ph .st.ready{border-color:#f59e0b;background:#241c0c}
.ph .btn{display:inline-block;font-style:normal;font-size:10.5px;font-weight:800;background:#d97706;color:#fff;border-radius:7px;padding:3px 8px}
.ph .btn.dis{background:#27272a;color:#71717a}
.ph .shop{display:flex;flex-direction:column;gap:6px}
.ph .it{display:flex;align-items:center;gap:10px;background:#18181b;border:1px solid #27272a;border-radius:10px;padding:8px 10px}
.ph .it b{font-size:12.5px;flex:1}
.ph .it span{font-family:ui-monospace,Menlo,monospace;font-size:12.5px;color:#fde68a}
.ph .foot{margin:12px 0 0;font-size:11px;color:#71717a}
@media (max-width:560px){h1{font-size:25px}nav.toc ol{columns:1}section.topic,.result{padding:16px}}
@media (prefers-reduced-motion:no-preference){.opt{transition:border-color .12s,background-color .12s}}
</style>
<div class="wrap">
  <header>
    <h1>강화 마일리지 논의</h1>
    <p class="lead">추석 업데이트 3번, 강화 성공을 쌓아 보상 받는 방식을 안건별로 나눴습니다. 안건마다 배경 숫자와 제 제안을 적었고, 선택지를 고르거나 의견을 적으실 수 있습니다. 숫자는 9월 22일 저녁 1서버 최근 7일 강화 기록으로 돌린 값입니다. 고른 것과 적은 의견은 맨 아래에 모이니 복사해서 채팅에 붙여 주세요.</p>
  </header>
  <nav class="toc" aria-label="안건 목록"><ol>${TOPICS.map((t) => `<li data-toc="${t.id}"><a href="#topic_${t.id}">${esc(t.title)}</a></li>`).join('')}</ol></nav>
  ${TOPICS.map((t, i) => topicHtml(t, i).replace('<section class="topic"', `<section class="topic" id="topic_${t.id}"`)).join('')}
  <section class="result" aria-labelledby="rh">
    <h2 id="rh">고른 것과 의견</h2>
    <div class="row"><button type="button" id="fill">비어 있는 안건을 추천으로 채우기</button><button type="button" class="primary" id="copy">복사하기</button><span id="toast" role="status"></span></div>
    <textarea id="out" readonly aria-label="고른 것과 의견 요약"></textarea>
  </section>
</div>
<script>
(function(){
  var KEY='chuseok-mileage-talk-v1';
  function q(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s));}
  function picked(fs){
    var ins=q('input[type=radio]:checked,input[type=checkbox]:checked',fs);
    if(!ins.length)return null;
    return ins.map(function(i){
      if(i.value!=='__free__')return i.value;
      var f=document.getElementById('free_'+i.name);
      return f&&f.value.trim()?f.value.trim():'(직접 입력 비어 있음)';
    });
  }
  function build(){
    var lines=['[강화 마일리지 논의 결과]'];
    q('section.topic').forEach(function(sec,idx){
      var main=sec.querySelector('fieldset.dec:not(.follow)');
      var v=picked(main);
      lines.push((idx+1)+'. '+sec.getAttribute('data-title')+': '+(v?v.join(' / '):'(미선택)'));
      var fo=sec.querySelector('fieldset.follow');
      if(fo){var fv=picked(fo);if(fv)lines.push('   - '+fo.getAttribute('data-label')+': '+fv.join(' / '));}
      var memo=sec.querySelector('.memo').value.trim();
      if(memo)lines.push('   - 의견: '+memo.replace(/\\n+/g,' '));
      var li=document.querySelector('[data-toc="'+sec.getAttribute('data-topic')+'"]');
      if(li)li.className=(v||memo)?'done':'';
    });
    document.getElementById('out').value=lines.join('\\n');
  }
  function save(){
    try{
      var st={c:[],t:{}};
      q('input:checked').forEach(function(i){st.c.push(i.id);});
      q('.txt,.memo').forEach(function(i){if(i.value)st.t[i.id]=i.value;});
      localStorage.setItem(KEY,JSON.stringify(st));
    }catch(e){}
  }
  function load(){
    try{
      var st=JSON.parse(localStorage.getItem(KEY)||'null');
      if(!st)return;
      (st.c||[]).forEach(function(id){var el=document.getElementById(id);if(el)el.checked=true;});
      Object.keys(st.t||{}).forEach(function(id){var el=document.getElementById(id);if(el)el.value=st.t[id];});
    }catch(e){}
  }
  document.addEventListener('change',function(){build();save();});
  document.addEventListener('input',function(e){
    var t=e.target;
    if(t&&t.classList&&t.classList.contains('txt')&&t.value){
      var r=document.getElementById(t.id.slice(5)+'_free');
      if(r)r.checked=true;
    }
    if(t&&t.classList&&(t.classList.contains('txt')||t.classList.contains('memo'))){build();save();}
  });
  document.getElementById('fill').addEventListener('click',function(){
    q('fieldset.dec').forEach(function(fs){
      if(q('input:checked',fs).length)return;
      q('input[data-rec]',fs).forEach(function(i){i.checked=true;});
    });
    build();save();
    document.getElementById('toast').textContent='고르지 않은 안건만 추천으로 채웠습니다.';
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
