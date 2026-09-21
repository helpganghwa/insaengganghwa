/**
 * 한가위 업데이트 계획 아티팩트 빌더 — 네 가지 범위(아이템 6종 · 강화 대회 · 강화 성공 적립 · 한가위 보급)의
 * 정해진 것과 정할 것을 한 화면에. 미정인 세 부위는 9차 후보 그림을 넣어 그 자리에서 고른다.
 *   실행: bun run scripts/build-chuseok-plan.ts <출력 html 경로>
 * 결정이 바뀌면 아래 데이터만 고쳐 다시 만든다(선택 폼 build-chuseok-pick.ts와 같은 방식).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const out = process.argv[2];
if (!out) throw new Error('출력 경로 필요');
const DIR = join(process.cwd(), 'public/sprites/chuseok-cand');
const img = (key: string) => `data:image/png;base64,${readFileSync(join(DIR, `${key}.png`)).toString('base64')}`;

type Opt = { key: string; name: string; note: string };
type Slot = { id: string; set: string; slot: string; fixed?: Opt; options?: Opt[] };

const SLOTS: Slot[] = [
  { id: 'hanbok_accessory', set: '한복', slot: '장신구', fixed: { key: 'chuseok_bok_pouch', name: '한가위 복주머니', note: '확정' } },
  { id: 'rabbit_accessory', set: '달토끼', slot: '장신구', fixed: { key: 'chuseok_rabbit_ears_v4', name: '토끼 귀(접힌 귀)', note: '확정' } },
];

/** 다시 만드는 부위와 주신 방향(선택 폼 2차 결과, 09-21 밤). 그림 선택은 선택 폼에서 한다. */
const REDO: { label: string; dir: string }[] = [
  { label: '한복 무기', dir: '달 또는 송편 컨셉의 무기' },
  { label: '한복 방어구', dir: '금박 꽃무늬 한복, 옥색 저고리 한복과 비슷한 느낌으로 하나 더' },
  { label: '달토끼 무기', dir: '떡메나 절굿공이에 토끼, 리본은 없이' },
  { label: '달토끼 방어구', dir: '토끼 인형탈 느낌, 머리 아래로만 입는 전신 슈트' },
];
const PICK_URL = 'https://claude.ai/artifact/7E5z1XeVjYRzmRQVKW3dwC';

