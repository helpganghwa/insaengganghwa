/**
 * 송편 도달 사다리·교환 비율 논의 아티팩트(09-22 밤). 실서버 7일 세금식 분포(scripts/chuseok-mileage-dist.json의 level)로
 * 사다리 A/B, 교환 비율·한도별 총지급을 계산해 패키지 3안으로 제시한다. 상자 1개 = 💎25(lib/game/balance.ts 기준)로 환산.
 *   실행: bun run scripts/build-chuseok-ladder-talk.ts <out.html>
 */
import { readFileSync, writeFileSync } from 'node:fs';

const OUT = process.argv[2];
if (!OUT) throw new Error('출력 경로가 필요합니다');
const DIST: Record<string, number[]> = JSON.parse(readFileSync('scripts/chuseok-mileage-dist.json', 'utf8'));
const d = [...DIST.level!].sort((a, b) => a - b);
const N = d.length;
const BOX = 25; // 💎 환산
const n = (v: number) => v.toLocaleString('ko-KR');
const pct = (p: number) => d[Math.min(N - 1, Math.floor(p * N))]!;
const eq = (dia: number, box: number) => dia + box * BOX;

type Step = [number, number, number]; // 송편, 💎, 📦
const LADDER_A: Step[] = [[100, 100, 3], [300, 150, 4], [800, 200, 6], [2000, 300, 8], [5000, 400, 12], [12000, 600, 16], [30000, 800, 21]];
const LADDER_B: Step[] = LADDER_A.map(([m, dd, bb]) => [m, dd / 2, bb]);
const ladderTotal = (steps: Step[]) => {
  let dia = 0, box = 0;
  const rows = steps.map(([m, dd, bb]) => { const r = d.filter((v) => v >= m).length; dia += r * dd; box += r * bb; return { m, dd, bb, r }; });
  return { dia, box, rows };
};
const ladderFor = (steps: Step[], v: number) => steps.filter(([m]) => v >= m).reduce((a, [, dd, bb]) => ({ dia: a.dia + dd, box: a.box + bb }), { dia: 0, box: 0 });

type Ex = { rateDia: number; rateBox: number; cap: number }; // 💎100 = rateDia 송편, 📦3 = rateBox 송편
const exTotal = (ex: Ex, first: 'dia' | 'box') => {
  let dia = 0, box = 0;
  for (const v of d) {
    let s = v;
    const buyDia = () => { const k = Math.min(ex.cap, Math.floor(s / ex.rateDia)); dia += k * 100; s -= k * ex.rateDia; };
    const buyBox = () => { const k = Math.min(ex.cap, Math.floor(s / ex.rateBox)); box += k * 3; s -= k * ex.rateBox; };
    if (first === 'dia') { buyDia(); buyBox(); } else { buyBox(); buyDia(); }
  }
  return { dia, box };
};
const exFor = (ex: Ex, v: number) => ({ maxDia: Math.min(ex.cap, Math.floor(v / ex.rateDia)) * 100, maxBox: Math.min(ex.cap, Math.floor(v / ex.rateBox)) * 3 });

const PAR: Ex = { rateDia: 400, rateBox: 300, cap: 10 };
const PAR20: Ex = { ...PAR, cap: 20 };
const PAR5: Ex = { ...PAR, cap: 5 };
const CHEAP: Ex = { rateDia: 400, rateBox: 150, cap: 20 };
const CHEAP10: Ex = { ...CHEAP, cap: 10 };

const RANK = { dia: 510000, box: 9180 };

const A = ladderTotal(LADDER_A), B = ladderTotal(LADDER_B);
const PKG = [
  { key: 'P1', name: '패키지 1 · 사다리 B + 교환 등가 · 각 10회', rec: true, ladder: B, lsteps: LADDER_B, ex: PAR, note: '사다리는 다이아 절반, 교환은 상자 1개 = 💎25 등가(📦3 = 300송편 · 💎100 = 400송편), 1인 각 10회' },
  { key: 'P2', name: '패키지 2 · 사다리 B + 교환 상자 우대 · 각 20회 (원안)', rec: false, ladder: B, lsteps: LADDER_B, ex: CHEAP, note: '📦3 = 150송편이면 상자 1개가 💎12.5 꼴이라 전부 상자로 몰림. 상자 재고가 이미 느는 중이라 권하지 않음' },
  { key: 'P3', name: '패키지 3 · 사다리 A + 교환 등가 · 각 5회', rec: false, ladder: A, lsteps: LADDER_A, ex: PAR5, note: '도달 보상을 크게, 교환은 맛보기만' },
].map((p) => {
  const e1 = exTotal(p.ex, 'dia'), e2 = exTotal(p.ex, 'box');
  const exDia = Math.max(e1.dia, e2.dia), exBox = Math.max(e1.box, e2.box); // 상한(각 방향 최대)
  const total = eq(p.ladder.dia, p.ladder.box) + Math.max(eq(e1.dia, e1.box), eq(e2.dia, e2.box));
  return { ...p, e1, e2, exDia, exBox, total, share: total / eq(RANK.dia, RANK.box) };
});

