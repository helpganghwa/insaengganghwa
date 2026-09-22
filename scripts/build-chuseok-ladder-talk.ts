/**
 * 송편 도달 사다리·교환 비율 논의 아티팩트(09-22 밤) — 수치를 직접 입력하면 실서버 7일 세금식 분포(scripts/chuseok-mileage-dist.json의
 * level, 익명 357명)로 도달 인원·총지급·유저 예시가 바로 다시 계산된다. 상자 1개 = 💎25(lib/game/balance.ts 기준)로 환산.
 *   실행: bun run scripts/build-chuseok-ladder-talk.ts <out.html>
 */
import { readFileSync, writeFileSync } from 'node:fs';

const OUT = process.argv[2];
if (!OUT) throw new Error('출력 경로가 필요합니다');
const DIST: Record<string, number[]> = JSON.parse(readFileSync('scripts/chuseok-mileage-dist.json', 'utf8'));
const d = [...DIST.level!].sort((a, b) => a - b);
const N = d.length;
const n = (v: number) => v.toLocaleString('ko-KR');
const pct = (p: number) => d[Math.min(N - 1, Math.floor(p * N))]!;

const LADDER_A = [[100, 100, 3], [300, 150, 4], [800, 200, 6], [2000, 300, 8], [5000, 400, 12], [12000, 600, 16], [30000, 800, 21]];
const LADDER_B = LADDER_A.map(([m, dd, bb]) => [m, dd! / 2, bb]);
// 사용자 방향(09-22 밤): "이벤트니까 사다리는 후하게, 교환은 한도 없이 후하지 않게" → A+ 사다리와 비싼 교환 비율을 기본값으로.
const LADDER_AP = [[100, 150, 3], [300, 200, 6], [800, 300, 9], [2000, 400, 12], [5000, 500, 15], [12000, 700, 21], [30000, 1000, 30]];
const RANK = { dia: 510000, box: 9180 };

