/**
 * 한가위 강화 대회(추석 업데이트 2번) 논의 아티팩트 빌더 — 안건마다 배경 숫자 · 제안 · 선택지 · 의견 칸.
 *   실행: bun run scripts/build-chuseok-rank-talk.ts <출력 html 경로>
 * 숫자는 2026-09-21 밤 1서버 실서버 조회값(읽기 전용). 결정이 나면 TOPICS의 status·options를 고쳐 다시 만든다.
 */
import { writeFileSync } from 'node:fs';

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

const TOPICS: Topic[] = [
  {
    id: 'spread',
    title: '상위권 쏠림을 어떻게 볼까',
    status: 'open',
    background: `<div class="scroll"><table>
      <thead><tr><th>지금 1서버(아이템 120종 기준)</th><th>값</th></tr></thead>
      <tbody>
        <tr><td>1등 자리 120개를 가진 사람</td><td>17명, 그중 상위 3명이 99자리</td></tr>
        <tr><td>2등 자리 120개</td><td>상위 3명이 105자리</td></tr>
        <tr><td>3등 자리 120개</td><td>44명으로 분산</td></tr>
        <tr><td>최근 7일 접속자의 개인 최고 강화</td><td>중앙값 +10 · 상위 10% +78 · 상위 1% +257</td></tr>
        <tr><td>최근 7일 다이아 단축 지출</td><td>137만, 상위 2명은 주당 약 15만씩</td></tr>
      </tbody></table></div>
      <p>한 사람이 여러 아이템에서 받을 수 있게 하면, 6종의 1등과 2등 12자리는 같은 두세 명이 가져갈 가능성이 큽니다. 서버당 보상 다이아 36만 가운데 30만이 그쪽으로 갑니다. 상위권에게 1등 보상 3만은 하루 반치 단축 지출이라, 이 대회는 그들에게 다이아를 더 쓰게 하는 장치로 작동합니다. 그 자체는 나쁘지 않지만, 나머지 500명은 상위 10%도 +78이라 3등에 닿기 어렵습니다.</p>`,
    proposal: '1~3등 보상은 확정안 그대로 두고, 4~10등에 작은 보상 구간을 더합니다. 수상 자리가 아이템당 3개에서 10개로 늘어 중상위권이 노려 볼 목표가 생깁니다. 그 아래 다수는 3번(강화 성공 적립)이 맡습니다. 한 사람이 받을 아이템 수를 제한하는 방법은 순위표와 수상자가 달라져 설명이 복잡해지므로 권하지 않습니다.',
    options: [
      { v: '4~10등 보상 구간을 더한다', rec: true },
      { v: '확정안 그대로(1~3등만, 여러 아이템 수상 허용)' },
      { v: '한 사람이 받을 수 있는 아이템 수를 제한한다', help: '예: 가장 높은 순위 2개까지. 빈자리는 다음 사람에게' },
      { v: '4~10등 구간도 더하고 아이템 수도 제한한다' },
    ],
    follow: {
      id: 'spread_amount',
      label: '4~10등 보상을 더한다면 수치',
      help: '아이템당 7자리, 6종이면 서버당 42자리입니다. 다이아 2,000이면 서버당 84,000이, 3,000이면 126,000이 더 나갑니다.',
      options: [{ v: '💎 2,000 · 📦 60', rec: true }, { v: '💎 3,000 · 📦 90' }, { v: '💎 1,000 · 📦 30' }],
      free: '다른 수치',
    },
  },
  {
    id: 'minlevel',
    title: '수상에 필요한 최소 단계',
    status: 'open',
    background: `<p>인기 없는 아이템에서는 낮은 단계로도 3등이 될 수 있습니다. 실패 없이 단축도 없이 기다리면 +50까지 약 19시간, +70까지 약 39시간, +99까지 약 3.5일이 걸립니다. 지금 아이템별 3등의 최고 단계 중앙값은 +84입니다(한 달 누적).</p>`,
    proposal: '+30을 하한으로 둡니다. 하루 남짓이면 닿는 단계라 참여를 막지 않으면서, 거의 키우지 않은 아이템으로 상을 받는 일은 없앱니다. 하한에 못 미친 자리는 비워 둡니다.',
    options: [{ v: '+30 이상', rec: true }, { v: '+50 이상' }, { v: '하한 없음' }],
    free: '다른 단계',
  },
  {
    id: 'basis',
    title: '무엇으로 순위를 매기나',
    status: 'open',
    background: `<p>강화는 성공, 유지, 하락 세 갈래입니다. 종료 시점의 현재 단계로 매기면 막판에 하락이 무서워 도전을 멈추게 됩니다. 최고 도달 단계와 그 시각은 이미 장비마다 기록되고 있어 새로 만들 것이 없습니다. 강화 결과는 유저가 직접 수령할 때 확정됩니다.</p>`,
    proposal: '기간 안에 도달한 최고 단계로 매깁니다. 종료 시각까지 수령한 결과만 인정하고, 그때 진행 중이던 강화는 세지 않습니다. 이 점은 공지와 현황판에 분명히 적습니다.',
    options: [{ v: '기간 중 최고 도달 단계 · 종료 시각까지 수령한 결과만', rec: true }, { v: '종료 시각의 현재 단계' }],
  },
  {
    id: 'tie',
    title: '같은 단계일 때',
    status: 'fixed',
    background: `<p>확정안은 먼저 도달한 사람이 앞섭니다. 도달 시각은 초 단위로 기록됩니다.</p>`,
    proposal: '확정안을 유지하고, 시비가 없도록 현황판에 도달 시각을 함께 보여 줍니다.',
    options: [{ v: '먼저 도달한 사람이 앞선다(도달 시각 표시)', rec: true }, { v: '같은 단계면 공동 순위로 둘 다 지급' }],
  },
  {
    id: 'period',
    title: '기간과 종료 시각',
    status: 'open',
    background: `<p>아이템은 9/24(목) 10:00에 열립니다. 모두 0에서 출발하지만, 상자를 많이 쌓아 둔 사람(최대 4,841개)은 바로 뽑고, 중앙값 29개인 사람은 며칠치 보급이 쌓여야 6종을 갖춥니다. 기간이 짧을수록 상자 부자에게 유리합니다. 종료를 자정 직전에 두면 자정에 도는 점령전 공개 작업과 겹치므로, 최종 순위 저장은 자정에서 몇 분 뒤로 잡습니다.</p>`,
    proposal: '9/24 10:00부터 9/30 23:59까지 일주일입니다. 연휴(9/24~27)에 시작해 평일 사흘을 더 주면 늦게 아이템을 얻은 사람도 따라올 시간이 있습니다.',
    options: [{ v: '9/24(목) 10:00 ~ 9/30(수) 23:59', rec: true }, { v: '9/24(목) 10:00 ~ 10/1(목) 23:59' }, { v: '9/24(목) 10:00 ~ 9/27(일) 23:59 (연휴만)' }],
    free: '다른 기간',
  },
  {
    id: 'boxes',
    title: '보상 상자의 부위 분배',
    status: 'open',
    background: `<p>상자는 무기, 방어구, 장신구 세 종류입니다. 1등 📦900 기준으로, 세 부위에 같은 수로 나누면 300개씩이고 그 아이템의 부위로만 주면 900개가 한 부위에 몰립니다.</p>`,
    proposal: '세 부위에 같은 수로 나눕니다. 기존 보상(초대, 대난투)이 모두 이 방식이라 유저가 받아들이기 쉽고, 한 부위 상자만 900개가 쌓이는 일도 없습니다.',
    options: [{ v: '세 부위에 같은 수(300 · 300 · 300)', rec: true }, { v: '그 아이템의 부위 상자로만(900)' }],
  },
  {
    id: 'titles',
    title: '순위 칭호',
    status: 'open',
    background: `<p>칭호는 한 번 받으면 계속 보유합니다. 3종으로 하면 어느 아이템에서 받았든 같은 칭호이고, 18종이면 아이템마다 다른 이름이 필요합니다. 가제는 1등 '한가위 으뜸 장인', 2등 '한가위 버금 장인', 3등 '한가위 장인'입니다.</p>`,
    proposal: '3종으로 합니다. 이름 18개를 억지로 늘리면 품질이 떨어지고, 상위권 두세 명이 칭호 열몇 개를 한꺼번에 받는 모양도 어색합니다. 4~10등 구간을 더하더라도 칭호는 1~3등에게만 줍니다.',
    options: [{ v: '3종(순위 공통)', rec: true }, { v: '18종(아이템 6종 × 순위 3)' }],
    follow: {
      id: 'title_names',
      label: '칭호 이름',
      options: [{ v: '가제 그대로(한가위 으뜸 장인 · 한가위 버금 장인 · 한가위 장인)', rec: true }],
      free: '다른 이름',
    },
  },
  {
    id: 'board',
    title: '현황판에 무엇을 보여 줄까',
    status: 'open',
    multi: true,
    background: `<p>홈 배너로 들어가는 실시간 현황판입니다. 기존 아이템 순위 조회를 그대로 쓰고 1분 단위로 갱신합니다.</p>`,
    proposal: '아래 여섯 가지를 모두 넣습니다. 내 순위와 윗자리와의 차이가 보여야 한 단계 더 올릴 이유가 생깁니다.',
    options: [
      { v: '아이템 6종마다 1~10등(아바타 · 닉네임 · 단계)', rec: true },
      { v: '도달 시각', rec: true },
      { v: '내 순위 · 내 단계 · 바로 윗자리와의 차이', rec: true },
      { v: '아이템이 없는 사람에게 얻는 방법 안내(보급 상자)', rec: true },
      { v: '순위별 보상 표', rec: true },
      { v: '종료 뒤에도 최종 결과를 며칠간 열어 둠', rec: true },
    ],
  },
  {
    id: 'settle',
    title: '종료와 지급',
    status: 'fixed',
    background: `<p>확정안은 종료 시각에 순위를 확정하고, 다음 날 운영자가 어드민에서 확인한 뒤 지급하는 방식입니다. 종료 시각에 최종 순위를 따로 저장해 두면 그 뒤의 강화가 순위표를 바꾸지 않습니다.</p>`,
    proposal: '확정안대로 합니다. 어드민에 아이템별 최종 순위와 [지급] 버튼을 두고, 우편(다이아 · 상자)과 칭호를 한 번에 넣습니다. 두 번 눌러도 한 번만 나가게 만듭니다.',
    options: [{ v: '다음 날 어드민에서 확인 후 지급', rec: true }, { v: '종료 즉시 자동 지급' }],
  },
  {
    id: 'exclude',
    title: '순위에서 뺄 계정',
    status: 'open',
    multi: true,
    background: `<p>정지 계정은 기존 순위 조회가 이미 제외합니다. 운영자 본인 계정과 심사용 계정이 순위에 오르면 수상 자리를 차지하게 됩니다.</p>`,
    proposal: '아래 세 가지를 모두 뺍니다.',
    options: [
      { v: '정지 계정', rec: true },
      { v: '정산 시점에 탈퇴한 계정', rec: true },
      { v: '운영자 · 심사용 계정', rec: true },
    ],
  },
  {
    id: 'scale',
    title: '보상 규모',
    status: 'fixed',
    background: `<div class="scroll"><table>
      <thead><tr><th>아이템마다</th><th>다이아</th><th>상자</th></tr></thead>
      <tbody><tr><td>1등</td><td>💎 30,000</td><td>📦 900</td></tr><tr><td>2등</td><td>💎 20,000</td><td>📦 600</td></tr><tr><td>3등</td><td>💎 10,000</td><td>📦 300</td></tr>
      <tr><td>6종 합계(서버당)</td><td>💎 360,000</td><td>📦 10,800</td></tr></tbody></table></div>
      <p>서버당 다이아 36만은 주간 단축 지출(137만)의 26%, 전체 보유 다이아(505만)의 7%입니다.</p>`,
    proposal: '확정안을 유지합니다. 경제를 흔들 크기가 아니고, 상위권은 받는 것보다 훨씬 많이 씁니다.',
    options: [{ v: '확정안 유지', rec: true }, { v: '다시 본다' }],
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

const html = `<title>한가위 강화 대회 논의</title>
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
@media (max-width:560px){h1{font-size:25px}nav.toc ol{columns:1}section.topic,.result{padding:16px}}
@media (prefers-reduced-motion:no-preference){.opt{transition:border-color .12s,background-color .12s}}
</style>
<div class="wrap">
  <header>
    <h1>한가위 강화 대회 논의</h1>
    <p class="lead">추석 아이템 6종의 강화 순위 보상을 안건별로 나눴습니다. 안건마다 배경 숫자와 제 제안을 적었고, 선택지를 고르거나 의견을 적으실 수 있습니다. 숫자는 9월 21일 밤 1서버 기준입니다. 고른 것과 적은 의견은 맨 아래에 모이니 복사해서 채팅에 붙여 주세요.</p>
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
  var KEY='chuseok-rank-talk-v1';
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
    var lines=['[한가위 강화 대회 논의 결과]'];
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
