// 수동 프레임 정렬(평행이동) 리뷰 폼 → public/align-anim3.html
// 각 아이템의 애니 스트립(anim3/<id>.webp)을 프레임으로 쪼개, 프레임별 dx,dy를
// 사용자가 방향키로 보정하며 루프 프리뷰로 확인 → 보정값 JSON 내보내기.
// 적용은 scripts/apply-align.ts가 스트립에 평행이동만 가해 재합성(스크립트=위치보정만 원칙).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const sel = JSON.parse(readFileSync(join(ROOT, 'scripts/final-sel.json'), 'utf8')) as Record<string, string[]>;
const lore = JSON.parse(readFileSync(join(ROOT, 'scripts/anim3-lore.json'), 'utf8')) as Record<string, { name?: string }>;
const pool = new Map((JSON.parse(readFileSync(join(ROOT, 'scripts/pool-data.json'), 'utf8')) as { id: string; label: string }[]).map((p) => [p.id, p.label]));
const man = existsSync(join(ROOT, 'public/sprites/anim3.json'))
  ? JSON.parse(readFileSync(join(ROOT, 'public/sprites/anim3.json'), 'utf8')) as { cell: number; items: Record<string, { frames: number }> }
  : { cell: 256, items: {} };

const items: { id: string; name: string; slot: string; frames: number }[] = [];
for (const slot of ['weapon', 'armor', 'accessory']) {
  for (const uid of sel[slot] ?? []) {
    if (!uid.startsWith('v3:')) continue;
    const id = uid.slice(3);
    const f = man.items[id]?.frames ?? 0;
    if (!f) continue;
    items.push({ id, name: lore[id]?.name ?? pool.get(id) ?? id, slot, frames: f });
  }
}