const PROFILES = [
  { name: '중앙값 유저', v: pct(0.5) },
  { name: '상위 25%', v: pct(0.75) },
  { name: '상위 10%', v: pct(0.9) },
  { name: '상위 1%', v: pct(0.99) },
];

const ladderTable = (title: string, t: ReturnType<typeof ladderTotal>) => `
<table><caption>${title}</caption><thead><tr><th>도달 송편</th><th>보상</th><th>도달 인원(7일)</th><th>누적 보상</th></tr></thead><tbody>
${t.rows.map((r, i) => { const cum = t.rows.slice(0, i + 1).reduce((a, x) => ({ dia: a.dia + x.dd, box: a.box + x.bb }), { dia: 0, box: 0 }); return `<tr><td class="n">${n(r.m)}</td><td>💎${n(r.dd)} · 📦${r.bb}</td><td class="n">${r.r}명 (${Math.round((100 * r.r) / N)}%)</td><td>💎${n(cum.dia)} · 📦${cum.box}</td></tr>`; }).join('')}
<tr class="sum"><td colspan="2">총 지급 추정</td><td colspan="2">💎${n(t.dia)} · 📦${n(t.box)} (💎환산 ${n(eq(t.dia, t.box))})</td></tr>
</tbody></table>`;

const exRow = (name: string, ex: Ex) => { const e1 = exTotal(ex, 'dia'), e2 = exTotal(ex, 'box'); return `<tr><td>${name}</td><td>📦3 = ${n(ex.rateBox)} · 💎100 = ${n(ex.rateDia)}</td><td class="n">${ex.cap}회</td><td>💎${n(e1.dia)} · 📦${n(e1.box)}</td><td>💎${n(e2.dia)} · 📦${n(e2.box)}</td><td class="n">${n(Math.max(eq(e1.dia, e1.box), eq(e2.dia, e2.box)))}</td></tr>`; };

