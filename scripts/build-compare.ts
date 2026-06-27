// 1차(150)/2차(108)/3차(56) 통합 비교·선택 페이지 → public/catalog-compare.html
// 카드: 정적이미지 + (2차만)애니 + 이름. 슬롯 탭(무기/방어구/장신구)으로 3세대 통합 표시·선택.
// 모바일 최적화, 이미지 크게. 1차 이미지는 worktree(/tmp/cmp-v1)에서 public/_compare/v1로 복사.
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
type Item = { gen: '1차' | '2차' | '3차'; uid: string; slot: string; name: string; stat: string; anim: string };

// key:'x' / "key":"x" 양식 모두 파싱 (key,slot,nameKo)
function parseCatalog(src: string): { key: string; slot: string; name: string }[] {
  const out: { key: string; slot: string; name: string }[] = [];
  const re = /['"]?key['"]?:\s*['"]([a-z_0-9]+)['"][\s\S]{0,160}?['"]?slot['"]?:\s*['"]([a-z]+)['"][\s\S]{0,160}?['"]?nameKo['"]?:\s*['"]([^'"]*)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) out.push({ key: m[1], slot: m[2], name: m[3] });
  return out;
}

function buildV1(): Item[] {
  const cat = '/tmp/cmp-v1/lib/game/equipment/catalog-next.ts';
  if (!existsSync(cat)) return [];
  const items = parseCatalog(readFileSync(cat, 'utf8'));
  for (const s of ['weapon', 'armor', 'accessory']) mkdirSync(join(ROOT, 'public/_compare/v1', s), { recursive: true });
  const out: Item[] = [];
  for (const it of items) {
    const src = `/tmp/cmp-v1/public/sprites/${it.slot}/${it.key}.png`;
    const rel = `_compare/v1/${it.slot}/${it.key}.png`;
    if (existsSync(src)) copyFileSync(src, join(ROOT, 'public', rel));
    out.push({ gen: '1차', uid: 'v1:' + it.key, slot: it.slot, name: it.name, stat: existsSync(src) ? rel : '', anim: '' });
  }
  return out;
}

function buildV2(): Item[] {
  const items = parseCatalog(readFileSync(join(ROOT, 'lib/game/equipment/catalog-next.ts'), 'utf8'));
  return items.map((it) => {
    const stat = `sprites/${it.slot}/${it.key}.png`;
    const anim = `sprites/anim/${it.key}.webp`;
    return {
      gen: '2차' as const, uid: 'v2:' + it.key, slot: it.slot, name: it.name,
      stat: existsSync(join(ROOT, 'public', stat)) ? stat : '',
      anim: existsSync(join(ROOT, 'public', anim)) ? anim : '',
    };
  });
}

// 3차 비-seed 이름(이미지 기반 명명)
const NAME3: Record<string, string> = {
  'w-pumpkin-witch-staff-95': '잭오랜턴 지팡이', 'w-vampire-rapier-114': '흡혈귀의 가는 검',
  'w-reaper-scythe-120': '영혼을 거두는 낫', 'w-necromancer-staff-126': '해골 강령 지팡이',
  'w-assassin-twin-daggers-156': '그림자 쌍단검', 'w-ornate-flintlock-pistol-162': '장식 플린트락 권총',
  'w-celestial-greatsword-153': '천공의 대검', 'w-elven-longbow-154': '엘프의 은빛 장궁',
  'w--57': '잠긴 문의 대검', 'w-thunder-spear-191': '뇌격의 창',
  'a-pumpkin-witch-outfit-96': '호박 마녀의 옷', 'a-necromancer-robe-127': '강령술사의 로브',
  'a-test-gothic-lolita-150': '고딕 로리타 드레스', 'a-test-military-coat-151': '군청 제복 코트',
  'a-valkyrie-battle-dress-176': '발키리 전투복', 'a-frost-warden-coat-179': '서리 파수꾼의 외투',
  'a-paladin-armor-180': '성기사의 백금 갑주', 'a-dragon-knight-armor-186': '흑룡 기사 갑주',
  'a-phoenix-dancer-dress-183': '불사조 무희의 옷',
  'a-commander-epaulets-93': '사령관의 견장', 'a-pumpkin-witch-hat-97': '호박 마녀의 모자',
  'a-phantom-half-mask-125': '괴인의 백자 반가면', 'a-devil-horns-winged-149': '박쥐날개 뿔머리띠',
  'a-valkyrie-winged-circlet-179': '발키리 날개 서클릿', 'a-dragon-horned-helm-187': '흑룡 뿔투구',
  'a-paladin-winged-helm-181': '성기사 날개 투구', 'a-frost-kite-shield-82': '서리 카이트 실드',
};
function buildV3(): Item[] {
  const sel = JSON.parse(readFileSync(join(ROOT, 'scripts/selected.json'), 'utf8')) as Record<string, string[]>;
  const pool = JSON.parse(readFileSync(join(ROOT, 'scripts/pool-data.json'), 'utf8')) as { id: string; slot: string; label: string }[];
  const byId = new Map(pool.map((p) => [p.id, p]));
  const out: Item[] = [];
  for (const slot of ['weapon', 'armor', 'accessory']) for (const id of sel[slot] ?? []) {
    const p = byId.get(id);
    const name = NAME3[id] ?? (p && /[가-힣]/.test(p.label) ? p.label : id);
    out.push({ gen: '3차', uid: 'v3:' + id, slot, name, stat: `sprites/pool/${id}.png`, anim: '' });
  }
  return out;
}

