// 최종 120종 리뷰 페이지 → public/review120.html
// 카드: 정적이미지 + 애니(2차만, CSS steps(15)) + 이름 + 스토리(2차 lore) + 리젝(사유 입력)
// 2차=기존 4데이터(정적/애니/이름/lore). 1·3차=정적+이름만(애니·스토리는 "생성 예정").
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const esc = (s: string) => (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// 3차(신규) 한글 이름 (seed-는 pool label이 이미 한글)
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
  'a-round-glasses-245': '둥근 안경',
};

// 데이터 소스
const v1 = new Map((JSON.parse(readFileSync(join(ROOT, 'scripts/v1-catalog.json'), 'utf8')) as { key: string; slot: string; name: string }[]).map((i) => [i.key, i]));
const pool = new Map((JSON.parse(readFileSync(join(ROOT, 'scripts/pool-data.json'), 'utf8')) as { id: string; slot: string; label: string }[]).map((p) => [p.id, p]));
// 2차: catalog-next 객체 단위 파싱 (key/nameKo/lore)
const v2src = readFileSync(join(ROOT, 'lib/game/equipment/catalog-next.ts'), 'utf8');
const v2 = new Map<string, { name: string; lore: string }>();
for (const chunk of v2src.split(/"key"\s*:/).slice(1)) {
  const key = chunk.match(/^\s*"([a-z_0-9]+)"/)?.[1];
  const name = chunk.match(/"nameKo"\s*:\s*"([^"]*)"/)?.[1] ?? '';
  const lore = chunk.match(/"lore"\s*:\s*"([\s\S]*?)"\s*,\s*"art"/)?.[1] ?? '';
  if (key) v2.set(key, { name, lore });
}

const ANIM = JSON.parse(readFileSync(join(ROOT, 'public/sprites/anim.json'), 'utf8')) as { cell: number; items: Record<string, { frames: number }> };

type Card = { uid: string; gen: '1차' | '2차' | '3차'; slot: string; name: string; story: string; stat: string; anim: string; frames: number };

function resolve(uid: string, slot: string): Card | null {
  const [g, ...rest] = uid.split(':');
  const id = rest.join(':');
  if (g === 'v1') {
    const it = v1.get(id);
    if (!it) return null;
    return { uid, gen: '1차', slot, name: it.name, story: '', stat: `_compare/v1/${it.slot}/${it.key}.png`, anim: '', frames: 0 };
  }
  if (g === 'v2') {
    const it = v2.get(id);
    const af = ANIM.items[id]?.frames ?? 0;
    // 2차 slot은 sprites 경로용 — 원래 slot 추정(catalog-next에서). 간단히 파일 존재로 탐색.
    const slotGuess = ['weapon', 'armor', 'accessory'].find((s) => existsSync(join(ROOT, 'public/sprites', s, `${id}.png`))) ?? slot;
    return { uid, gen: '2차', slot, name: it?.name ?? id, story: it?.lore ?? '', stat: `sprites/${slotGuess}/${id}.png`, anim: af ? `sprites/anim/${id}.webp` : '', frames: af };
  }
  const it = pool.get(id);
  if (!it) return null;
  return { uid, gen: '3차', slot, name: NAME3[id] ?? (/[가-힣]/.test(it.label) ? it.label : it.label), story: '', stat: `sprites/pool/${id}.png`, anim: '', frames: 0 };
}

const sel = JSON.parse(readFileSync(join(ROOT, 'scripts/final-sel.json'), 'utf8')) as Record<string, string[]>;
const cards: Card[] = [];
for (const slot of ['weapon', 'armor', 'accessory']) for (const uid of sel[slot] ?? []) { const c = resolve(uid, slot); if (c) cards.push(c); }

const SLOT_KO: Record<string, string> = { weapon: '무기', armor: '방어구', accessory: '장신구' };