const html = `<title>송편 사다리·교환 논의</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&family=Noto+Serif+KR:wght@700&display=swap">
<style>
:root{--bg:#f6f1e6;--paper:#fffdf8;--ink:#1f1b16;--ink2:#5c554b;--line:#e2d9c6;--line2:#cdc2a8;--navy:#22305a;--gold:#b8892b;--gold2:#e9c66a;--red:#b8323a;--sel:#fff6dc;--sel-line:#b8892b;--blue:#2b5aa6}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#15182a;--paper:#1d2136;--ink:#f1ecdf;--ink2:#b6ae9c;--line:#33395a;--line2:#4a5178;--navy:#9fb4ff;--gold:#e9c66a;--gold2:#f3d98f;--red:#ff8a90;--sel:#33301e;--sel-line:#e9c66a;--blue:#8fb2ff}}
:root[data-theme="dark"]{--bg:#15182a;--paper:#1d2136;--ink:#f1ecdf;--ink2:#b6ae9c;--line:#33395a;--line2:#4a5178;--navy:#9fb4ff;--gold:#e9c66a;--gold2:#f3d98f;--red:#ff8a90;--sel:#33301e;--sel-line:#e9c66a;--blue:#8fb2ff}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:"Noto Sans KR",system-ui,sans-serif;font-size:14px;line-height:1.6;word-break:keep-all;overflow-wrap:anywhere}
.wrap{max-width:760px;margin:0 auto;padding-inline:16px;padding-block:20px 120px}
h1{font-family:"Noto Serif KR",serif;font-size:24px;margin:0 0 4px;color:var(--navy)}
.asof{color:var(--ink2);font-size:13px;margin:0 0 14px}
h2{font-size:17px;margin:30px 0 8px;padding-bottom:6px;border-bottom:2px solid var(--gold)}
p{margin:6px 0}
.card{background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:12px 14px;margin:10px 0}
.card h3{margin:0 0 6px;font-size:15px}
.rec{font-size:11px;color:var(--gold);font-weight:700;margin-left:6px}
.tw{overflow-x:auto}
table{border-collapse:collapse;width:100%;font-size:13px;margin:6px 0;background:var(--paper)}
caption{text-align:left;font-weight:700;padding:4px 0;font-size:13px}
td,th{border-bottom:1px solid var(--line);padding:5px 6px;text-align:left;vertical-align:top;white-space:nowrap}
th{color:var(--ink2);font-weight:500;font-size:12px}
td.n{text-align:right;font-variant-numeric:tabular-nums}
tr.sum td{font-weight:700;background:var(--sel)}
.kv{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px;margin:8px 0}
.kv div{background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:8px 10px}
.kv b{display:block;font-size:12px;color:var(--ink2);font-weight:500}
.kv span{font-size:15px;font-weight:700;color:var(--navy);font-variant-numeric:tabular-nums}
.q{background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:12px 14px;margin:10px 0}
.q h3{margin:0 0 4px;font-size:15px}
.q .why{color:var(--ink2);font-size:13px;margin:0 0 8px}
.opts{display:flex;flex-direction:column;gap:6px}
.opt{display:flex;gap:10px;align-items:flex-start;border:1px solid var(--line);border-radius:9px;padding:8px 10px;cursor:pointer}
.opt:has(input:checked){background:var(--sel);border-color:var(--sel-line)}
.opt input{margin-top:4px;flex:0 0 auto}
.opt span{display:block;color:var(--ink2);font-size:13px}
.q input[type=text]{width:100%;margin-top:6px;border:1px solid var(--line2);border-radius:8px;padding:8px 10px;font:inherit;font-size:13px;background:var(--paper);color:var(--ink)}
.foot{position:fixed;left:0;right:0;bottom:0;background:var(--paper);border-top:1px solid var(--line);padding:10px 16px;padding-bottom:calc(10px + env(safe-area-inset-bottom,0px));display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap}
.foot .st{font-size:13px;color:var(--ink2)}
button.copy{background:var(--navy);color:#fff;border:0;border-radius:9px;padding:9px 16px;font:inherit;font-weight:700;cursor:pointer}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]) button.copy{color:#15182a}}
:root[data-theme="dark"] button.copy{color:#15182a}
button.copy:focus-visible,.opt:focus-within{outline:2px solid var(--gold);outline-offset:2px}
pre.sum{white-space:pre-wrap;background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:10px 12px;font-size:12px;margin:8px 0}
.warn{color:var(--red);font-weight:700}
</style>
<div class="wrap">
<h1>송편 사다리·교환 논의</h1>
<p class="asof">2026-09-22 밤 · 실서버 최근 7일(${N}명, 세금식 = 도달 단계가 곧 송편) · 상자 1개 = 💎${BOX} 환산</p>

<div class="card">
<p>도달 보상(사다리)은 <b>누적 총량</b> 기준이라 교환에 써도 줄지 않고, 교환은 <b>사용 가능 송편</b>을 씁니다. 그래서 두 보상은 따로 합쳐야 합니다. 아래 총액은 지난주 분포 그대로 7일치이며, 9/25 출시로 6일이 되면 약 8% 줄어듭니다.</p>
<div class="kv">
<div><b>중앙값</b><span>${n(pct(0.5))}</span></div><div><b>상위 25%</b><span>${n(pct(0.75))}</span></div><div><b>상위 10%</b><span>${n(pct(0.9))}</span></div><div><b>상위 1%</b><span>${n(pct(0.99))}</span></div><div><b>최대</b><span>${n(d[N - 1]!)}</span></div><div><b>100 미만</b><span>${d.filter((v) => v < 100).length}명</span></div>
</div>
<p>비교 기준: 순위 보상 6종 합계 💎${n(RANK.dia)} · 📦${n(RANK.box)} = 💎환산 <b>${n(eq(RANK.dia, RANK.box))}</b>.</p>
</div>

<h2>1. 도달 사다리</h2>
<div class="tw">${ladderTable('사다리 A · 원안(💎100~800 · 📦3~21)', A)}</div>
<div class="tw">${ladderTable('사다리 B · 다이아 절반(💎50~400 · 📦3~21)', B)}</div>
<p>마지막 30,000 단계는 7일에 ${A.rows[6]!.r}명(${Math.round((100 * A.rows[6]!.r) / N)}%)만 닿습니다. 6일이면 더 줄어 "끝까지 간 사람"의 자리로 두기 알맞습니다.</p>

<h2>2. 교환 비율과 1인 한도</h2>
<p>게임 안 상자 값은 💎25입니다. 원안 📦3 = 150송편은 상자 1개가 💎12.5 꼴이라 전부 상자로 몰리고, 상자 재고는 이미 느는 중입니다. 등가(📦3 = 300 · 💎100 = 400)를 권합니다. 총액은 "모두 다이아부터" / "모두 상자부터" 두 극단을 함께 적었습니다.</p>
<div class="tw"><table><thead><tr><th>안</th><th>비율</th><th>1인 한도(각)</th><th>다이아부터</th><th>상자부터</th><th>💎환산 최대</th></tr></thead><tbody>
${exRow('등가 · 5회', PAR5)}${exRow('등가 · 10회', PAR)}${exRow('등가 · 20회', PAR20)}${exRow('상자 우대 · 10회', CHEAP10)}${exRow('상자 우대 · 20회 (원안)', CHEAP)}
</tbody></table></div>

<h2>3. 패키지 비교</h2>
${PKG.map((p) => `<div class="card"><h3>${p.name}${p.rec ? '<span class="rec">권장</span>' : ''}</h3><p>${p.note}</p>
<div class="tw"><table><thead><tr><th></th><th>💎</th><th>📦</th><th>💎환산</th></tr></thead><tbody>
<tr><td>사다리</td><td class="n">${n(p.ladder.dia)}</td><td class="n">${n(p.ladder.box)}</td><td class="n">${n(eq(p.ladder.dia, p.ladder.box))}</td></tr>
<tr><td>교환(최대 방향)</td><td class="n">${n(p.exDia)}</td><td class="n">${n(p.exBox)}</td><td class="n">${n(Math.max(eq(p.e1.dia, p.e1.box), eq(p.e2.dia, p.e2.box)))}</td></tr>
<tr class="sum"><td>합계(💎환산)</td><td colspan="3">${n(p.total)} · 순위 보상의 ${Math.round(100 * p.share)}%</td></tr>
</tbody></table></div>
<div class="tw"><table><thead><tr><th>유저</th><th>7일 송편</th><th>사다리</th><th>교환 최대(💎 / 📦 한쪽만)</th></tr></thead><tbody>
${PROFILES.map((u) => { const l = ladderFor(p.lsteps, u.v); const e = exFor(p.ex, u.v); return `<tr><td>${u.name}</td><td class="n">${n(u.v)}</td><td>💎${n(l.dia)} · 📦${l.box}</td><td>💎${n(e.maxDia)} 또는 📦${e.maxBox}</td></tr>`; }).join('')}
</tbody></table></div></div>`).join('')}

<h2>4. 정할 것</h2>
<form id="f">
<div class="q"><h3>1. 도달 사다리</h3><p class="why">단계 7개(100/300/800/2,000/5,000/12,000/30,000)는 그대로 두고 보상만 고릅니다.</p>
<div class="opts">
<label class="opt"><input type="radio" name="q1" value="사다리 B(다이아 절반: 💎50/75/100/150/200/300/400 · 📦3/4/6/8/12/16/21)"><div><b>사다리 B · 다이아 절반<span class="rec">권장</span></b><span>💎50/75/100/150/200/300/400 · 📦3/4/6/8/12/16/21, 총 💎${n(B.dia)} · 📦${n(B.box)}</span></div></label>
<label class="opt"><input type="radio" name="q1" value="사다리 A(원안: 💎100/150/200/300/400/600/800 · 📦3/4/6/8/12/16/21)"><div><b>사다리 A · 원안</b><span>총 💎${n(A.dia)} · 📦${n(A.box)}</span></div></label>
<label class="opt"><input type="radio" name="q1" value="직접 조정"><div><b>직접 조정</b><span>아래에 단계별 수치</span></div></label>
</div><input type="text" name="q1_note" placeholder="메모 또는 직접 수치"></div>

<div class="q"><h3>2. 교환 비율</h3>
<div class="opts">
<label class="opt"><input type="radio" name="q2" value="등가: 📦3 = 300송편 · 💎100 = 400송편"><div><b>등가 · 📦3 = 300 · 💎100 = 400<span class="rec">권장</span></b><span>상자 1개 = 💎25와 같은 값</span></div></label>
<label class="opt"><input type="radio" name="q2" value="상자 우대: 📦3 = 150송편 · 💎100 = 400송편"><div><b>상자 우대 · 📦3 = 150 · 💎100 = 400 (원안)</b><span>상자 쪽이 두 배 싸서 다이아 교환은 거의 안 쓰임</span></div></label>
<label class="opt"><input type="radio" name="q2" value="직접 조정"><div><b>직접 조정</b></div></label>
</div><input type="text" name="q2_note" placeholder="메모 또는 직접 수치"></div>

<div class="q"><h3>3. 1인 교환 한도(상품별)</h3>
<div class="opts">
<label class="opt"><input type="radio" name="q3" value="각 10회"><div><b>각 10회<span class="rec">권장</span></b><span>최대 💎1,000 · 📦30. 상위 10%가 둘 다 채움</span></div></label>
<label class="opt"><input type="radio" name="q3" value="각 20회"><div><b>각 20회</b><span>최대 💎2,000 · 📦60</span></div></label>
<label class="opt"><input type="radio" name="q3" value="각 5회"><div><b>각 5회</b><span>최대 💎500 · 📦15</span></div></label>
<label class="opt"><input type="radio" name="q3" value="한도 없음"><div><b>한도 없음</b><span class="warn">상위 1%가 혼자 💎10,000 넘게 가져감</span></div></label>
</div><input type="text" name="q3_note" placeholder="메모"></div>

<div class="q"><h3>4. 교환 마감 뒤 남은 송편</h3>
<div class="opts">
<label class="opt"><input type="radio" name="q4" value="10/3 23:59 지나면 소멸(안내 문구 표시)"><div><b>10/3 23:59 지나면 소멸<span class="rec">권장</span></b><span>화면과 우편에 미리 안내</span></div></label>
<label class="opt"><input type="radio" name="q4" value="다음 이벤트로 이월"><div><b>다음 이벤트로 이월</b><span>테이블을 이벤트 무관하게 남겨야 함</span></div></label>
</div><input type="text" name="q4_note" placeholder="메모"></div>
</form>

<h2>요약</h2>
<pre class="sum" id="sum"></pre>
</div>
<div class="foot"><div class="st"><b id="cnt">0</b> / 4 항목 응답</div><button class="copy" id="copy" type="button">요약 복사</button></div>
<script>
(function(){
  var KEY='chuseok-ladder-talk-v1';var f=document.getElementById('f');
  var names=['q1','q2','q3','q4'];var labels={q1:'1. 도달 사다리',q2:'2. 교환 비율',q3:'3. 1인 한도',q4:'4. 남은 송편'};
  function val(n){var el=f.querySelector('input[name="'+n+'"]:checked');return el?el.value:null}
  function note(n){var el=f.querySelector('input[name="'+n+'_note"]');return el?el.value.trim():''}
  function build(){var lines=['[송편 사다리·교환 결정]'];var c=0;names.forEach(function(n){var v=val(n);if(v)c++;var l=labels[n]+': '+(v||'미정');var t=note(n);if(t)l+=' / 메모: '+t;lines.push(l)});document.getElementById('cnt').textContent=c;document.getElementById('sum').textContent=lines.join('\\n');return lines.join('\\n')}
  function persist(){try{var o={};names.forEach(function(n){o[n]=val(n);o[n+'_note']=note(n)});localStorage.setItem(KEY,JSON.stringify(o))}catch(e){}}
  function restore(){try{var o=JSON.parse(localStorage.getItem(KEY)||'null');if(!o)return;names.forEach(function(n){if(o[n]){var el=f.querySelector('input[name="'+n+'"][value="'+CSS.escape(o[n])+'"]');if(el)el.checked=true}var t=f.querySelector('input[name="'+n+'_note"]');if(t&&o[n+'_note'])t.value=o[n+'_note']})}catch(e){}}
  f.addEventListener('change',function(){build();persist()});f.addEventListener('input',function(){build();persist()});
  document.getElementById('copy').addEventListener('click',function(){var t=build();var b=this;function done(ok){b.textContent=ok?'복사됨':'복사 실패';setTimeout(function(){b.textContent='요약 복사'},1800)}if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t).then(function(){done(true)},function(){done(false)})}else done(false)});
  restore();build();
})();
</script>
`;
writeFileSync(OUT, html);
console.log(`wrote ${OUT} (${Math.round(html.length / 1024)} KB)`);