const html = `<title>송편 사다리·교환 계산기</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&family=Noto+Serif+KR:wght@700&display=swap">
<style>
:root{--bg:#f6f1e6;--paper:#fffdf8;--ink:#1f1b16;--ink2:#5c554b;--line:#e2d9c6;--line2:#cdc2a8;--navy:#22305a;--gold:#b8892b;--gold2:#e9c66a;--red:#b8323a;--sel:#fff6dc;--sel-line:#b8892b;--blue:#2b5aa6}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#15182a;--paper:#1d2136;--ink:#f1ecdf;--ink2:#b6ae9c;--line:#33395a;--line2:#4a5178;--navy:#9fb4ff;--gold:#e9c66a;--gold2:#f3d98f;--red:#ff8a90;--sel:#33301e;--sel-line:#e9c66a;--blue:#8fb2ff}}
:root[data-theme="dark"]{--bg:#15182a;--paper:#1d2136;--ink:#f1ecdf;--ink2:#b6ae9c;--line:#33395a;--line2:#4a5178;--navy:#9fb4ff;--gold:#e9c66a;--gold2:#f3d98f;--red:#ff8a90;--sel:#33301e;--sel-line:#e9c66a;--blue:#8fb2ff}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:"Noto Sans KR",system-ui,sans-serif;font-size:14px;line-height:1.6;word-break:keep-all;overflow-wrap:anywhere}
.wrap{max-width:760px;margin:0 auto;padding-inline:16px;padding-block:20px 130px}
h1{font-family:"Noto Serif KR",serif;font-size:24px;margin:0 0 4px;color:var(--navy)}
.asof{color:var(--ink2);font-size:13px;margin:0 0 14px}
h2{font-size:17px;margin:30px 0 8px;padding-bottom:6px;border-bottom:2px solid var(--gold);display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
h2 small{font-weight:400;color:var(--ink2);font-size:12px}
p{margin:6px 0}
.card{background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:12px 14px;margin:10px 0}
.tw{overflow-x:auto}
table{border-collapse:collapse;width:100%;font-size:13px;margin:6px 0;background:var(--paper)}
td,th{border-bottom:1px solid var(--line);padding:5px 6px;text-align:left;vertical-align:middle;white-space:nowrap}
th{color:var(--ink2);font-weight:500;font-size:12px}
td.n{text-align:right;font-variant-numeric:tabular-nums}
tr.sum td{font-weight:700;background:var(--sel)}
input.num{width:84px;border:1px solid var(--line2);border-radius:7px;padding:5px 7px;font:inherit;font-size:13px;background:var(--paper);color:var(--ink);text-align:right;font-variant-numeric:tabular-nums}
input.num.w{width:110px}
.presets{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}
button.pre{background:transparent;border:1px solid var(--line2);color:var(--ink);border-radius:8px;padding:5px 10px;font:inherit;font-size:12px;cursor:pointer}
button.pre:hover{background:var(--sel)}
.kv{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px;margin:8px 0}
.kv div{background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:8px 10px}
.kv b{display:block;font-size:12px;color:var(--ink2);font-weight:500}
.kv span{font-size:15px;font-weight:700;color:var(--navy);font-variant-numeric:tabular-nums}
.big{font-size:20px;font-weight:700;color:var(--navy);font-variant-numeric:tabular-nums}
.warn{color:var(--red);font-weight:700}
.q{background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:12px 14px;margin:10px 0}
.q h3{margin:0 0 4px;font-size:15px}
.opts{display:flex;flex-direction:column;gap:6px}
.opt{display:flex;gap:10px;align-items:flex-start;border:1px solid var(--line);border-radius:9px;padding:8px 10px;cursor:pointer}
.opt:has(input:checked){background:var(--sel);border-color:var(--sel-line)}
.opt input{margin-top:4px;flex:0 0 auto}
.opt span{display:block;color:var(--ink2);font-size:13px}
.rec{font-size:11px;color:var(--gold);font-weight:700;margin-left:6px}
input.txt{width:100%;margin-top:6px;border:1px solid var(--line2);border-radius:8px;padding:8px 10px;font:inherit;font-size:13px;background:var(--paper);color:var(--ink)}
.foot{position:fixed;left:0;right:0;bottom:0;background:var(--paper);border-top:1px solid var(--line);padding:10px 16px;padding-bottom:calc(10px + env(safe-area-inset-bottom,0px));display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap}
.foot .st{font-size:13px;color:var(--ink2)}
.foot .st b{color:var(--ink);font-variant-numeric:tabular-nums}
button.copy{background:var(--navy);color:#fff;border:0;border-radius:9px;padding:9px 16px;font:inherit;font-weight:700;cursor:pointer}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]) button.copy{color:#15182a}}
:root[data-theme="dark"] button.copy{color:#15182a}
button:focus-visible,input:focus-visible,.opt:focus-within{outline:2px solid var(--gold);outline-offset:2px}
pre.sum{white-space:pre-wrap;background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:10px 12px;font-size:12px;margin:8px 0}
label.inl{display:inline-flex;align-items:center;gap:6px;margin:4px 12px 4px 0;font-size:13px}
</style>
<div class="wrap">
<h1>송편 사다리·교환 계산기</h1>
<p class="asof">2026-09-22 밤 · 실서버 최근 7일(${N}명, 세금식 = 도달 단계가 곧 송편) · 상자 1개 = 💎25 환산 · 숫자를 바꾸면 바로 다시 계산됩니다</p>

<div class="card">
<p>방향: <b>사다리는 후하게, 교환은 한도 없이 후하지 않게.</b> 기본값은 A+ 사다리와 비싼 교환 비율(상자 1개 = 💎25 등가는 유지)입니다. 도달 보상(사다리)은 <b>누적 총량</b> 기준이라 교환에 써도 줄지 않고, 교환은 <b>사용 가능 송편</b>을 씁니다. 총액은 지난주 분포 그대로 7일치이고, 기간 칸을 6일로 두면 분포를 6/7로 줄여 계산합니다.</p>
<div class="kv">
<div><b>중앙값</b><span>${n(pct(0.5))}</span></div><div><b>상위 25%</b><span>${n(pct(0.75))}</span></div><div><b>상위 10%</b><span>${n(pct(0.9))}</span></div><div><b>상위 1%</b><span>${n(pct(0.99))}</span></div><div><b>최대</b><span>${n(d[N - 1]!)}</span></div><div><b>100 미만</b><span>${d.filter((v) => v < 100).length}명</span></div>
</div>
<p>비교 기준: 순위 보상 6종 합계 💎${n(RANK.dia)} · 📦${n(RANK.box)} = 💎환산 <b>${n(RANK.dia + RANK.box * 25)}</b>.
<label class="inl">이벤트 기간 <input class="num" id="days" type="number" min="1" max="14" value="7" style="width:60px"> 일</label></p>
</div>

<h2>1. 도달 사다리 <small>도달 송편과 보상을 직접 입력</small></h2>
<div class="presets"><button class="pre" type="button" data-pre="AP">A+ 후하게 채우기(권장)</button><button class="pre" type="button" data-pre="A">A 원안 채우기</button><button class="pre" type="button" data-pre="B">B 다이아 절반 채우기</button><button class="pre" type="button" data-pre="clear">비우기</button></div>
<div class="tw"><table id="lad"><thead><tr><th>#</th><th>도달 송편</th><th>💎</th><th>📦</th><th>도달 인원</th><th>누적 보상</th></tr></thead><tbody>
${Array.from({ length: 9 }, (_, i) => `<tr data-i="${i}"><td>${i + 1}</td><td><input class="num w" data-k="m" type="number" min="0" step="10"></td><td><input class="num" data-k="d" type="number" min="0" step="10"></td><td><input class="num" data-k="b" type="number" min="0" step="1"></td><td class="n r"></td><td class="cum"></td></tr>`).join('')}
<tr class="sum"><td colspan="4">총 지급 추정</td><td colspan="2" id="ladTot"></td></tr>
</tbody></table></div>
<p class="asof">빈 줄은 무시합니다. 도달 송편이 낮은 순서로 적어 주세요.</p>

<h2>2. 교환 <small>비율과 1인 한도</small></h2>
<div class="presets"><button class="pre" type="button" data-ex="strict">한도 없음 · 비싸게(📦3=600 · 💎100=800)(권장)</button><button class="pre" type="button" data-ex="strict2">한도 없음 · 더 비싸게(📦3=750 · 💎100=1,000)</button><button class="pre" type="button" data-ex="par">등가 · 각 10회(📦3=300 · 💎100=400)</button><button class="pre" type="button" data-ex="cheap">원안(📦3=150 · 💎100=400 · 각 20회)</button></div>
<div class="card">
<label class="inl">📦3 = <input class="num" id="rateBox" type="number" min="1" step="10" value="600"> 송편</label>
<label class="inl">💎100 = <input class="num" id="rateDia" type="number" min="1" step="10" value="800"> 송편</label>
<label class="inl">1인 한도(상품별) <input class="num" id="cap" type="number" min="0" step="1" value="0" style="width:60px"> 회 <span class="asof" style="margin:0">(0 = 없음)</span></label>
<p id="exNote" class="asof" style="margin-top:6px"></p>
<div class="tw"><table><thead><tr><th></th><th>💎</th><th>📦</th><th>💎환산</th></tr></thead><tbody>
<tr><td>모두 다이아부터 바꾸면</td><td class="n" id="e1d"></td><td class="n" id="e1b"></td><td class="n" id="e1e"></td></tr>
<tr><td>모두 상자부터 바꾸면</td><td class="n" id="e2d"></td><td class="n" id="e2b"></td><td class="n" id="e2e"></td></tr>
</tbody></table></div>
</div>

<h2>3. 합계와 유저 예시</h2>
<div class="card">
<div class="kv">
<div><b>사다리 합계</b><span id="sumLad"></span></div>
<div><b>교환 최대(💎환산)</b><span id="sumEx"></span></div>
<div><b>송편 전체(💎환산)</b><span id="sumAll" class="big"></span></div>
<div><b>순위 보상 대비</b><span id="sumShare" class="big"></span></div>
</div>
<div class="tw"><table><thead><tr><th>유저</th><th>기간 송편</th><th>사다리</th><th>교환 최대(💎 / 📦 한쪽만)</th></tr></thead><tbody id="prof"></tbody></table></div>
</div>

<h2>4. 남은 송편</h2>
<form id="f">
<div class="q"><h3>교환 마감 뒤 남은 송편</h3>
<div class="opts">
<label class="opt"><input type="radio" name="q4" value="10/3 23:59 지나면 소멸(안내 문구 표시)"><div><b>10/3 23:59 지나면 소멸<span class="rec">권장</span></b><span>화면과 우편에 미리 안내</span></div></label>
<label class="opt"><input type="radio" name="q4" value="다음 이벤트로 이월"><div><b>다음 이벤트로 이월</b><span>테이블을 이벤트 무관하게 남겨야 함</span></div></label>
</div><input class="txt" type="text" name="q4_note" placeholder="메모"></div>
</form>

<h2>요약</h2>
<pre class="sum" id="sum"></pre>
</div>
<div class="foot"><div class="st">송편 전체 💎환산 <b id="footAll"></b> · 순위 보상의 <b id="footShare"></b></div><button class="copy" id="copy" type="button">요약 복사</button></div>
<script>
(function(){
  var D=${JSON.stringify(d)};var N=D.length;var BOX=25;var RANK=${JSON.stringify(RANK)};var RANK_EQ=RANK.dia+RANK.box*BOX;
  var PRE={A:${JSON.stringify(LADDER_A)},B:${JSON.stringify(LADDER_B)},AP:${JSON.stringify(LADDER_AP)}};
  var KEY='chuseok-ladder-calc-v2';
  var $=function(s,r){return (r||document).querySelector(s)};var $$=function(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))};
  var fmt=function(v){return Math.round(v).toLocaleString('ko-KR')};
  var pct=function(p,arr){return arr[Math.min(N-1,Math.floor(p*N))]};
  function scaled(){var days=Math.max(1,Number($('#days').value)||7);var k=days/7;return D.map(function(v){return v*k})}
  function ladder(){return $$('#lad tbody tr[data-i]').map(function(tr){return {m:Number($('[data-k=m]',tr).value),d:Number($('[data-k=d]',tr).value)||0,b:Number($('[data-k=b]',tr).value)||0,tr:tr}}).filter(function(r){return r.m>0})}
  function ex(){return {rateBox:Math.max(1,Number($('#rateBox').value)||300),rateDia:Math.max(1,Number($('#rateDia').value)||400),cap:Math.max(0,Number($('#cap').value)||0)}}
  function exTotal(e,arr,first){var dia=0,box=0;var cap=e.cap>0?e.cap:1e9;for(var i=0;i<arr.length;i++){var s=arr[i];var bd=function(){var k=Math.min(cap,Math.floor(s/e.rateDia));dia+=k*100;s-=k*e.rateDia};var bb=function(){var k=Math.min(cap,Math.floor(s/e.rateBox));box+=k*3;s-=k*e.rateBox};if(first==='dia'){bd();bb()}else{bb();bd()}}return {dia:dia,box:box,eq:dia+box*BOX}}
  function calc(){
    var arr=scaled();var L=ladder();var cd=0,cb=0,td=0,tb=0;
    $$('#lad tbody tr[data-i]').forEach(function(tr){$('.r',tr).textContent='';$('.cum',tr).textContent=''});
    L.forEach(function(r){var reach=arr.filter(function(v){return v>=r.m}).length;cd+=r.d;cb+=r.b;td+=reach*r.d;tb+=reach*r.b;$('.r',r.tr).textContent=reach+'명 ('+Math.round(100*reach/N)+'%)';$('.cum',r.tr).textContent='💎'+fmt(cd)+' · 📦'+cb});
    var ladEq=td+tb*BOX;$('#ladTot').textContent='💎'+fmt(td)+' · 📦'+fmt(tb)+' (💎환산 '+fmt(ladEq)+')';
    var e=ex();var e1=exTotal(e,arr,'dia'),e2=exTotal(e,arr,'box');
    $('#e1d').textContent=fmt(e1.dia);$('#e1b').textContent=fmt(e1.box);$('#e1e').textContent=fmt(e1.eq);$('#e2d').textContent=fmt(e2.dia);$('#e2b').textContent=fmt(e2.box);$('#e2e').textContent=fmt(e2.eq);
    var boxVal=e.rateBox/3, diaVal=e.rateDia/100; var ratio=boxVal/diaVal;
    $('#exNote').innerHTML='상자 1개 = '+fmt(boxVal)+'송편, 다이아 1개 = '+(Math.round(diaVal*100)/100)+'송편 → 상자 1개가 💎'+(Math.round(ratio*10)/10)+' 꼴'+(ratio<20?' <span class="warn">(게임 안 값 💎25보다 싸서 상자로 몰림)</span>':ratio>30?' (상자가 비싸 다이아로 몰림)':' (💎25와 비슷)')+(e.cap===0?' · <span class="warn">한도 없음</span>':' · 1인 최대 💎'+fmt(e.cap*100)+' · 📦'+(e.cap*3));
    var exEq=Math.max(e1.eq,e2.eq);var all=ladEq+exEq;
    $('#sumLad').textContent='💎'+fmt(td)+' · 📦'+fmt(tb);$('#sumEx').textContent=fmt(exEq);$('#sumAll').textContent=fmt(all);$('#sumShare').textContent=Math.round(100*all/RANK_EQ)+'%';
    $('#footAll').textContent=fmt(all);$('#footShare').textContent=Math.round(100*all/RANK_EQ)+'%';
    var profs=[['중앙값 유저',pct(0.5,arr)],['상위 25%',pct(0.75,arr)],['상위 10%',pct(0.9,arr)],['상위 1%',pct(0.99,arr)]];
    var cap=e.cap>0?e.cap:1e9;
    $('#prof').innerHTML=profs.map(function(p){var v=p[1];var ld=0,lb=0;L.forEach(function(r){if(v>=r.m){ld+=r.d;lb+=r.b}});var md=Math.min(cap,Math.floor(v/e.rateDia))*100,mb=Math.min(cap,Math.floor(v/e.rateBox))*3;return '<tr><td>'+p[0]+'</td><td class="n">'+fmt(v)+'</td><td>💎'+fmt(ld)+' · 📦'+lb+'</td><td>💎'+fmt(md)+' 또는 📦'+mb+'</td></tr>'}).join('');
    summary(L,e,td,tb,e1,e2,all);persist();
  }
  function summary(L,e,td,tb,e1,e2,all){
    var days=$('#days').value;var q4=$('input[name=q4]:checked');var note=$('input[name=q4_note]').value.trim();
    var lines=['[송편 사다리·교환 결정] 기간 '+days+'일 기준'];
    lines.push('1. 사다리: '+(L.length?L.map(function(r){return fmt(r.m)+'→💎'+fmt(r.d)+'·📦'+r.b}).join(' / '):'미정')+' (총 💎'+fmt(td)+'·📦'+fmt(tb)+')');
    lines.push('2. 교환: 📦3='+fmt(e.rateBox)+'송편 · 💎100='+fmt(e.rateDia)+'송편, 1인 한도 '+(e.cap>0?'각 '+e.cap+'회':'없음')+' (총 💎'+fmt(Math.max(e1.dia,e2.dia))+'·📦'+fmt(Math.max(e1.box,e2.box))+' 상한)');
    lines.push('3. 송편 전체 💎환산 '+fmt(all)+' = 순위 보상의 '+Math.round(100*all/RANK_EQ)+'%');
    lines.push('4. 남은 송편: '+(q4?q4.value:'미정')+(note?' / 메모: '+note:''));
    $('#sum').textContent=lines.join('\\n');return lines.join('\\n');
  }
  function fill(pre){$$('#lad tbody tr[data-i]').forEach(function(tr,i){var r=pre&&pre[i];$('[data-k=m]',tr).value=r?r[0]:'';$('[data-k=d]',tr).value=r?r[1]:'';$('[data-k=b]',tr).value=r?r[2]:''})}
  function persist(){try{var o={days:$('#days').value,rateBox:$('#rateBox').value,rateDia:$('#rateDia').value,cap:$('#cap').value,lad:$$('#lad tbody tr[data-i]').map(function(tr){return [$('[data-k=m]',tr).value,$('[data-k=d]',tr).value,$('[data-k=b]',tr).value]}),q4:($('input[name=q4]:checked')||{}).value||null,note:$('input[name=q4_note]').value};localStorage.setItem(KEY,JSON.stringify(o))}catch(e){}}
  function restore(){try{var o=JSON.parse(localStorage.getItem(KEY)||'null');if(!o){fill(PRE.AP);return}$('#days').value=o.days||7;$('#rateBox').value=o.rateBox||600;$('#rateDia').value=o.rateDia||800;$('#cap').value=o.cap==null?0:o.cap;$$('#lad tbody tr[data-i]').forEach(function(tr,i){var r=o.lad&&o.lad[i]||['','',''];$('[data-k=m]',tr).value=r[0];$('[data-k=d]',tr).value=r[1];$('[data-k=b]',tr).value=r[2]});if(o.q4){var el=$('input[name=q4][value="'+CSS.escape(o.q4)+'"]');if(el)el.checked=true}if(o.note)$('input[name=q4_note]').value=o.note}catch(e){fill(PRE.AP)}}
  $$('button[data-pre]').forEach(function(b){b.addEventListener('click',function(){var k=b.getAttribute('data-pre');fill(k==='clear'?null:PRE[k]);calc()})});
  $$('button[data-ex]').forEach(function(b){b.addEventListener('click',function(){var k=b.getAttribute('data-ex');var v={strict:[600,800,0],strict2:[750,1000,0],par:[300,400,10],cheap:[150,400,20]}[k];$('#rateBox').value=v[0];$('#rateDia').value=v[1];$('#cap').value=v[2];calc()})});
  document.addEventListener('input',calc);document.addEventListener('change',calc);
  $('#copy').addEventListener('click',function(){var t=$('#sum').textContent;var b=this;function done(ok){b.textContent=ok?'복사됨':'복사 실패';setTimeout(function(){b.textContent='요약 복사'},1800)}if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t).then(function(){done(true)},function(){done(false)})}else done(false)});
  restore();calc();
})();
</script>
`;
writeFileSync(OUT, html);
console.log(`wrote ${OUT} (${Math.round(html.length / 1024)} KB)`);
