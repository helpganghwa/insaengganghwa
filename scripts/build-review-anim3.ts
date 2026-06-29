// 3차 61종 애니 검수 페이지 → public/review-anim3.html
// 카드: 정적이미지 + 애니(생성 시 N×256 스트립 프레임스테핑, 미생성 시 "생성 예정") + 이름 + 애니 프롬프트(action)
// 리젝 폼: 애니 / 프롬프트 각각 독립 토글 + 사유. 내보내기 시 둘을 구분해 출력.
// 입력: scripts/final-sel.json, scripts/pool-data.json, scripts/anim3-prompts.json,
//       (선택) public/sprites/anim3.json  ← 애니 생성 후 매니페스트
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const esc = (s: string) => (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const sel = JSON.parse(readFileSync(join(ROOT, 'scripts/final-sel.json'), 'utf8')) as Record<string, string[]>;
const pool = new Map((JSON.parse(readFileSync(join(ROOT, 'scripts/pool-data.json'), 'utf8')) as { id: string; slot: string; label: string }[]).map((p) => [p.id, p]));
const A = JSON.parse(readFileSync(join(ROOT, 'scripts/anim3-prompts.json'), 'utf8')) as {
  defaultFrames: number; nameOverride: Record<string, string>; itemsKo: Record<string, string>; items: Record<string, string>;
};
// 3차 한글 이름 (review120 NAME3 재사용) + nameOverride 병합. seed-는 pool label이 이미 한글.
const NAME3: Record<string, string> = {
  'w-pumpkin-witch-staff-95': '잭오랜턴 지팡이', 'w-vampire-rapier-114': '흡혈귀의 가는 검', 'w-reaper-scythe-120': '영혼을 거두는 낫',
  'w-necromancer-staff-126': '해골 강령 지팡이', 'w-assassin-twin-daggers-156': '그림자 쌍단검', 'w-ornate-flintlock-pistol-162': '장식 플린트락 권총',
  'w-celestial-greatsword-153': '천공의 대검', 'w-elven-longbow-154': '엘프의 은빛 장궁', 'w--57': '잠긴 문의 대검', 'w-thunder-spear-191': '뇌격의 창',
  'a-pumpkin-witch-outfit-96': '호박 마녀의 옷', 'a-necromancer-robe-127': '강령술사의 로브', 'a-test-gothic-lolita-150': '고딕 로리타 드레스',
  'a-test-military-coat-151': '군청 제복 코트', 'a-valkyrie-battle-dress-176': '발키리 전투복', 'a-frost-warden-coat-179': '서리 파수꾼의 외투',
  'a-paladin-armor-180': '성기사의 백금 갑주', 'a-dragon-knight-armor-186': '흑룡 기사 갑주', 'a-phoenix-dancer-dress-183': '불사조 무희의 옷',
  'a-desert-nomad-robes-231': '사막 유랑자의 의복', 'a-academy-professor-robe-234': '왕립 학원 교수복', 'a-academy-student-uniform-233': '왕립 학원 교복',
  'a-forest-ranger-outfit-240': '숲 순찰자의 옷', 'a-commander-epaulets-93': '사령관의 견장', 'a-pumpkin-witch-hat-97': '호박 마녀의 모자',
  'a-phantom-half-mask-125': '괴인의 백자 반가면', 'a-valkyrie-winged-circlet-179': '발키리 날개 서클릿', 'a-devil-horns-winged-149': '박쥐날개 뿔머리띠',
  'a-dragon-horned-helm-187': '흑룡 뿔투구', 'a-paladin-winged-helm-181': '성기사 날개 투구', 'a-frost-kite-shield-82': '서리 카이트 실드',
  'a-round-glasses-245': '둥근 안경', ...A.nameOverride,
};

// 애니 매니페스트(생성 후 존재). { cell, items: { id: { frames } } }
const animManifest = existsSync(join(ROOT, 'public/sprites/anim3.json'))
  ? (JSON.parse(readFileSync(join(ROOT, 'public/sprites/anim3.json'), 'utf8')) as { cell: number; items: Record<string, { frames: number }> })
  : { cell: 256, items: {} as Record<string, { frames: number }> };

// 로어(이름·스토리) — scripts/anim3-lore.json { id: {name, form, tone, lore} }
const lore = existsSync(join(ROOT, 'scripts/anim3-lore.json'))
  ? (JSON.parse(readFileSync(join(ROOT, 'scripts/anim3-lore.json'), 'utf8')) as Record<string, { name: string; form: string; tone: string; lore: string }>)
  : {};

type Card = { id: string; slot: string; name: string; action: string; actionKo: string; frames: number; anim: string; lore: string; meta: string };
const cards: Card[] = [];
for (const slot of ['weapon', 'armor', 'accessory']) {
  for (const uid of sel[slot] ?? []) {
    if (!uid.startsWith('v3:')) continue;
    const id = uid.slice(3);
    const p = pool.get(id);
    const lo = lore[id];
    const name = lo?.name ?? NAME3[id] ?? p?.label ?? id;
    const af = animManifest.items[id]?.frames ?? 0;
    cards.push({ id, slot, name, action: A.items[id] ?? '', actionKo: A.itemsKo[id] ?? '', frames: af, anim: af ? `sprites/anim3/${id}.webp` : '', lore: lo?.lore ?? '', meta: lo ? `${lo.form} · ${lo.tone}` : '' });
  }
}

const SLOT_KO: Record<string, string> = { weapon: '무기', armor: '방어구', accessory: '장신구' };

const card = (c: Card) => {
  const anim = c.anim
    ? `<div class="anim" data-frames="${c.frames}" style="background-image:url('${esc(c.anim)}?v=${(() => { try { return Math.round(statSync(join(ROOT, 'public', c.anim)).mtimeMs); } catch { return 0; } })()}')"></div>`
    : `<span class=ph>애니 생성 예정</span>`;
  return `<div class="card" data-id="${esc(c.id)}">
    <div class="imgs">
      <div class="box"><span class=lbl>정적</span><img src="sprites/pool/${esc(c.id)}.png" loading=lazy></div>
      <div class="box${c.anim ? '' : ' pend'}"><span class=lbl>애니</span>${anim}</div>
    </div>
    <div class="meta"><span class="nm">${esc(c.name)}</span>${c.meta ? `<span class="mt">${esc(c.meta)}</span>` : ''}<span class="id">${esc(c.id)}</span></div>
    ${c.lore ? `<div class="story">${esc(c.lore)}</div>` : '<div class="story pend">— 스토리 미작성 —</div>'}
    <div class="rejrow">
      <button class="rk rt" onclick="rej('${esc(c.id)}','story')">✕ 스토리 리젝</button>
      <input class="rs" data-k="story" placeholder="이름·스토리 리젝 사유" oninput="setReason('${esc(c.id)}','story',this.value)">
    </div>
    <div class="pr"><span class="prlbl">애니 프롬프트</span><div class="prtxt">${esc(c.actionKo)}</div><div class="pren">${esc(c.action)}</div></div>
    <div class="rejrow">
      <button class="rk ra" onclick="rej('${esc(c.id)}','anim')">✕ 애니 리젝</button>
      <input class="rs" data-k="anim" placeholder="애니 리젝 사유" oninput="setReason('${esc(c.id)}','anim',this.value)">
    </div>
    <div class="rejrow">
      <button class="rk rp" onclick="rej('${esc(c.id)}','prompt')">✕ 프롬프트 리젝</button>
      <input class="rs" data-k="prompt" placeholder="프롬프트 리젝 사유" oninput="setReason('${esc(c.id)}','prompt',this.value)">
    </div>
  </div>`;
};

const sections = (['weapon', 'armor', 'accessory'] as const).map((s) => {
  const cs = cards.filter((c) => c.slot === s);
  return `<h2>${SLOT_KO[s]} <small>(${cs.length})</small></h2><div class="grid">${cs.map(card).join('')}</div>`;
}).join('');

const NAMES = Object.fromEntries(cards.map((c) => [c.id, c.name]));

const html = `<!doctype html><html lang=ko><head><meta charset=utf-8><meta name=viewport content="width=390,user-scalable=no">
<title>3차 애니 검수 (${cards.length})</title><style>
*{box-sizing:border-box}
body{margin:0;background:#0b0b0e;color:#e7e7ea;font:14px/1.45 system-ui,sans-serif}
header{position:sticky;top:0;background:#0b0b0ef5;backdrop-filter:blur(6px);border-bottom:1px solid #222;z-index:9;padding:9px 12px}
h1{font-size:15px;margin:0}
.tools{display:flex;gap:7px;margin-top:7px;align-items:center;flex-wrap:wrap}
.tools button{font-size:12px;font-weight:700;border:1px solid #33333c;background:#16161c;color:#e7e7ea;border-radius:7px;padding:6px 10px;cursor:pointer}
#cnt{font-size:12px;color:#f87171}
#out{display:none;width:100%;height:170px;margin-top:7px;background:#0e0e12;color:#cfcfd6;border:1px solid #26262e;border-radius:7px;font:11px ui-monospace,monospace;padding:6px}
main{padding:10px 12px 60px;max-width:760px;margin:0 auto}
h2{font-size:14px;margin:18px 0 8px;border-left:4px solid #16a34a;padding-left:8px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.card{background:#15151a;border:1px solid #26262e;border-radius:14px;padding:10px;display:flex;flex-direction:column;gap:7px}
.card.rej-anim{outline:3px solid #dc2626}
.card.rej-prompt{box-shadow:inset 0 0 0 3px #d97706}
.card.rej-story{background:#241016}
.mt{font-size:9px;color:#7a7a85;background:#16161c;border:1px solid #2a2a32;border-radius:4px;padding:0 5px}
.story{font-size:12.5px;color:#e7e7ea;line-height:1.6;background:#101015;border:1px solid #23232b;border-radius:8px;padding:8px 10px;white-space:pre-line}
.story.pend{color:#5a5a62;font-style:italic}
.card.rej-story .rt{background:#3a1422;color:#f9a8d4;border-color:#db2777}
.imgs{display:flex;gap:8px}
.box{flex:1;aspect-ratio:1/1;border-radius:8px;overflow:hidden;display:flex;align-items:center;justify-content:center;position:relative;
 background:linear-gradient(45deg,#1d1d22 25%,transparent 25%),linear-gradient(-45deg,#1d1d22 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#1d1d22 75%),linear-gradient(-45deg,transparent 75%,#1d1d22 75%);background-size:16px 16px;background-position:0 0,0 8px,8px -8px,-8px 0}
.box img{width:100%;height:100%;object-fit:contain;image-rendering:pixelated}
.box.pend{color:#555;font-size:10px}
.box .lbl{position:absolute;top:3px;left:4px;font-size:9px;color:#ccc;background:#000a;padding:0 4px;border-radius:3px;z-index:2}
.anim{width:100%;height:100%;background-repeat:no-repeat;background-position:0 0;image-rendering:pixelated}
.ph{color:#555;font-size:11px;text-align:center}
.meta{display:flex;align-items:baseline;gap:6px;flex-wrap:wrap}
.nm{font-weight:700;font-size:14px}
.id{font-size:9px;color:#555;font-family:ui-monospace,monospace}
.pr{background:#101015;border:1px solid #23232b;border-radius:8px;padding:6px 8px}
.prlbl{font-size:9px;color:#7a7a85;text-transform:uppercase;letter-spacing:.04em}
.prtxt{font-size:12px;color:#dff3e7;line-height:1.5;margin-top:3px;white-space:pre-wrap}
.pren{font-size:10px;color:#6b7b72;font-family:ui-monospace,monospace;margin-top:4px;white-space:pre-wrap}
.rejrow{display:flex;gap:6px}
.rk{font-size:11px;font-weight:700;border:1px solid #3a3a44;background:#1c1c22;color:#cfcfd6;border-radius:7px;padding:5px 8px;cursor:pointer;white-space:nowrap}
.card.rej-anim .ra{background:#3a1414;color:#f87171;border-color:#dc2626}
.card.rej-prompt .rp{background:#3a2a0e;color:#fbbf24;border-color:#d97706}
.rs{flex:1;min-width:0;font-size:11px;background:#101015;color:#e7e7ea;border:1px solid #2c2c36;border-radius:7px;padding:5px 7px}
</style></head><body>
<header><h1>🟢 3차 애니 검수 — ${cards.length}종 (무기/방어구/장신구)</h1>
<div class="tools"><button onclick="exportRej()">📋 리젝 내보내기</button><button onclick="clearRej()">초기화</button><span id="cnt"></span></div>
<textarea id="out" readonly></textarea></header>
<main>${sections}</main>
<script>
var RK='reviewAnim3_v1';
var NAMES=${JSON.stringify(NAMES)};
function load(){try{return JSON.parse(localStorage.getItem(RK)||'{}')}catch(e){return {}}}
function save(o){localStorage.setItem(RK,JSON.stringify(o))}
// 구조: { id: { anim?:{reason}, prompt?:{reason} } }
function apply(){var o=load(),cs=document.querySelectorAll('.card');for(var i=0;i<cs.length;i++){var c=cs[i],e=o[c.dataset.id]||{};
 c.classList.toggle('rej-anim',!!e.anim);c.classList.toggle('rej-prompt',!!e.prompt);c.classList.toggle('rej-story',!!e.story);
 var ins=c.querySelectorAll('.rs');for(var j=0;j<ins.length;j++){var k=ins[j].dataset.k;ins[j].value=(e[k]&&e[k].reason)||''}}upd()}
function upd(){var o=load(),a=0,p=0,s=0;for(var u in o){if(o[u].anim)a++;if(o[u].prompt)p++;if(o[u].story)s++}document.getElementById('cnt').textContent='애니 '+a+' · 프롬프트 '+p+' · 스토리 '+s}
function rej(id,k){var o=load();if(!o[id])o[id]={};if(o[id][k])delete o[id][k];else o[id][k]={reason:''};if(!o[id].anim&&!o[id].prompt&&!o[id].story)delete o[id];save(o);apply()}
function setReason(id,k,v){var o=load();if(!o[id])o[id]={};if(!o[id][k])o[id][k]={};o[id][k].reason=v;save(o);upd()}
function exportRej(){var o=load(),aL=[],pL=[],sL=[];for(var u in o){
 if(o[u].anim)aL.push(u+'  |  '+(NAMES[u]||'')+(o[u].anim.reason?'  |  '+o[u].anim.reason:''));
 if(o[u].prompt)pL.push(u+'  |  '+(NAMES[u]||'')+(o[u].prompt.reason?'  |  '+o[u].prompt.reason:''));
 if(o[u].story)sL.push(u+'  |  '+(NAMES[u]||'')+(o[u].story.reason?'  |  '+o[u].story.reason:''));}
 var t='[스토리 리젝 '+sL.length+'종]\\n'+(sL.join('\\n')||'(없음)')+'\\n\\n[애니 리젝 '+aL.length+'종]\\n'+(aL.join('\\n')||'(없음)')+'\\n\\n[프롬프트 리젝 '+pL.length+'종]\\n'+(pL.join('\\n')||'(없음)');
 var ta=document.getElementById('out');ta.value=t;ta.style.display='block';ta.select();try{navigator.clipboard.writeText(t)}catch(e){}}
function clearRej(){if(confirm('리젝 표시 전체 초기화?')){localStorage.removeItem(RK);document.getElementById('out').style.display='none';apply()}}
// 애니 — 프로덕션과 동일: N프레임 스트립을 박스폭에 맞춰 120ms마다 한 프레임씩.
function startAnims(){var as=document.querySelectorAll('.anim[data-frames]');for(var i=0;i<as.length;i++){(function(el){var n=parseInt(el.dataset.frames,10);if(!n)return;var f=0;function tick(){var w=el.clientWidth;if(w){el.style.backgroundSize=(n*w)+'px '+w+'px';el.style.backgroundPositionX=(-f*w)+'px';f=(f+1)%n}}tick();setInterval(tick,120)})(as[i])}}
apply();startAnims();
</script></body></html>`;

writeFileSync(join(ROOT, 'public/review-anim3.html'), html);
const animCount = cards.filter((c) => c.anim).length;
console.log(`[review-anim3] ${cards.length}종 (애니 생성됨 ${animCount}/${cards.length}) → public/review-anim3.html`);