const card = (c: Card) => {
  const stat = c.stat ? `<img src="${esc(c.stat)}" loading=lazy>` : '<span class=ph>이미지</span>';
  const anim = c.gen === '2차' && c.anim
    ? `<div class="box"><span class=lbl>애니</span><div class="anim" data-frames="${c.frames}" style="background-image:url('${esc(c.anim)}')"></div></div>`
    : `<div class="box pend"><span class=lbl>애니</span><span class=ph>생성 예정</span></div>`;
  const story = c.gen === '2차'
    ? `<div class="story">${esc(c.story)}</div>`
    : `<div class="story pend">— 스토리 생성 예정 —</div>`;
  return `<div class="card" data-uid="${esc(c.uid)}">
    <div class="imgs">
      <div class="box"><span class=lbl>정적</span>${stat}</div>
      ${anim}
    </div>
    <div class="meta"><span class="gb g${c.gen[0]}">${c.gen}</span><span class="nm">${esc(c.name)}</span></div>
    ${story}
    <div class="rej"><button class="rk" onclick="rej('${esc(c.uid)}')">✕ 리젝</button>
      <input class="rs" placeholder="리젝 사유" oninput="setReason('${esc(c.uid)}',this.value)"></div>
  </div>`;
};

const sections = (['weapon', 'armor', 'accessory'] as const).map((s) => {
  const cs = cards.filter((c) => c.slot === s);
  return `<h2>${SLOT_KO[s]} <small>(${cs.length})</small></h2><div class="grid">${cs.map(card).join('')}</div>`;
}).join('');

