// 자유 생성 풀(pool): 컨셉-온리로 자유 생성해 목록에 누적 → 갤러리에서 슬롯별 30개 선택(총 90).
// 모드:
//   seed                 — 현재 생성된 카탈로그 이미지를 풀로 가져옴(초기 후보)
//   gallery              — public/item-pool.html 재생성(선택 버튼·카운트·내보내기)
//   add <batch.json>     — [{slot,label,prompt}] 목록을 생성해 풀에 추가(이미지+데이터)
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { ITEMS_V2 } from './items-v2';

const KEY = process.env.PIXELLAB_API_KEY_2;
const PIX = 'https://api.pixellab.ai/v2';
const ROOT = process.cwd();
const POOL_DIR = join(ROOT, 'public', 'sprites', 'pool');
const DATA = join(ROOT, 'scripts', 'pool-data.json');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function pickUrl(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === 'string') return v.startsWith('http') ? v : null;
  if (Array.isArray(v)) { for (const x of v) { const u = pickUrl(x); if (u) return u; } return null; }
  if (typeof v === 'object') { for (const x of Object.values(v as Record<string, unknown>)) { const u = pickUrl(x); if (u) return u; } }
  return null;
}

type PoolItem = { id: string; slot: 'weapon' | 'armor' | 'accessory'; label: string; prompt: string };
function loadPool(): PoolItem[] { return existsSync(DATA) ? JSON.parse(readFileSync(DATA, 'utf8')) : []; }
function savePool(p: PoolItem[]): void { writeFileSync(DATA, JSON.stringify(p, null, 2)); }

const TAIL: Record<string, string> = {
  weapon: 'a beautiful clean fantasy anime RPG gacha-game weapon, bright and stylish, not gothic, a single isolated object on a plain flat empty background, large, pixel art',
  armor: 'a beautiful clean fantasy anime RPG gacha-game clothing item, bright and stylish, not gothic, shown as just the garment itself with no body and no person inside, displayed as a clean clothing wardrobe icon, no head, no legs, no figure, a single isolated object on a plain flat empty background, pixel art',
  accessory: 'a beautiful clean fantasy anime RPG gacha-game item, bright and stylish, not gothic, a single isolated object on a plain flat empty background, pixel art',
};
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 28);

async function genImage(slot: string, prompt: string): Promise<Buffer | null> {
  const full = prompt.includes('pixel art') ? prompt : `${prompt}, ${TAIL[slot] ?? TAIL.accessory}`;
  let id = '';
  for (let a = 0; a < 5; a++) {
    const res = await fetch(`${PIX}/create-1-direction-object`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
      body: JSON.stringify({ description: full, size: 256, view: 'sidescroller' }),
    });
    if (res.status === 429) { await sleep(2000 * 2 ** a); continue; }
    if (!res.ok) { console.error(`HTTP ${res.status}`); return null; }
    id = ((await res.json()) as { object_id?: string }).object_id ?? ''; break;
  }
  if (!id) return null;
  for (let i = 0; i < 100; i++) {
    await sleep(3000);
    let g: Response; try { g = await fetch(`${PIX}/objects/${id}`, { headers: { authorization: `Bearer ${KEY}` } }); } catch { continue; }
    if (!g.ok) continue;
    const gj = (await g.json()) as { status?: string; rotation_urls?: unknown; frame_urls?: unknown; storage_urls?: unknown };
    if (gj.status === 'completed' || gj.status === 'review') {
      const url = pickUrl(gj.rotation_urls) ?? pickUrl(gj.frame_urls) ?? pickUrl(gj.storage_urls);
      if (!url) return null;
      return Buffer.from(await (await fetch(url)).arrayBuffer());
    }
    if (gj.status === 'failed') return null;
  }
  return null;
}

