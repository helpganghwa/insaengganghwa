// 스토리 이전↔개선 비교 + 4선택 리뷰 폼 생성. (apply 전에 떠 둔 _story-old.json = 이전, _story-new.json = 개선)
import { readFileSync, writeFileSync } from 'fs';
const html = readFileSync('sprites-test-review.html', 'utf8');
function extract(name: string) { const m = html.match(new RegExp(`const ${name} = (\\[[\\s\\S]*?\\n\\])\\s*;`)); return eval(m![1]); }
const ALL = [...extract('SETS'), ...extract('SETS2')];
const km: Record<string, any> = {};
for (const s of ALL) for (const it of s.items) km[it.key] = { name: it.name, slot: it.slot, region: s.region, dir: it.objAnim ? it.objAnim.dir : null, n: it.objAnim ? it.objAnim.n : 15, st: it.staticSrc };
const OLD = JSON.parse(readFileSync('scripts/_story-old.json', 'utf8'));
const NEW = JSON.parse(readFileSync('scripts/_story-new.json', 'utf8'));
// 현재 HTML에 실제 반영된 최종 lore 추출
const CUR: Record<string, string> = {};
{ const re = /key: '([a-z_]+)'[\s\S]*?lore: '((?:[^'\\]|\\.)*)'/g; let m: RegExpExecArray | null; while ((m = re.exec(html))) { CUR[m[1]] = m[2].replace(/\\'/g, "'"); } }
const SLOT = { weapon: '무기', armor: '방어구', accessory: '장신구' };
const items = Object.keys(NEW).map((key) => {
  const fin = CUR[key] || NEW[key].new;
  const st = fin === (OLD[key] || '') ? '유지' : (fin === NEW[key].new ? '채택' : '개선');
  return { key, ...km[key], mode: NEW[key].mode, old: OLD[key] || '(이전 없음)', neo: NEW[key].new, fin, st };
});
const DATA = JSON.stringify(items);
const page = `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>스토리 개선 비교·리뷰</title><style>
:root{color-scheme:dark}*{box-sizing:border-box}
body{margin:0;padding:16px 14px 80px;font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo",sans-serif;background:#0c0d12;color:#e7e7ea;max-width:1000px;margin-inline:auto}
h1{font-size:19px;margin:0 0 2px}.sub{font-size:12px;color:#9a9aa6;margin:0 0 12px}
.tool{position:sticky;top:0;z-index:10;background:#0c0d12;padding:8px 0;display:flex;gap:8px;align-items:center;flex-wrap:wrap;border-bottom:1px solid #1c1d24;margin-bottom:10px}
.tool button{font:inherit;font-size:12px;font-weight:700;border:1px solid #2a2b34;border-radius:8px;padding:6px 10px;background:#14151c;color:#c9cad3;cursor:pointer}
.tool .ct{font-size:12px;color:#c9a24a;font-weight:700}
textarea#out{width:100%;height:0;opacity:0;font:11px ui-monospace,monospace;background:#0c0d12;color:#cfeacc;border:0;padding:0;border-radius:8px}
textarea#out.show{height:220px;opacity:1;padding:8px;border:1px solid #2a2b34;margin-bottom:8px}
h2{font-size:16px;color:#c9a24a;font-weight:800;margin:22px 0 8px;border-bottom:1px solid #23242c;padding-bottom:5px}
.card{display:grid;grid-template-columns:120px 1fr;gap:10px;border:1px solid #23242c;border-radius:12px;background:#0f1017;padding:10px;margin-bottom:10px}
@media(max-width:640px){.card{grid-template-columns:1fr}}
.shot{width:112px;height:112px;image-rendering:pixelated;object-fit:contain;background-image:linear-gradient(45deg,#23242c 25%,transparent 25%),linear-gradient(-45deg,#23242c 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#23242c 75%),linear-gradient(-45deg,transparent 75%,#23242c 75%);background-size:14px 14px;background-position:0 0,0 7px,7px -7px,-7px 0;border-radius:8px}
.nm{font-size:14px;font-weight:800;color:#fff}.nm .sl{font-size:9px;color:#6c6d78;font-weight:600;margin-left:4px}
.mode{font-size:9px;font-weight:800;background:#241a36;color:#c8a8e8;border-radius:5px;padding:1px 6px;margin-left:6px}
.box{border:1px solid #1c1d24;border-radius:8px;padding:7px;margin-top:6px;font-size:12px;line-height:1.6;white-space:pre-line}
.box .lb{font-size:9px;font-weight:800;border-radius:4px;padding:1px 5px;margin-right:5px}
.box.old{color:#bcbdc7}.box.old .lb{background:#3a2a12;color:#e8c878}
.box.neo{color:#dfe7df}.box.neo .lb{background:#16361f;color:#7ee0a0}
.box.fin{color:#fff;border-color:#3a4d2a;background:#101a0e}.box.fin .lb{background:#2a4d16;color:#bfe87e}
.stb{font-size:9px;font-weight:800;border-radius:5px;padding:1px 6px;margin-left:6px}
.ch{display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-top:7px}
.ch label{font-size:11px;font-weight:700;border:1px solid #2a2b34;border-radius:6px;padding:6px 8px;cursor:pointer;color:#c9cad3;display:flex;gap:5px;align-items:center}
.ch label.on{background:#d4a017;color:#1a1300;border-color:#d4a017}
.ch input{display:none}
.note{width:100%;box-sizing:border-box;margin-top:6px;font:inherit;font-size:11px;border:1px solid #2a2b34;border-radius:6px;background:#0c0d12;color:#cfd8e8;padding:5px;resize:vertical;height:0;opacity:0;overflow:hidden}
.note.show{height:auto;min-height:34px;opacity:1}
</style></head><body>
<h1>스토리 개선 비교·리뷰 (108종)</h1>
<p class="sub">세트마다 서술 방식을 다르게 다시 썼습니다. 이전↔개선을 비교하고 4가지 중 하나를 고르세요. (개선 선택 시 사유 입력칸이 열립니다)</p>
<div class="tool"><span class="ct" id="ct"></span><button id="fonly">개선만 보기</button><button id="copy">📋 결정 복사</button><button id="clr">초기화</button></div>
<textarea id="out" readonly></textarea><div id="app"></div>
<script>
const DATA=${DATA};const SLOT=${JSON.stringify(SLOT)};
const LS='storyqa-v1';const RV=JSON.parse(localStorage.getItem(LS)||'{}');const save=()=>localStorage.setItem(LS,JSON.stringify(RV));
const CH=[['keep','이전 유지'],['impold','이전에서 개선'],['adopt','변경(개선본 채택)'],['impnew','변경본에서 개선']];
const app=document.getElementById('app');const anims=[];let cur='';
DATA.forEach((it,i)=>{
 if(it.region!==cur){cur=it.region;const h=document.createElement('h2');h.textContent=it.region;app.appendChild(h);}
 const d=RV[it.key]||(RV[it.key]={pick:'',note:''});
 const hasAnim=!!it.dir;const src=hasAnim?it.dir+'/0.png':it.st;
 const c=document.createElement('div');c.className='card';c.dataset.st=it.st;
 c.innerHTML='<div><img class="shot" src="'+src+'" '+(hasAnim?'data-dir="'+it.dir+'" data-n="'+it.n+'"':'')+'></div>'+
   '<div><div class="nm">'+it.name+'<span class="sl">'+(SLOT[it.slot]||'')+'</span><span class="mode">'+it.mode+'</span>'+
   '<span class="stb" style="background:'+(it.st==='개선'?'#3a2a12':it.st==='채택'?'#16361f':'#1c2733')+';color:'+(it.st==='개선'?'#f0c060':it.st==='채택'?'#7ee0a0':'#9fb4d0')+'">'+it.st+'</span></div>'+
   '<div class="box old"><span class="lb">이전</span>'+it.old+'</div>'+
   '<div class="box neo"><span class="lb">개선안</span>'+it.neo+'</div>'+
   '<div class="box fin"><span class="lb">최종</span>'+it.fin+'</div>'+
   '<div class="ch">'+CH.map(([v,t])=>'<label data-v="'+v+'"><input type="radio" name="r'+i+'">'+t+'</label>').join('')+'</div>'+
   '<textarea class="note" placeholder="개선 사유 / 추가 요청을 적어 주세요">'+(d.note||'')+'</textarea></div>';
 app.appendChild(c);
 const img=c.querySelector('.shot');if(hasAnim){img._anim=true;anims.push({img,dir:it.dir,n:it.n,i:0});}
 const note=c.querySelector('.note');
 const refl=()=>{c.querySelectorAll('.ch label').forEach(l=>l.classList.toggle('on',l.dataset.v===d.pick));note.classList.toggle('show',d.pick==='impold'||d.pick==='impnew');};
 c.querySelectorAll('.ch label').forEach(l=>l.addEventListener('click',()=>{d.pick=l.dataset.v;l.querySelector('input').checked=true;save();refl();upd();}));
 note.addEventListener('input',()=>{d.note=note.value;save();});
 refl();
});
let last=0;function tick(t){if(t-last>=110){last=t;for(const o of anims){if(o.img._anim){o.i=(o.i+1)%o.n;o.img.src=o.dir+'/'+o.i+'.png';}}}requestAnimationFrame(tick);}requestAnimationFrame(tick);
function cnt(){return Object.values(RV).filter(v=>v.pick).length;}
function upd(){document.getElementById('ct').textContent='총 '+DATA.length+'종 · 선택 '+cnt()+'개';}upd();
const LBL={keep:'이전 유지',impold:'이전에서 개선',adopt:'변경 채택',impnew:'변경본에서 개선'};
document.getElementById('copy').onclick=()=>{const L=['[스토리 결정 — 108종]'];let r='';
 DATA.forEach(it=>{const d=RV[it.key]||{};if(!d.pick)return;if(it.region!==r){r=it.region;L.push('');L.push('== '+it.region+' ==');}
  L.push('· '+it.name+': '+(LBL[d.pick]||d.pick)+((d.pick==='impold'||d.pick==='impnew')&&d.note?(' — '+d.note):''));});
 const t=L.length>1?L.join('\\n'):'(선택 없음)';const o=document.getElementById('out');o.classList.add('show');o.value=t;o.select();if(navigator.clipboard)navigator.clipboard.writeText(t);};
let fo=false;document.getElementById('fonly').onclick=(e)=>{fo=!fo;e.target.style.background=fo?'#d4a017':'';e.target.style.color=fo?'#1a1300':'';
 document.querySelectorAll('.card').forEach(c=>{c.style.display=(!fo||c.dataset.st==='개선')?'':'none';});
 document.querySelectorAll('h2').forEach(h=>{let n=h.nextElementSibling,vis=false;while(n&&n.tagName!=='H2'){if(n.classList.contains('card')&&n.style.display!=='none')vis=true;n=n.nextElementSibling;}h.style.display=vis?'':'none';});};
document.getElementById('clr').onclick=()=>{if(confirm('선택을 모두 지울까요?')){localStorage.removeItem(LS);location.reload();}};
</script></body></html>`;
writeFileSync('sprites-test-storyqa.html', page);
console.log('storyqa built · items=' + items.length);