type Decision = { id: string; label: string; help?: string; options: { v: string; rec?: boolean; help?: string }[]; free?: string };
const DECISIONS: Record<string, Decision[]> = {
  s2: [
    {
      id: 'period', label: '대회 기간',
      help: '순위표는 종료 시각에 확정하고, 지급은 다음 날 어드민에서 수동 정산합니다.',
      options: [{ v: '9/24(목) 10:00 ~ 9/30(수) 23:59', rec: true }, { v: '9/24(목) 10:00 ~ 10/1(목) 23:59' }],
      free: '다른 기간',
    },
    {
      id: 'boxsplit', label: '상자 보상의 부위 분배',
      help: '1등 📦900 기준입니다.',
      options: [{ v: '무기·방어구·장신구 같은 수(300·300·300)', rec: true }, { v: '그 아이템의 부위 상자로만(900)' }],
    },
    {
      id: 'titles', label: '순위 칭호 수',
      options: [
        { v: '3종(순위 공통: 1등·2등·3등)', rec: true, help: '어느 아이템에서 받았든 같은 칭호' },
        { v: '18종(아이템 6종 × 순위 3)', help: '아이템마다 다른 칭호. 이름 18개가 필요' },
      ],
    },
  ],
  s3: [
    {
      id: 'mname', label: '적립 단위의 이름',
      help: "'마일리지'는 이미 결제 마일리지(상점 포인트 탭)가 쓰는 말이라 같은 이름을 쓰면 헷갈립니다.",
      options: [{ v: '송편', rec: true, help: '강화에 성공하면 송편을 빚는다' }, { v: '달빛' }],
      free: '다른 이름',
    },
    {
      id: 'mrule', label: '무엇을 세나',
      help: '강화는 낮은 단계에서 성공과 하락을 되풀이할 수 있어, 성공 횟수를 그대로 세면 싸게 쌓입니다.',
      options: [
        { v: '추석 아이템 6종에서 처음 도달한 단계만(한 단계에 1)', rec: true, help: '되풀이로 늘릴 수 없고, 6종을 고루 키울수록 많이 쌓임' },
        { v: '추석 아이템 6종의 강화 성공 횟수', help: '낮은 단계 되풀이로 쌓을 수 있음' },
        { v: '모든 장비의 강화 성공 횟수', help: '추석 아이템이 없어도 참여. 되풀이 위험이 가장 큼' },
      ],
    },
    {
      id: 'mclaim', label: '보상을 받는 방식',
      options: [{ v: '이벤트 화면에서 단계마다 직접 받기', rec: true }, { v: '단계에 닿으면 우편으로 자동 발송' }],
    },
  ],
  s4: [
    {
      id: 'supply', label: '한가위 보급 기간과 수량',
      options: [
        { v: '9/24 ~ 9/27 매일 1통 📦9(부위별 3)', rec: true },
        { v: '추석 당일(9/25) 1통만 크게' },
      ],
      free: '다른 안',
    },
    {
      id: 'overlap', label: '정오·저녁 보급과의 관계',
      help: '정오 📦30, 저녁 💎300 예약 우편이 10/6까지 매일 나가도록 이미 걸려 있습니다.',
      options: [{ v: '그대로 두고 한가위 보급을 따로 얹는다', rec: true }, { v: '그 기간의 정시 보급을 한가위 보급으로 바꾼다' }],
    },
  ],
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const slotHtml = (s: Slot) => {
  if (s.fixed) {
    return `<div class="slot done"><div class="slot-h"><span class="set">${s.set}</span> ${s.slot}<span class="chip ok">확정</span></div>
      <figure class="pick one"><img src="${img(s.fixed.key)}" alt="${esc(s.fixed.name)}" width="256" height="256"><figcaption><b>${esc(s.fixed.name)}</b></figcaption></figure></div>`;
  }
  const opts = (s.options ?? [])
    .map(
      (o, i) => `<label class="pick"><input type="radio" name="slot_${s.id}" id="slot_${s.id}_${i}" value="${esc(o.name)} (${o.key})">
        <img src="${img(o.key)}" alt="${esc(o.name)}" width="256" height="256"><span class="cap"><b>${esc(o.name)}</b><small>${esc(o.note)}</small></span></label>`,
    )
    .join('');
  return `<div class="slot" data-slot="${s.id}" data-label="${s.set} ${s.slot}"><div class="slot-h"><span class="set">${s.set}</span> ${s.slot}<span class="chip todo">고르기</span></div>
    <div class="picks">${opts}</div>
    <label class="redo"><input type="radio" name="slot_${s.id}" id="slot_${s.id}_redo" value="__redo__"> 마음에 드는 것이 없음, 다시 만들기</label>
    <input type="text" class="why" id="why_${s.id}" placeholder="아쉬운 점이나 원하는 방향" aria-label="${s.set} ${s.slot} 다시 만들 방향"></div>`;
};

const decHtml = (d: Decision) => {
  const opts = d.options
    .map(
      (o, i) => `<label class="opt${o.rec ? ' rec' : ''}"><input type="radio" name="dec_${d.id}" id="dec_${d.id}_${i}" value="${esc(o.v)}"${o.rec ? ' data-rec="1"' : ''}>
        <span><b>${esc(o.v)}</b>${o.rec ? '<em>추천</em>' : ''}${o.help ? `<small>${esc(o.help)}</small>` : ''}</span></label>`,
    )
    .join('');
  const free = d.free
    ? `<label class="opt free"><input type="radio" name="dec_${d.id}" id="dec_${d.id}_free" value="__free__"><span><b>${esc(d.free)}</b></span></label>
       <input type="text" class="why" id="free_${d.id}" placeholder="직접 입력" aria-label="${esc(d.label)} 직접 입력">`
    : '';
  return `<fieldset class="dec" data-dec="${d.id}" data-label="${esc(d.label)}"><legend>${esc(d.label)}</legend>${d.help ? `<p class="help">${esc(d.help)}</p>` : ''}${opts}${free}</fieldset>`;
};

const html = `<title>한가위 업데이트 계획</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&family=Noto+Sans+KR:wght@400;500;700&display=swap">
<style>
:root{
  --bg:#f4f6f8; --surface:#ffffff; --ink:#1b2437; --muted:#5b6578; --line:#d9dee7;
  --jade:#1f6f5c; --jade-soft:#e3f1ec; --moon:#b9860f; --moon-soft:#fbf1d4; --warn:#a4481b; --warn-soft:#fbe9df;
  --sprite:#eef1f6;
}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){
    --bg:#10151f; --surface:#182131; --ink:#e6eaf2; --muted:#9aa5b8; --line:#2b364a;
    --jade:#5cc2a6; --jade-soft:#17332d; --moon:#f0c75e; --moon-soft:#3a3016; --warn:#f0a078; --warn-soft:#3b2318;
    --sprite:#222d40;
  }
}
:root[data-theme="dark"]{
  --bg:#10151f; --surface:#182131; --ink:#e6eaf2; --muted:#9aa5b8; --line:#2b364a;
  --jade:#5cc2a6; --jade-soft:#17332d; --moon:#f0c75e; --moon-soft:#3a3016; --warn:#f0a078; --warn-soft:#3b2318;
  --sprite:#222d40;
}
*{box-sizing:border-box}
body{background:var(--bg);color:var(--ink);font-family:'Noto Sans KR',system-ui,-apple-system,'Apple SD Gothic Neo',sans-serif;font-size:15px;line-height:1.65;word-break:keep-all;overflow-wrap:anywhere}
.wrap{max-width:860px;margin:0 auto;padding-inline:18px;padding-block:28px 56px;display:flex;flex-direction:column;gap:22px}
h1,h2{font-family:'Gowun Batang','Noto Serif KR',serif;text-wrap:balance;margin:0}
h1{font-size:30px;letter-spacing:-.01em}
h2{font-size:21px;display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
h2 .no{color:var(--moon);font-weight:700}
.lead{margin:6px 0 0;color:var(--muted);max-width:62ch}
.time{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.time li{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:2px}
.time b{font-variant-numeric:tabular-nums;color:var(--jade)}
.time small{color:var(--muted);font-size:12.5px;line-height:1.5}
.time li.key{border-color:var(--moon);background:var(--moon-soft)}
.time li.key b{color:var(--moon)}
section{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:20px;display:flex;flex-direction:column;gap:14px}
.chip{font:700 11.5px/1 'Noto Sans KR',sans-serif;padding:5px 8px;border-radius:999px;margin-left:auto;white-space:nowrap}
.chip.ok{background:var(--jade-soft);color:var(--jade)}
.chip.todo{background:var(--moon-soft);color:var(--moon)}
.chip.new{background:var(--warn-soft);color:var(--warn)}
h2 .chip{margin-left:0}
.fixed{margin:0;padding-left:18px;display:flex;flex-direction:column;gap:4px}
.fixed li::marker{color:var(--jade)}
.sub{font-weight:700;font-size:13px;letter-spacing:.04em;color:var(--muted);margin:4px 0 -4px}
.slots{display:grid;gap:12px}
.slots.done-row{grid-template-columns:repeat(auto-fit,minmax(200px,1fr))}
.slots.todo-col{grid-template-columns:1fr}
.slot{border:1px solid var(--line);border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:10px;background:var(--bg)}
.slot-h{display:flex;align-items:center;gap:6px;font-weight:700}
.slot-h .set{color:var(--muted);font-weight:500}
.picks{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.pick{display:flex;flex-direction:column;gap:6px;margin:0;border:2px solid transparent;border-radius:10px;padding:6px;cursor:pointer;background:var(--surface)}
.pick.one{cursor:default;align-items:center;flex-direction:row;gap:12px}
.pick.one img{width:72px}
.pick img{width:100%;height:auto;aspect-ratio:1;image-rendering:pixelated;background:var(--sprite);border-radius:8px;max-width:100%}
.pick input{position:absolute;opacity:0;pointer-events:none}
.pick:has(input:checked){border-color:var(--jade);background:var(--jade-soft)}
.pick:has(input:focus-visible){outline:2px solid var(--moon);outline-offset:2px}
.cap{display:flex;flex-direction:column;gap:2px;font-size:14px;line-height:1.45}
.cap small{color:var(--muted);font-size:12.5px}
@media (max-width:520px){.cap{font-size:12.5px}.cap small{font-size:11.5px}}
.redo{display:flex;gap:8px;align-items:center;font-size:13px;color:var(--muted);cursor:pointer}
.why{width:100%;border:1px solid var(--line);border-radius:8px;padding:8px 10px;font:inherit;font-size:13.5px;background:var(--surface);color:var(--ink)}
.why:focus-visible,button:focus-visible,.opt input:focus-visible{outline:2px solid var(--moon);outline-offset:2px}
.dec{border:0;border-top:1px solid var(--line);margin:0;padding:14px 0 0;display:flex;flex-direction:column;gap:8px;min-width:0}
.dec legend{font-weight:700;padding:0;float:left;width:100%;margin-bottom:2px}
.dec legend + *{clear:both}
.help{margin:0;color:var(--muted);font-size:13.5px;max-width:64ch}
.opt{display:flex;gap:10px;align-items:flex-start;border:1px solid var(--line);border-radius:10px;padding:10px 12px;cursor:pointer;background:var(--bg)}
.opt:has(input:checked){border-color:var(--jade);background:var(--jade-soft)}
.opt input{margin-top:5px;accent-color:var(--jade)}
.opt span{display:flex;flex-direction:column;gap:2px;min-width:0}
.opt b{font-weight:500}
.opt em{font-style:normal;font-weight:700;font-size:11.5px;color:var(--moon)}
.opt small{color:var(--muted);font-size:12.5px;line-height:1.5}
.note{background:var(--warn-soft);color:var(--ink);border-radius:10px;padding:11px 13px;font-size:14px;margin:0}
.note b{color:var(--warn)}
table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums;font-size:14px}
th,td{text-align:right;padding:7px 8px;border-bottom:1px solid var(--line)}
.redo-t td,.redo-t th{text-align:left}
.redo-t td:first-child{white-space:nowrap;font-weight:700}
a{color:var(--jade)}
th:first-child,td:first-child{text-align:left}
th{color:var(--muted);font-weight:500;font-size:12.5px}
.scroll{overflow-x:auto}
.result{display:flex;flex-direction:column;gap:10px}
textarea{width:100%;min-height:210px;border:1px solid var(--line);border-radius:10px;padding:12px;font:13px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;background:var(--bg);color:var(--ink);resize:vertical}
.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
button{font:700 14px/1 'Noto Sans KR',sans-serif;border-radius:10px;padding:11px 14px;border:1px solid var(--line);background:var(--surface);color:var(--ink);cursor:pointer}
button.primary{background:var(--jade);border-color:var(--jade);color:#fff}
:root[data-theme="dark"] button.primary{color:#0d1a16}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]) button.primary{color:#0d1a16}}
#toast{font-size:13px;color:var(--jade);min-height:1em}
@media (max-width:520px){h1{font-size:25px}.picks{grid-template-columns:repeat(3,1fr)}section{padding:16px}}
@media (prefers-reduced-motion:no-preference){.pick,.opt{transition:border-color .12s,background-color .12s}}
</style>
<div class="wrap">
  <header>
    <h1>한가위 업데이트 계획</h1>
    <p class="lead">추석 업데이트를 네 가지로 묶었습니다. 항목마다 이미 정해진 것과 아직 정할 것을 나눠 적었습니다. 2번부터 4번까지 고른 내용은 맨 아래에 한 덩어리로 모이니 복사해서 채팅에 붙여 주세요. 아이템 그림은 선택 폼에서 고릅니다.</p>
  </header>

  <ol class="time" aria-label="일정">
    <li><b>9/22 (화) 오전</b>소규모 업데이트 10 배포<small>2서버 준비분. 추석과 별개</small></li>
    <li class="key"><b>9/23 (수) 10:00 전</b>확률 변경 공지<small>아이템 추가는 뽑기 확률이 바뀌는 일이라 열기 24시간 전에 알려야 합니다. 코드는 그 전에 배포</small></li>
    <li><b>9/24 (목) 10:00</b>아이템 6종 열기, 대회 시작<small>연휴 9/24 ~ 9/27</small></li>
    <li><b>9/25 (금)</b>추석</li>
    <li><b>종료 다음 날</b>순위 확정 뒤 수동 정산<small>어드민에서 확인하고 지급</small></li>
  </ol>

  <section id="s1">
    <h2><span class="no">1</span>추석 아이템 6종 추가 <span class="chip todo">4부위 고르기</span></h2>
    <ul class="fixed">
      <li>한복 세트와 달토끼 세트, 부위마다 1종씩 모두 6종. 기간 한정이 아닌 일반 아이템입니다.</li>
      <li>6부위 중 2부위를 확정했습니다. 나머지 4부위는 주신 방향대로 새 그림을 3장씩 만들어 선택 폼 맨 앞에 넣습니다.</li>
      <li>그림이 정해지면 이름과 설명글, 지역(추천은 '일반')을 시안으로 드린 뒤 카탈로그에 넣습니다.</li>
    </ul>
    <p class="sub">확정한 2부위</p>
    <div class="slots done-row">${SLOTS.map(slotHtml).join('')}</div>
    <p class="sub">다시 만드는 4부위</p>
    <div class="scroll"><table class="redo-t">
      <thead><tr><th>부위</th><th>주신 방향</th></tr></thead>
      <tbody>${REDO.map((r) => `<tr><td>${esc(r.label)}</td><td>${esc(r.dir)}</td></tr>`).join('')}</tbody>
    </table></div>
    <p class="help">그림은 <a href="${PICK_URL}" target="_blank" rel="noopener">추석 세트 선택 폼</a>에서 고릅니다. 새 그림이 들어가면 그 폼의 해당 부위 맨 앞에 '새 그림'으로 표시됩니다.</p>
  </section>

  <section id="s2">
    <h2><span class="no">2</span>6종 강화 순위 보상 <span class="chip ok">보상 확정</span></h2>
    <ul class="fixed">
      <li>추석 아이템 6종 각각에서 가장 높이 강화한 1·2·3등에게 보상. 서버별로 따로 집계합니다.</li>
      <li>순위는 강화 단계가 높은 순, 같으면 먼저 도달한 사람. 한 사람이 여러 아이템에서 받을 수 있습니다.</li>
      <li>홈 배너로 들어가는 실시간 현황판, 순위 칭호 지급.</li>
    </ul>
    <div class="scroll"><table>
      <thead><tr><th>아이템마다</th><th>다이아</th><th>상자</th></tr></thead>
      <tbody><tr><td>1등</td><td>💎 30,000</td><td>📦 900</td></tr><tr><td>2등</td><td>💎 20,000</td><td>📦 600</td></tr><tr><td>3등</td><td>💎 10,000</td><td>📦 300</td></tr>
      <tr><td>6종 합계(서버당)</td><td>💎 360,000</td><td>📦 10,800</td></tr></tbody>
    </table></div>
    ${DECISIONS.s2!.map(decHtml).join('')}
  </section>

  <section id="s3">
    <h2><span class="no">3</span>강화 성공을 쌓아 보상 받기 <span class="chip new">새 항목</span></h2>
    <ul class="fixed">
      <li>순위에 들지 못해도 강화한 만큼 보상을 받는 장치입니다. 앞선 시안의 '참가 보상' 자리를 대신합니다.</li>
      <li>서버별로 따로 쌓입니다.</li>
    </ul>
    <p class="note"><b>보상 단계의 수치는 아직 없습니다.</b> 아래에서 세는 기준을 정해 주시면, 그 기준으로 하루에 쌓이는 양을 계산해 단계와 보상 수치를 시안으로 따로 드립니다.</p>
    ${DECISIONS.s3!.map(decHtml).join('')}
  </section>

  <section id="s4">
    <h2><span class="no">4</span>추석 기간 푸시와 우편 보상 <span class="chip todo">수량 정하기</span></h2>
    <ul class="fixed">
      <li>연휴 동안 접속한 사람에게 우편으로 보급을 보내고 푸시로 알립니다. 발송은 운영자가 합니다.</li>
    </ul>
    ${DECISIONS.s4!.map(decHtml).join('')}
  </section>

  <section class="result" aria-labelledby="rh">
    <h2 id="rh">고른 내용</h2>
    <div class="row"><button type="button" id="fill">추천대로 채우기</button><button type="button" class="primary" id="copy">복사하기</button><span id="toast" role="status"></span></div>
    <textarea id="out" readonly aria-label="고른 내용 요약"></textarea>
  </section>
</div>
<script>
(function(){
  var KEY='chuseok-plan-v1';
  function q(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s));}
  function save(){
    try{
      var st={};
      q('input[type=radio]:checked').forEach(function(i){st[i.name]=i.id;});
      q('input.why').forEach(function(i){if(i.value)st[i.id]=i.value;});
      localStorage.setItem(KEY,JSON.stringify(st));
    }catch(e){}
  }
  function load(){
    try{
      var st=JSON.parse(localStorage.getItem(KEY)||'{}');
      Object.keys(st).forEach(function(k){
        var el=document.getElementById(k.indexOf('why_')===0||k.indexOf('free_')===0?k:st[k]);
        if(!el)return;
        if(el.type==='radio')el.checked=true;else el.value=st[k];
      });
    }catch(e){}
  }
  function build(){
    var lines=['[한가위 업데이트 결정]'];
    var heads={period:'■ 2. 강화 순위 보상',mname:'■ 3. 강화 성공 적립',supply:'■ 4. 푸시와 우편 보상'};
    q('.dec').forEach(function(d){
      var id=d.getAttribute('data-dec');
      if(heads[id])lines.push(heads[id]);
      var c=d.querySelector('input[type=radio]:checked');
      var free=d.querySelector('.why');
      var v=!c?'(미선택)':c.value==='__free__'?(free&&free.value.trim()?free.value.trim():'(직접 입력 비어 있음)'):c.value;
      lines.push(d.getAttribute('data-label')+': '+v);
    });
    document.getElementById('out').value=lines.join('\\n');
  }
  document.addEventListener('change',function(){build();save();});
  document.addEventListener('input',function(e){
    if(e.target&&e.target.classList&&e.target.classList.contains('why')){
      var id=e.target.id, r=null;
      if(id.indexOf('why_')===0)r=document.getElementById('slot_'+id.slice(4)+'_redo');
      if(id.indexOf('free_')===0)r=document.getElementById('dec_'+id.slice(5)+'_free');
      if(r&&e.target.value)r.checked=true;
      build();save();
    }
  });
  document.getElementById('fill').addEventListener('click',function(){
    q('input[data-rec]').forEach(function(i){
      if(!document.querySelector('input[name="'+i.name+'"]:checked'))i.checked=true;
    });
    build();save();
    document.getElementById('toast').textContent='비어 있던 결정만 추천으로 채웠습니다.';
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