const CELL = man.cell ?? 256;
const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>3차 애니 수동 정렬</title>
<style>
:root{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;font:14px/1.5 system-ui,sans-serif;background:#0b0b0e;color:#e7e7ea}
header{padding:10px 14px;background:#16161c;border-bottom:1px solid #2a2a33;position:sticky;top:0;z-index:5;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
select,button{font:inherit;background:#23232c;color:#e7e7ea;border:1px solid #3a3a46;border-radius:8px;padding:6px 10px;cursor:pointer}
button:hover{background:#2e2e3a}
button.pri{background:#3b5bdb;border-color:#3b5bdb}
.wrap{display:flex;gap:18px;padding:16px;flex-wrap:wrap}
.stage{background:
  conic-gradient(#1a1a20 25%,#15151a 0 50%,#1a1a20 0 75%,#15151a 0) 0 0/24px 24px;
  border:1px solid #2a2a33;border-radius:12px;padding:12px}
canvas{image-rendering:pixelated;display:block}
.col{display:flex;flex-direction:column;gap:10px}
.frames{display:flex;gap:6px;flex-wrap:wrap;max-width:560px}
.fr{position:relative;border:2px solid #3a3a46;border-radius:8px;padding:2px;background:#15151a;cursor:pointer}
.fr.sel{border-color:#ffd43b}
.fr canvas{width:64px;height:64px}
.fr b{position:absolute;left:3px;top:1px;font-size:10px;color:#9aa;text-shadow:0 1px 2px #000}
.fr i{position:absolute;right:3px;bottom:1px;font-size:10px;font-style:normal;color:#ffd43b;text-shadow:0 1px 2px #000}
.pad{display:grid;grid-template-columns:repeat(3,40px);grid-template-rows:repeat(3,40px);gap:4px}
.pad button{padding:0;height:40px}
.pad .sp{visibility:hidden}
.muted{color:#8a8a96}
kbd{background:#23232c;border:1px solid #3a3a46;border-radius:4px;padding:0 5px}
textarea{width:100%;height:120px;background:#0f0f14;color:#9ad;border:1px solid #2a2a33;border-radius:8px;font:12px ui-monospace,monospace;padding:8px}
.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.tag{font-size:12px;padding:1px 7px;border-radius:999px;background:#23232c;border:1px solid #3a3a46}
</style></head><body>
<header>
  <button id="prev">◀</button>
  <select id="pick"></select>
  <button id="next">▶</button>
  <span class="tag" id="pos"></span>
  <span class="muted">|</span>
  <label class="row"><input type="checkbox" id="onion"> 잔상</label>
  <label class="row">속도 <input type="range" id="spd" min="80" max="400" value="160" style="width:90px"></label>
  <span class="muted">| 프레임 선택 후 <kbd>←↑↓→</kbd> 보정 · <kbd>0</kbd> 리셋</span>
  <button id="resetItem">이 아이템 초기화</button>
  <button class="pri" id="export">보정값 내보내기</button>
</header>
<div class="wrap">
  <div class="col">
    <div class="stage"><canvas id="stage" width="${CELL}" height="${CELL}" style="width:${CELL * 1.6}px;height:${CELL * 1.6}px"></canvas></div>
    <div class="row"><b id="nm"></b> <span class="tag" id="slot"></span> <span class="muted" id="fcnt"></span></div>
  </div>
  <div class="col">
    <div class="muted">프레임 (노란 테두리=선택, 우하단=보정값)</div>
    <div class="frames" id="frames"></div>
    <div class="row" style="margin-top:6px">
      <div class="pad">
        <span class="sp"></span><button data-d="0,-1">↑</button><span class="sp"></span>
        <button data-d="-1,0">←</button><button data-d="0,0">·</button><button data-d="1,0">→</button>
        <span class="sp"></span><button data-d="0,1">↓</button><span class="sp"></span>
      </div>
      <div class="col">
        <span class="muted">선택 프레임 보정</span>
        <span id="curoff" style="font:16px ui-monospace,monospace;color:#ffd43b">(0, 0)</span>
        <button id="resetFr">이 프레임 0</button>
      </div>
    </div>
  </div>
  <div class="col" style="flex:1;min-width:280px">
    <div class="muted">내보내기 (복사해서 전달)</div>
    <textarea id="out" readonly placeholder="보정값 내보내기 버튼을 누르면 여기에 JSON이 생성됩니다"></textarea>
    <div class="muted">보정값은 브라우저에 자동 저장됩니다(localStorage). 비강체 변형(모양이 휘는 것)은 평행이동으로 못 잡으니 재생성 대상으로 따로 메모해 주세요.</div>
  </div>
</div>
<script>
const ITEMS=${JSON.stringify(items)};
const CELL=${CELL};
const LSK='align3';
let store=JSON.parse(localStorage.getItem(LSK)||'{}');
let idx=0, sel=0, playing=true, tick=0, raf=0, lastT=0, speed=160;
const $=s=>document.querySelector(s);
const pick=$('#pick'); ITEMS.forEach((it,i)=>{const o=document.createElement('option');o.value=i;o.textContent=(it.slot[0].toUpperCase())+' · '+it.name+' ('+it.id+')';pick.appendChild(o);});

const cache={}; // id -> [ImageBitmap per frame]
async function loadItem(it){
  if(cache[it.id]) return cache[it.id];
  const img=new Image(); img.src='sprites/anim3/'+it.id+'.webp?ts='+Date.now();
  await img.decode();
  const fr=[];
  for(let i=0;i<it.frames;i++){
    const c=new OffscreenCanvas(CELL,CELL); const x=c.getContext('2d');
    x.drawImage(img,i*CELL,0,CELL,CELL,0,0,CELL,CELL);
    fr.push(await createImageBitmap(c));
  }
  cache[it.id]=fr; return fr;
}
function offs(it){ if(!store[it.id]) store[it.id]=Array.from({length:it.frames},()=>[0,0]); return store[it.id]; }
function save(){ localStorage.setItem(LSK,JSON.stringify(store)); }

async function render(){
  const it=ITEMS[idx]; const fr=await loadItem(it); const o=offs(it);
  $('#nm').textContent=it.name; $('#slot').textContent=it.slot; $('#fcnt').textContent=it.frames+'프레임';
  $('#pos').textContent=(idx+1)+' / '+ITEMS.length; $('#curoff').textContent='('+o[sel][0]+', '+o[sel][1]+')';
  // 썸네일
  const wrap=$('#frames'); wrap.innerHTML='';
  fr.forEach((bm,i)=>{
    const d=document.createElement('div'); d.className='fr'+(i===sel?' sel':'');
    const c=document.createElement('canvas'); c.width=CELL;c.height=CELL; c.getContext('2d').drawImage(bm,0,0);
    d.appendChild(c); const b=document.createElement('b'); b.textContent=i; d.appendChild(b);
    const ii=document.createElement('i'); ii.textContent=(o[i][0]||o[i][1])?(o[i][0]+','+o[i][1]):''; d.appendChild(ii);
    d.onclick=()=>{sel=i;playing=false;render();}; wrap.appendChild(d);
  });
}
function drawStage(){
  const it=ITEMS[idx]; const fr=cache[it.id]; if(!fr){requestAnimationFrame(drawStage);return;}
  const o=offs(it); const cv=$('#stage'); const x=cv.getContext('2d'); x.clearRect(0,0,CELL,CELL);
  if($('#onion').checked){
    x.globalAlpha=0.34; fr.forEach((bm,i)=>x.drawImage(bm,o[i][0],o[i][1])); x.globalAlpha=1;
  } else {
    const i=playing?(tick%fr.length):sel;
    x.drawImage(fr[i],o[i][0],o[i][1]);
  }
  const now=performance.now();
  if(playing && now-lastT>=speed){ tick++; lastT=now; }
  requestAnimationFrame(drawStage);
}
function nudge(dx,dy){ const it=ITEMS[idx]; const o=offs(it); o[sel]=[o[sel][0]+dx,o[sel][1]+dy]; save(); render(); }
document.querySelectorAll('.pad button').forEach(b=>b.onclick=()=>{const[a,c]=b.dataset.d.split(',').map(Number);if(a===0&&c===0){const it=ITEMS[idx];offs(it)[sel]=[0,0];save();render();}else nudge(a,c);});
$('#resetFr').onclick=()=>{offs(ITEMS[idx])[sel]=[0,0];save();render();};
$('#resetItem').onclick=()=>{delete store[ITEMS[idx].id];save();sel=0;render();};
$('#prev').onclick=()=>{idx=(idx-1+ITEMS.length)%ITEMS.length;sel=0;tick=0;playing=true;pick.value=idx;render();};
$('#next').onclick=()=>{idx=(idx+1)%ITEMS.length;sel=0;tick=0;playing=true;pick.value=idx;render();};
pick.onchange=()=>{idx=+pick.value;sel=0;tick=0;playing=true;render();};
$('#spd').oninput=e=>speed=+e.target.value;
$('#onion').onchange=()=>render();
$('#export').onclick=()=>{
  const out={}; for(const id in store){ if(store[id].some(o=>o[0]||o[1])) out[id]=store[id]; }
  $('#out').value=JSON.stringify(out); $('#out').select();
};
window.addEventListener('keydown',e=>{
  if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();playing=false;
    if(e.key==='ArrowLeft')nudge(-1,0); if(e.key==='ArrowRight')nudge(1,0);
    if(e.key==='ArrowUp')nudge(0,-1); if(e.key==='ArrowDown')nudge(0,1);
  }
  if(e.key==='0'){offs(ITEMS[idx])[sel]=[0,0];save();render();}
  if(e.key===' '){e.preventDefault();playing=!playing;}
});
render(); drawStage();
</script></body></html>`;

writeFileSync(join(ROOT, 'public/align-anim3.html'), html);
console.log(`[align-anim3] ${items.length}종 → public/align-anim3.html`);