const html = `<!doctype html><html lang=ko><head><meta charset=utf-8><meta name=viewport content="width=390,user-scalable=no">
<title>최종 120종 리뷰</title><style>
*{box-sizing:border-box}
body{margin:0;background:#0b0b0e;color:#e7e7ea;font:14px/1.45 system-ui,sans-serif}
header{position:sticky;top:0;background:#0b0b0ef5;backdrop-filter:blur(6px);border-bottom:1px solid #222;z-index:9;padding:9px 12px}
h1{font-size:15px;margin:0}
.tools{display:flex;gap:7px;margin-top:7px;align-items:center}
.tools button{font-size:12px;font-weight:700;border:1px solid #33333c;background:#16161c;color:#e7e7ea;border-radius:7px;padding:6px 10px;cursor:pointer}
#cnt{font-size:12px;color:#f87171}
#out{display:none;width:100%;height:150px;margin-top:7px;background:#0e0e12;color:#cfcfd6;border:1px solid #26262e;border-radius:7px;font:11px ui-monospace,monospace;padding:6px}
main{padding:10px 12px 60px;max-width:760px;margin:0 auto}
h2{font-size:14px;margin:18px 0 8px;border-left:4px solid #d97706;padding-left:8px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.card{background:#15151a;border:1px solid #26262e;border-radius:14px;padding:10px;display:flex;flex-direction:column;gap:7px}
.card.rejected{outline:3px solid #dc2626;opacity:.65}
.imgs{display:flex;gap:8px}
.box{flex:1;aspect-ratio:1/1;border-radius:8px;overflow:hidden;display:flex;align-items:center;justify-content:center;position:relative;
 background:linear-gradient(45deg,#1d1d22 25%,transparent 25%),linear-gradient(-45deg,#1d1d22 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#1d1d22 75%),linear-gradient(-45deg,transparent 75%,#1d1d22 75%);background-size:16px 16px;background-position:0 0,0 8px,8px -8px,-8px 0}
.box img{width:100%;height:100%;object-fit:contain;image-rendering:pixelated}
.box.pend{flex-direction:column;color:#555;font-size:10px}
.box .lbl{position:absolute;top:3px;left:4px;font-size:9px;color:#ccc;background:#000a;padding:0 4px;border-radius:3px;z-index:2}
.anim{width:100%;height:100%;background-repeat:no-repeat;background-position:0 0;image-rendering:pixelated}
.ph{color:#555;font-size:11px}
.meta{display:flex;align-items:center;gap:6px}
.gb{font-size:9px;font-weight:700;border-radius:4px;padding:1px 5px}
.g1{background:#334155;color:#cbd5e1}.g2{background:#3a2a0e;color:#fbbf24}.g3{background:#14361f;color:#4ade80}
.nm{font-weight:700;font-size:14px}
.story{font-size:11.5px;color:#c7c7cd}
.story.pend{color:#5a5a62;font-style:italic}
.rej{display:flex;gap:6px;margin-top:2px}
.rk{font-size:11px;font-weight:700;border:1px solid #3a3a44;background:#1c1c22;color:#cfcfd6;border-radius:7px;padding:5px 8px;cursor:pointer;white-space:nowrap}
.card.rejected .rk{background:#3a1414;color:#f87171;border-color:#dc2626}
.rs{flex:1;min-width:0;font-size:11px;background:#101015;color:#e7e7ea;border:1px solid #2c2c36;border-radius:7px;padding:5px 7px}
</style></head><body>
<header><h1>최종 120종 리뷰 — 무기/방어구/장신구</h1>
<div class="tools"><button onclick="exportRej()">📋 리젝 내보내기</button><button onclick="clearRej()">초기화</button><span id="cnt"></span></div>
<textarea id="out" readonly></textarea></header>
<main>${sections}</main>
<script>
var RK='review120_v1';
var NAMES=${JSON.stringify(Object.fromEntries(cards.map((c) => [c.uid, c.name])))};
function load(){try{return JSON.parse(localStorage.getItem(RK)||'{}')}catch(e){return {}}}
function save(o){localStorage.setItem(RK,JSON.stringify(o))}
function apply(){var o=load(),cs=document.querySelectorAll('.card');for(var i=0;i<cs.length;i++){var c=cs[i],e=o[c.dataset.uid];c.classList.toggle('rejected',!!e);var inp=c.querySelector('.rs');if(e&&typeof e.reason==='string')inp.value=e.reason}upd()}
function upd(){var o=load(),n=0;for(var u in o)n++;document.getElementById('cnt').textContent='리젝 '+n+'종'}
function rej(uid){var o=load();if(o[uid])delete o[uid];else o[uid]={reason:''};save(o);apply()}
function setReason(uid,v){var o=load();if(!o[uid])o[uid]={};o[uid].reason=v;save(o);upd()}
function exportRej(){var o=load(),lines=[];for(var u in o){lines.push(u+'  |  '+(NAMES[u]||'')+(o[u].reason?'  |  '+o[u].reason:''))}
 var t='[리젝 '+lines.length+'종]\\n'+(lines.join('\\n')||'(없음)');
 var ta=document.getElementById('out');ta.value=t;ta.style.display='block';ta.select();try{navigator.clipboard.writeText(t)}catch(e){}}
function clearRej(){if(confirm('리젝 표시 전체 초기화?')){localStorage.removeItem(RK);document.getElementById('out').style.display='none';apply()}}
// 2차 애니 — 프로덕션과 동일: 15프레임 스트립을 박스폭에 맞춰 120ms마다 한 프레임씩.
function startAnims(){var as=document.querySelectorAll('.anim[data-frames]');for(var i=0;i<as.length;i++){(function(el){var n=parseInt(el.dataset.frames,10);if(!n)return;var f=0;function tick(){var w=el.clientWidth;if(w){el.style.backgroundSize=(n*w)+'px '+w+'px';el.style.backgroundPositionX=(-f*w)+'px';f=(f+1)%n}}tick();setInterval(tick,120)})(as[i])}}
apply();startAnims();
</script></body></html>`;
writeFileSync(join(ROOT, 'public/review120.html'), html);
const byGen = { '1차': 0, '2차': 0, '3차': 0 } as Record<string, number>;
for (const c of cards) byGen[c.gen]++;
console.log(`[review120] ${cards.length}종 (1차 ${byGen['1차']}/2차 ${byGen['2차']}/3차 ${byGen['3차']}) → public/review120.html`);