async function add(batchFile: string): Promise<void> {
  const batch = JSON.parse(readFileSync(batchFile, 'utf8')) as { slot: PoolItem['slot']; label: string; prompt: string }[];
  mkdirSync(POOL_DIR, { recursive: true });
  const pool = loadPool();
  let ok = 0;
  const CONC = Math.max(1, Number(process.env.GEN_CONC ?? 5));
  let idx = 0;
  const results: (PoolItem | null)[] = new Array(batch.length).fill(null);
  const worker = async () => {
    while (idx < batch.length) {
      const i = idx++; const b = batch[i]!;
      const buf = await genImage(b.slot, b.prompt);
      if (!buf) { console.log(`  · [fail] ${b.slot} ${b.label}`); continue; }
      const id = `${b.slot.slice(0, 1)}-${slug(b.label)}-${pool.length + i}`;
      writeFileSync(join(POOL_DIR, `${id}.png`), buf);
      results[i] = { id, slot: b.slot, label: b.label, prompt: b.prompt };
      ok++; console.log(`  · ${b.slot} ${b.label} … ok`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONC, batch.length) }, worker));
  // 레이스 안전: 저장 직전 디스크에서 최신 풀을 다시 읽어 병합(동시 add의 유실 방지).
  const fresh = loadPool();
  const have = new Set(fresh.map((p) => p.id));
  for (const r of results) if (r && !have.has(r.id)) fresh.push(r);
  savePool(fresh);
  console.log(`[pool] add 완료 — ok ${ok}/${batch.length}, 풀 총 ${fresh.length}`);
  gallery();
}

function seed(): void {
  mkdirSync(POOL_DIR, { recursive: true });
  const pool = loadPool();
  const have = new Set(pool.map((p) => p.id));
  let added = 0;
  for (const it of ITEMS_V2) {
    const src = join(ROOT, 'public', 'sprites', it.slot, `${it.key}.png`);
    if (!existsSync(src)) continue;
    const id = `seed-${it.key}`;
    if (have.has(id)) continue;
    copyFileSync(src, join(POOL_DIR, `${id}.png`));
    pool.push({ id, slot: it.slot, label: it.nameKo, prompt: it.art });
    added++;
  }
  savePool(pool);
  console.log(`[pool] seed 완료 — ${added}종 추가(풀 총 ${pool.length})`);
}