const all = [...buildV3(), ...buildV2(), ...buildV1()];
const data = JSON.stringify(all);
const counts = (g: string) => all.filter((i) => i.gen === g).length;

const html = `<!doctype html><html lang=ko><head><meta charset=utf-8><meta name=viewport content="width=390,user-scalable=no">
<title>카탈로그 통합 (1·2·3차)</title><style>
*{box-sizing:border-box}
body{margin:0;background:#0b0b0e;color:#e7e7ea;font:14px/1.4 system-ui,sans-serif}
header{position:sticky;top:0;background:#0b0b0ef5;backdrop-filter:blur(6px);border-bottom:1px solid #222;z-index:9;padding:8px 10px}
h1{font-size:14px;margin:0 0 6px}
.tabs{display:flex;gap:6px}
.gens{margin-top:6px}
.gens .tab{font-size:12px;padding:6px}
.tab{flex:1;padding:8px;border:1px solid #33333c;background:#16161c;color:#cfcfd6;border-radius:8px;font-weight:700;font-size:13px;text-align:center;cursor:pointer}
.tab.on{background:#d97706;border-color:#d97706;color:#1a1208}
.cnt{font-size:11px;color:#fbbf24;margin-top:5px}
.tools{display:flex;gap:6px;margin-top:6px}
.tools button{flex:1;font-size:11px;font-weight:700;border:1px solid #33333c;background:#16161c;color:#e7e7ea;border-radius:6px;padding:5px;cursor:pointer}
#out{display:none;width:100%;height:120px;margin-top:6px;background:#0e0e12;color:#cfcfd6;border:1px solid #26262e;border-radius:6px;font:11px ui-monospace,monospace;padding:6px}
main{padding:10px}
.genh{font-size:13px;font-weight:700;margin:14px 0 8px;border-left:4px solid #d97706;padding-left:8px;color:#e7e7ea}
.genh small{color:#888;font-weight:400}
.grid{display:grid;grid-template-columns:1fr;gap:12px}
.card{background:#15151a;border:1px solid #26262e;border-radius:14px;padding:10px;display:flex;flex-direction:column;gap:8px}
.card.on{outline:3px solid #22c55e;border-color:#22c55e}
.imgs{display:flex;gap:6px}
.box{flex:1;aspect-ratio:1/1;border-radius:8px;overflow:hidden;display:flex;align-items:center;justify-content:center;position:relative;
 background:linear-gradient(45deg,#1d1d22 25%,transparent 25%),linear-gradient(-45deg,#1d1d22 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#1d1d22 75%),linear-gradient(-45deg,transparent 75%,#1d1d22 75%);background-size:18px 18px;background-position:0 0,0 9px,9px -9px,-9px 0}
.box img{width:100%;height:100%;object-fit:contain;image-rendering:pixelated}
.box .lbl{position:absolute;top:3px;left:4px;font-size:9px;color:#ccc;background:#000a;padding:0 4px;border-radius:3px}
.box.noimg{color:#555;font-size:10px}
.name{font-size:13px;font-weight:600;text-align:center;min-height:18px}
.sel{font-size:12px;font-weight:700;border:1px solid #33333c;background:#1c1c22;color:#cfcfd6;border-radius:8px;padding:7px;cursor:pointer}
.card.on .sel{background:#14361f;color:#4ade80;border-color:#22c55e}
.genbadge{font-size:9px;color:#888;border:1px solid #33333c;border-radius:4px;padding:0 4px}
</style></head><body>
<header>
<h1>카탈로그 통합 — 1차(${counts('1차')}) · 2차(${counts('2차')}) · 3차(${counts('3차')})</h1>
<div class="tabs">
 <div class="tab son on" data-slot="weapon" onclick="setSlot('weapon')">무기</div>
 <div class="tab son" data-slot="armor" onclick="setSlot('armor')">방어구</div>
 <div class="tab son" data-slot="accessory" onclick="setSlot('accessory')">장신구</div>
</div>
<div class="tabs gens">
 <div class="tab gon on" data-gen="전체" onclick="setGen('전체')">전체</div>
 <div class="tab gon" data-gen="3차" onclick="setGen('3차')">3차</div>
 <div class="tab gon" data-gen="2차" onclick="setGen('2차')">2차</div>
 <div class="tab gon" data-gen="1차" onclick="setGen('1차')">1차</div>
</div>
<div class="cnt" id="cnt"></div>
<div class="tools"><button onclick="exportSel()">📋 선택 내보내기</button><button onclick="clearSel()">초기화</button></div>
<textarea id="out" readonly></textarea>
</header>
<main id="main"></main>
<script>
var DATA=${data};
var SK='compareSel_v1', slot='weapon', genFilter='전체';
function load(){try{return JSON.parse(localStorage.getItem(SK)||'{}')}catch(e){return {}}}
function save(o){localStorage.setItem(SK,JSON.stringify(o))}
function render(){
 var o=load(), gens=['3차','2차','1차'].filter(function(g){return genFilter==='전체'||genFilter===g}), h='';
 for(var gi=0;gi<gens.length;gi++){
  var g=gens[gi], items=DATA.filter(function(i){return i.slot===slot&&i.gen===g});
  if(!items.length)continue;
  h+='<div class=genh>'+g+' <small>('+items.length+')</small></div><div class=grid>';
  for(var k=0;k<items.length;k++){var it=items[k];
   var src=it.stat;
   var img=src?'<img src="'+src+'" loading=lazy>':'<span>이미지</span>';
   h+='<div class="card'+(o[it.uid]?' on':'')+'" data-uid="'+it.uid+'">'
     +'<div class="box'+(src?'':' noimg')+'">'+img+'</div>'
     +'<div class=name>'+it.name+'</div>'
     +'<button class=sel onclick="pick(\\''+it.uid+'\\')">선택</button></div>';
  }
  h+='</div>';
 }
 document.getElementById('main').innerHTML=h; updCnt();
}
function setSlot(s){slot=s;var t=document.querySelectorAll('.tab.son');for(var i=0;i<t.length;i++)t[i].classList.toggle('on',t[i].dataset.slot===s);render();window.scrollTo(0,0)}
function setGen(g){genFilter=g;var t=document.querySelectorAll('.tab.gon');for(var i=0;i<t.length;i++)t[i].classList.toggle('on',t[i].dataset.gen===g);render();window.scrollTo(0,0)}
function pick(uid){var o=load();if(o[uid])delete o[uid];else o[uid]=DATA.find(function(i){return i.uid===uid}).slot;save(o);render()}
function updCnt(){var o=load(),c={weapon:0,armor:0,accessory:0};for(var u in o)if(o[u])c[o[u]]++;document.getElementById('cnt').textContent='선택 무기 '+c.weapon+' · 방어구 '+c.armor+' · 장신구 '+c.accessory}
function exportSel(){var o=load(),g={weapon:[],armor:[],accessory:[]};for(var u in o)if(o[u])g[o[u]].push(u);
 var t='[무기 '+g.weapon.length+']\\n'+(g.weapon.join('\\n')||'-')+'\\n\\n[방어구 '+g.armor.length+']\\n'+(g.armor.join('\\n')||'-')+'\\n\\n[장신구 '+g.accessory.length+']\\n'+(g.accessory.join('\\n')||'-');
 var ta=document.getElementById('out');ta.value=t;ta.style.display='block';ta.select();try{navigator.clipboard.writeText(t)}catch(e){}}
function clearSel(){if(confirm('선택 초기화?')){localStorage.removeItem(SK);document.getElementById('out').style.display='none';render()}}
render();
</script></body></html>`;
writeFileSync(join(ROOT, 'public/catalog-compare.html'), html);
console.log(`[compare] 1차 ${counts('1차')} / 2차 ${counts('2차')} / 3차 ${counts('3차')} → public/catalog-compare.html`);