function gallery(): void {
  const pool = loadPool();
  const SLOT_KO: Record<string, string> = { weapon: '무기', armor: '방어구', accessory: '장신구' };
  const bySlot: Record<string, PoolItem[]> = { weapon: [], armor: [], accessory: [] };
  for (const p of pool) bySlot[p.slot]?.push(p);
  const card = (p: PoolItem) => `<div class="card" data-id="${esc(p.id)}" data-slot="${p.slot}">
    <div class="box"><img src="sprites/pool/${esc(p.id)}.png" alt="" loading="lazy"></div>
    <div class="row"><button class="sel" onclick="pick('${esc(p.id)}','${p.slot}')">선택</button><button class="del" onclick="delItem('${esc(p.id)}')" title="삭제">🗑</button></div>
  </div>`;
  const sections = (['weapon', 'armor', 'accessory'] as const).map((s) =>
    `<h2>${SLOT_KO[s]} <small>(풀 ${bySlot[s].length} · 선택 <span id="cnt-${s}">0</span>/30)</small></h2><div class="grid">${bySlot[s].map(card).join('')}</div>`).join('');
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>아이템 풀 선택</title><style>
body{margin:0;background:#0b0b0e;color:#e7e7ea;font:14px/1.5 system-ui,sans-serif}
header{position:sticky;top:0;background:#0b0b0ef2;backdrop-filter:blur(6px);padding:10px 16px;border-bottom:1px solid #222;z-index:5}
h1{font-size:15px;margin:0}
.tools{display:flex;gap:8px;align-items:center;margin-top:7px;flex-wrap:wrap}
.tools button{font-size:12px;font-weight:700;border:1px solid #3a3a44;background:#1c1c22;color:#e7e7ea;border-radius:6px;padding:5px 10px;cursor:pointer}
#tot{font-size:12px;color:#fbbf24}
#out{display:none;width:100%;height:130px;margin-top:8px;background:#0e0e12;color:#cfcfd6;border:1px solid #26262e;border-radius:6px;font:11px ui-monospace,monospace;padding:6px;box-sizing:border-box}
main{padding:8px 16px 60px;max-width:1180px;margin:0 auto}
h2{font-size:14px;margin:18px 0 8px;border-left:3px solid #d97706;padding-left:8px}
.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
.card{background:#15151a;border:1px solid #26262e;border-radius:10px;padding:6px;display:flex;flex-direction:column;gap:5px}
.card.on{outline:2px solid #22c55e;border-color:#22c55e}
.box{aspect-ratio:1/1;border-radius:8px;overflow:hidden;display:flex;align-items:center;justify-content:center;
 background:linear-gradient(45deg,#222 25%,transparent 25%),linear-gradient(-45deg,#222 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#222 75%),linear-gradient(-45deg,transparent 75%,#222 75%);background-size:16px 16px;background-position:0 0,0 8px,8px -8px,-8px 0}
.box img{width:100%;height:100%;object-fit:contain;image-rendering:pixelated}
.lab{font-size:11px;color:#c7c7cd;text-align:center;min-height:15px}
.row{display:flex;gap:4px}
.sel{flex:1;font-size:11px;font-weight:700;border:1px solid #3a3a44;background:#1c1c22;color:#cfcfd6;border-radius:6px;padding:4px;cursor:pointer}
.card.on .sel{background:#14361f;color:#4ade80;border-color:#22c55e}
.del{width:30px;font-size:12px;border:1px solid #3a3a44;background:#1c1c22;border-radius:6px;cursor:pointer}
.del:hover{border-color:#dc2626;background:#3a1414}
.card.deleted{display:none}
</style></head><body>
<header><h1>아이템 풀 — 슬롯별 30개 선택 (총 90)</h1>
<div class="tools"><button onclick="exportSel()">📋 선택 내보내기</button><button onclick="clearSel()">선택 초기화</button><button onclick="restoreDel()">🗑 삭제 복원</button><span id="tot"></span></div>
<textarea id="out" readonly></textarea></header>
<main>${sections}</main>
<script>
var SK='poolSelected_v1', DK='poolDeleted_v1';
function load(){try{return JSON.parse(localStorage.getItem(SK)||'{}')}catch(e){return {}}}
function save(o){localStorage.setItem(SK,JSON.stringify(o))}
function loadD(){try{return JSON.parse(localStorage.getItem(DK)||'{}')}catch(e){return {}}}
function saveD(o){localStorage.setItem(DK,JSON.stringify(o))}
function counts(){var o=load(),d=loadD(),c={weapon:0,armor:0,accessory:0};for(var id in o){if(o[id]&&!d[id])c[o[id]]++}return c}
function refresh(){var o=load(),d=loadD();var cs=document.querySelectorAll('.card');for(var i=0;i<cs.length;i++){var c=cs[i];c.classList.toggle('deleted',!!d[c.dataset.id]);c.classList.toggle('on',!!o[c.dataset.id]&&!d[c.dataset.id])}
var cc=counts();document.getElementById('cnt-weapon').textContent=cc.weapon;document.getElementById('cnt-armor').textContent=cc.armor;document.getElementById('cnt-accessory').textContent=cc.accessory;
document.getElementById('tot').textContent='선택 무기 '+cc.weapon+'/30 · 방어구 '+cc.armor+'/30 · 장신구 '+cc.accessory+'/30';}
function pick(id,slot){var o=load();if(o[id]){delete o[id]}else{o[id]=slot}save(o);refresh()}
function delItem(id){var d=loadD();d[id]=true;saveD(d);var o=load();if(o[id]){delete o[id];save(o)}refresh()}
function restoreDel(){if(confirm('삭제한 항목 전체 복원?')){localStorage.removeItem(DK);refresh()}}
function exportSel(){var o=load(),g={weapon:[],armor:[],accessory:[]};for(var id in o){if(o[id])g[o[id]].push(id)}
var t='[선택 — 무기 '+g.weapon.length+']\\n'+(g.weapon.join('\\n')||'(없음)')+'\\n\\n[선택 — 방어구 '+g.armor.length+']\\n'+(g.armor.join('\\n')||'(없음)')+'\\n\\n[선택 — 장신구 '+g.accessory.length+']\\n'+(g.accessory.join('\\n')||'(없음)');
var ta=document.getElementById('out');ta.value=t;ta.style.display='block';ta.select();try{navigator.clipboard.writeText(t)}catch(e){}}
function clearSel(){if(confirm('선택 전체 초기화?')){localStorage.removeItem(SK);refresh();document.getElementById('out').style.display='none'}}
refresh();
</script></body></html>`;
  writeFileSync(join(ROOT, 'public', 'item-pool.html'), html);
  console.log(`[pool] gallery 갱신 — public/item-pool.html (풀 ${pool.length})`);
}

const mode = process.argv[2];
if (mode === 'seed') { seed(); gallery(); }
else if (mode === 'gallery') { gallery(); }
else if (mode === 'add') { if (!KEY) { console.error('PIXELLAB_API_KEY_2 필요'); process.exit(1); } await add(process.argv[3]!); }
else { console.error('mode: seed | gallery | add <batch.json>'); }
