// 신규 120종 아이템 스프라이트 생성 — Pixellab pixflux(128×128 투명) → public/sprites/<slot>/<key>.png
// + public/item-review.html 갱신. **두 번째 키(PIXELLAB_API_KEY_2) 전용.** 재개형(기존 파일 skip).
//
// 사용:
//   bun run scripts/gen-items.ts            # 미생성분 중 5개 생성(기본)
//   bun run scripts/gen-items.ts 5          # N개 생성
//   bun run scripts/gen-items.ts html       # 생성 없이 리뷰 HTML만 갱신
//
// 동시성 낮게(순차) + 429 지수 백오프. 유료 — 호출 전 사용자 확인.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { config } from 'dotenv';

import { ITEMS_V2, buildArt, type ItemV2 } from './items-v2';

config({ path: '.env.local' });
config({ path: '.env', override: false });

const KEY = process.env.PIXELLAB_API_KEY_2;
const ROOT = process.cwd();
const spriteFile = (it: ItemV2) => join(ROOT, 'public', 'sprites', it.slot, `${it.key}.png`);
const spriteRel = (it: ItemV2) => `sprites/${it.slot}/${it.key}.png`;

// 객체(애니 가능) 생성 — 단일 후보(size>170)로 비용·복잡도 최소화. view=sidescroller(측면 아이콘).
const PIX = 'https://api.pixellab.ai/v2';
const SIZE = 256; // >170 → 단일 후보(review 단계 없음)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** rotation_urls / frame_urls 같은 맵·배열에서 첫 유효 URL 추출. */
function pickUrl(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === 'string') return v.startsWith('http') ? v : null;
  if (Array.isArray(v)) {
    for (const x of v) {
      const u = pickUrl(x);
      if (u) return u;
    }
    return null;
  }
  if (typeof v === 'object') {
    for (const x of Object.values(v as Record<string, unknown>)) {
      const u = pickUrl(x);
      if (u) return u;
    }
  }
  return null;
}

type GenResult = { r: 'ok' | 'skip' | 'fail'; usage?: unknown };

async function genOne(it: ItemV2): Promise<GenResult> {
  const file = spriteFile(it);
  if (existsSync(file)) return { r: 'skip' };
  mkdirSync(join(ROOT, 'public', 'sprites', it.slot), { recursive: true });

  // 1) 객체 생성 요청
  let objectId = '';
  let usage: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(`${PIX}/create-1-direction-object`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
      body: JSON.stringify({ description: buildArt(it), size: SIZE, view: 'sidescroller' }),
    });
    if (res.status === 429) {
      const wait = 2000 * 2 ** attempt;
      console.error(`  ${it.key} 429 → ${wait}ms`);
      await sleep(wait);
      continue;
    }
    if (!res.ok) {
      console.error(`  ${it.key} create HTTP ${res.status}: ${(await res.text()).slice(0, 240)}`);
      return { r: 'fail' };
    }
    const j = (await res.json()) as { object_id?: string; usage?: unknown };
    objectId = j.object_id ?? '';
    usage = j.usage;
    break;
  }
  if (!objectId) return { r: 'fail', usage };

  // 2) 완료까지 폴링(최대 ~5분 — 객체가 가끔 3분 넘김)
  for (let i = 0; i < 100; i++) {
    await sleep(3000);
    const g = await fetch(`${PIX}/objects/${objectId}`, {
      headers: { authorization: `Bearer ${KEY}` },
    });
    if (!g.ok) continue;
    const gj = (await g.json()) as {
      status?: string;
      rotation_urls?: unknown;
      frame_urls?: unknown;
      storage_urls?: unknown;
    };
    if (gj.status === 'completed' || gj.status === 'review') {
      const url = pickUrl(gj.rotation_urls) ?? pickUrl(gj.frame_urls) ?? pickUrl(gj.storage_urls);
      if (!url) {
        console.error(`  ${it.key} ${gj.status} but no image url`);
        return { r: 'fail', usage };
      }
      const img = await fetch(url);
      const buf = Buffer.from(await img.arrayBuffer());
      if (buf.length < 8 || buf[0] !== 0x89 || buf[1] !== 0x50) {
        console.error(`  ${it.key} bad PNG from ${url.slice(0, 60)}`);
        return { r: 'fail', usage };
      }
      writeFileSync(file, buf);
      return { r: 'ok', usage };
    }
    if (gj.status === 'failed') {
      console.error(`  ${it.key} object failed`);
      return { r: 'fail', usage };
    }
  }
  console.error(`  ${it.key} 폴링 타임아웃(object ${objectId})`);
  return { r: 'fail', usage };
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

const TONE_COLOR: Record<string, string> = {
  화려: '#d97706', 영웅담: '#2563eb', 아름다운: '#db2777', 희망: '#059669', 전설: '#7c3aed', 수수께끼: '#475569',
};

const animFile = (it: ItemV2) => join(ROOT, 'public', 'sprites', it.slot, `${it.key}_anim.gif`);
const animRel = (it: ItemV2) => `sprites/${it.slot}/${it.key}_anim.gif`;

function writeReview(): void {
  const bySlot: Record<string, ItemV2[]> = { weapon: [], armor: [], accessory: [] };
  for (const it of ITEMS_V2) bySlot[it.slot]!.push(it);
  const done = ITEMS_V2.filter((it) => existsSync(spriteFile(it))).length;
  const SLOT_KO: Record<string, string> = { weapon: '무기', armor: '방어구', accessory: '장신구' };
  const card = (it: ItemV2) => {
    const tc = TONE_COLOR[it.tone] ?? '#475569';
    const stat = existsSync(spriteFile(it))
      ? `<img src="${spriteRel(it)}" alt="" loading="lazy">`
      : `<div class="pending">이미지<br>대기</div>`;
    const anim = existsSync(animFile(it))
      ? `<img src="${animRel(it)}" alt="" loading="lazy">`
      : `<div class="pending">애니<br>대기</div>`;
    const story = it.lore.trim()
      ? `<div class="story">${esc(it.lore)}</div>`
      : `<div class="story pend">— 이미지 확정 후 스토리 작성 —</div>`;
    return `<div class="card" data-key="${esc(it.key)}">
      <div class="imgs">
        <div class="box"><span class="lbl">정적</span>${stat}</div>
        <div class="box"><span class="lbl">애니</span>${anim}</div>
      </div>
      <div class="info">
        <div class="concept">${esc(it.concept)}</div>
        <div class="name">${esc(it.nameKo)}</div>
        <div class="badges"><span class="b" style="background:${tc}">${esc(it.tone)}</span><span class="b reg">${esc(it.region)}</span></div>
        ${story}
        <div class="key">${esc(it.key)}</div>
        <div class="rej">
          <button class="rk keep" onclick="rej('${esc(it.key)}','keep')">↻ 유지 리젝</button>
          <button class="rk change" onclick="rej('${esc(it.key)}','change')">✎ 변경 리젝</button>
        </div>
        <input class="note" data-k="${esc(it.key)}" placeholder="요구사항 메모 (선택)" oninput="setNote('${esc(it.key)}',this.value)">
      </div>
    </div>`;
  };
  const sections = (['weapon', 'armor', 'accessory'] as const)
    .filter((s) => bySlot[s].length)
    .map((s) => `<h2>${SLOT_KO[s]} <small>(${bySlot[s].length})</small></h2><div class="grid">${bySlot[s].map(card).join('')}</div>`)
    .join('');
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>아이템 리뷰 (${done}/${ITEMS_V2.length})</title>
<style>
  body{margin:0;background:#0b0b0e;color:#e7e7ea;font:14px/1.5 system-ui,sans-serif}
  header{position:sticky;top:0;background:#0b0b0eee;backdrop-filter:blur(6px);padding:12px 16px;border-bottom:1px solid #222;z-index:5}
  h1{font-size:16px;margin:0}
  .sub{color:#888;font-size:12px;margin-top:2px}
  main{padding:8px 16px 40px;max-width:1180px;margin:0 auto}
  h2{font-size:14px;margin:20px 0 8px;border-left:3px solid #d97706;padding-left:8px}
  .grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
  .card{display:flex;flex-direction:column;gap:7px;background:#15151a;border:1px solid #26262e;border-radius:12px;padding:8px}
  .imgs{display:flex;gap:6px}
  .box{position:relative;flex:1;aspect-ratio:1/1;border-radius:8px;overflow:hidden;display:flex;align-items:center;justify-content:center;background:
    linear-gradient(45deg,#222 25%,transparent 25%),linear-gradient(-45deg,#222 25%,transparent 25%),
    linear-gradient(45deg,transparent 75%,#222 75%),linear-gradient(-45deg,transparent 75%,#222 75%);
    background-size:16px 16px;background-position:0 0,0 8px,8px -8px,-8px 0}
  .box img{width:100%;height:100%;object-fit:contain;image-rendering:pixelated}
  .box .lbl{position:absolute;top:3px;left:4px;font-size:9px;color:#ccc;background:#000a;padding:0 4px;border-radius:3px}
  .pending{font-size:10px;color:#666;text-align:center;line-height:1.3}
  .info{min-width:0}
  .concept{font-size:11px;color:#9a9aa2}
  .name{font-weight:700;font-size:15px;margin:1px 0 2px}
  .badges{margin-bottom:3px}
  .b{display:inline-block;font-size:10px;font-weight:700;color:#fff;border-radius:4px;padding:1px 6px;margin-right:4px}
  .b.reg{background:#33333c;color:#bbb}
  .story{font-size:11.5px;color:#c7c7cd}
  .story.pend{color:#5a5a62;font-style:italic}
  .art{font-size:10px;color:#a9c7ff;margin-top:4px;font-family:ui-monospace,monospace;background:#161a26;border-radius:5px;padding:3px 5px;word-break:break-word}
  .key{font-size:10px;color:#55555c;margin-top:3px;font-family:ui-monospace,monospace}
  .rej{display:flex;gap:5px;margin-top:6px}
  .rk{flex:1;font-size:10.5px;font-weight:700;border:1px solid #3a3a44;background:#1c1c22;color:#cfcfd6;border-radius:6px;padding:4px 2px;cursor:pointer}
  .rk.keep:hover{border-color:#d97706;color:#fbbf24}
  .rk.change:hover{border-color:#dc2626;color:#f87171}
  .card.rej-keep{outline:2px solid #d97706}
  .card.rej-change{outline:2px solid #dc2626}
  .card.rej-keep .rk.keep{background:#3a2a0e;color:#fbbf24}
  .card.rej-change .rk.change{background:#3a1414;color:#f87171}
  .note{margin-top:5px;width:100%;box-sizing:border-box;font-size:11px;background:#101015;color:#e7e7ea;border:1px solid #2c2c36;border-radius:6px;padding:4px 6px}
  .note:focus{outline:none;border-color:#d97706}
  .card.rej-keep .note,.card.rej-change .note{border-color:#555}
  .tools{display:flex;gap:8px;align-items:center;margin-top:8px;flex-wrap:wrap}
  .tools button{font-size:12px;font-weight:700;border:1px solid #3a3a44;background:#1c1c22;color:#e7e7ea;border-radius:6px;padding:5px 10px;cursor:pointer}
  .tools button:hover{border-color:#d97706}
  #cnt{font-size:12px;color:#fbbf24}
  #out{display:none;width:100%;height:120px;margin-top:8px;background:#0e0e12;color:#cfcfd6;border:1px solid #26262e;border-radius:6px;font:11px ui-monospace,monospace;padding:6px;box-sizing:border-box}
</style></head><body>
<header><h1>아이템 리뷰 — 신규 아바타 코디 카탈로그</h1><div class="sub">상단 좌=정적 / 우=애니, 하단=이름·스토리 · 이미지 ${done}/${ITEMS_V2.length}</div>
<div class="tools"><button onclick="exportRej()">📋 리젝 내보내기</button><button onclick="clearRej()">초기화</button><span id="cnt"></span></div>
<textarea id="out" readonly placeholder="리젝 내보내기 결과 — 복사해서 전달"></textarea></header>
<main>${sections}</main>
<script>
var RK='itemRejects_v2';
function load(){try{return JSON.parse(localStorage.getItem(RK)||'{}')}catch(e){return {}}}
function save(o){localStorage.setItem(RK,JSON.stringify(o))}
function ent(o,k){return o[k]||{}}
function updCnt(){var o=load(),k=0,c=0;for(var x in o){if(o[x].mode==='keep')k++;else if(o[x].mode==='change')c++}document.getElementById('cnt').textContent='유지리젝 '+k+' · 변경리젝 '+c}
function apply(){var o=load();var cs=document.querySelectorAll('.card');for(var i=0;i<cs.length;i++){var c=cs[i];c.classList.remove('rej-keep','rej-change');var e=o[c.dataset.key];if(e&&e.mode)c.classList.add('rej-'+e.mode)}
var ns=document.querySelectorAll('.note');for(var j=0;j<ns.length;j++){var e2=o[ns[j].dataset.k];ns[j].value=(e2&&e2.note)?e2.note:''}updCnt()}
function rej(key,mode){var o=load(),e=ent(o,key);if(e.mode===mode){delete e.mode}else{e.mode=mode}if(!e.mode&&!e.note){delete o[key]}else{o[key]=e}save(o);apply()}
function setNote(key,note){var o=load(),e=ent(o,key);e.note=note;if(!note&&!e.mode){delete o[key]}else{o[key]=e}save(o);updCnt()}
function fmt(o,k){var e=o[k];return k+((e&&e.note)?'  —  '+e.note:'')}
function exportRej(){var o=load(),keep=[],chg=[];for(var k in o){if(o[k].mode==='keep')keep.push(fmt(o,k));else if(o[k].mode==='change')chg.push(fmt(o,k))}
var t='[컨셉 유지 리젝 — 같은 컨셉으로 재생성]\\n'+(keep.join('\\n')||'(없음)')+'\\n\\n[컨셉 변경 리젝 — 컨셉부터 수정]\\n'+(chg.join('\\n')||'(없음)');
var ta=document.getElementById('out');ta.value=t;ta.style.display='block';ta.select();try{navigator.clipboard.writeText(t)}catch(e){}}
function clearRej(){if(confirm('리젝 표시 전체 초기화?')){localStorage.removeItem(RK);apply();document.getElementById('out').style.display='none'}}
apply();
</script>
</body></html>`;
  writeFileSync(join(ROOT, 'public', 'item-review.html'), html);
}

/** 종류 사전 스캔(특이형 우선) — art+concept에서 첫 매칭 종류. */
const TYPE_DICT: Record<string, string[]> = {
  weapon: ['greatsword', 'greatcleaver', 'greataxe', 'warhammer', 'halberd', 'war-club', 'dual-blades', 'twin', 'rapier', 'saber', 'musket', 'rifle', 'flintlock', 'pistol', 'spear', 'scythe', 'dagger', 'glaive', 'chakram', 'longbow', 'scepter', 'mace', 'cleaver', 'axe', 'hatchet', 'cane', 'whip', 'gauntlet', 'staff', 'sword', 'blade'],
  armor: ['plate armor', 'dragon-knight armor', 'snow-plate', 'greatcoat', 'frock coat', 'longcoat', 'tabard', 'vestment', 'uniform', 'evening ensemble', 'ensemble', 'raiment', 'cuirass dress', 'cuirass', 'leathers', 'apron-dress', 'coat', 'gown', 'dress', 'robe', 'mantle', 'garb', 'outfit', 'armor', 'plate'],
  accessory: ['monocle', 'spectacles', 'glasses', 'goggles', 'half-mask', 'mask', 'locket', 'relic-tome', 'relic-book', 'tome', 'lantern', 'parasol', 'circlet', 'tiara', 'crown', 'halo', 'bouquet', 'necklace', 'horn', 'drum', 'warpaint', 'satchel', 'headpiece', 'hairpin', 'scope', 'perch', 'charm', 'orb', 'fan'],
};
function typeOf(it: ItemV2): string {
  const hay = `${it.art} ${it.concept}`.toLowerCase();
  for (const t of TYPE_DICT[it.slot] ?? []) {
    if (new RegExp(`\\b${t.replace(/[-]/g, '\\-')}s?\\b`).test(hay)) return t === 'twin' ? 'twin-blades' : t;
  }
  return '기타';
}

function printStats(): void {
  const bySlot: Record<string, Record<string, number>> = { weapon: {}, armor: {}, accessory: {} };
  for (const it of ITEMS_V2) {
    const m = bySlot[it.slot]!;
    const t = typeOf(it);
    m[t] = (m[t] ?? 0) + 1;
  }
  const SLOT_KO: Record<string, string> = { weapon: '무기', armor: '방어구', accessory: '장신구' };
  for (const slot of ['weapon', 'armor', 'accessory'] as const) {
    const entries = Object.entries(bySlot[slot]).sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((s, [, n]) => s + n, 0);
    console.log(`\n## ${SLOT_KO[slot]} (${total}종) — ${entries.length}가지 종류`);
    console.log(entries.map(([t, n]) => `${t}×${n}`).join(' · '));
  }
}

async function main(): Promise<void> {
  const arg = process.argv[2];
  if (arg === 'html') {
    writeReview();
    console.log('[gen-items] item-review.html 갱신(생성 없음).');
    return;
  }
  if (arg === 'stats') {
    printStats();
    return;
  }
  if (!KEY) {
    console.error('PIXELLAB_API_KEY_2 필요 — .env.local에 두 번째 키를 넣어줘.');
    process.exit(1);
  }
  // key-모드: 숫자/html이 아닌 인자는 생성할 key 목록으로 취급(특정 아이템만 생성/테스트).
  const keyMode = arg !== undefined && Number.isNaN(Number(arg));
  const pending = ITEMS_V2.filter((it) => !existsSync(spriteFile(it)));
  let batch: typeof ITEMS_V2;
  if (keyMode) {
    const keys = new Set(process.argv.slice(2));
    batch = ITEMS_V2.filter((it) => keys.has(it.key) && !existsSync(spriteFile(it)));
  } else {
    const n = arg ? Number(arg) : 3;
    batch = pending.slice(0, n);
  }
  const CONC = Math.max(1, Number(process.env.GEN_CONC ?? 3)); // 동시 생성 수(429 백오프로 보호)
  console.log(`[gen-items] key2 객체 생성 ${batch.length}개(미생성 ${pending.length}/${ITEMS_V2.length}). 동시 ${CONC}개+429백오프.`);
  let ok = 0, fail = 0, idx = 0;
  const worker = async () => {
    while (idx < batch.length) {
      const it = batch[idx++]!;
      const res = await genOne(it);
      console.log(`  · ${it.key} (${it.nameKo}) … ${res.r}${res.usage ? `  usage=${JSON.stringify(res.usage)}` : ''}`);
      if (res.r === 'ok') ok++;
      else if (res.r === 'fail') fail++;
      writeReview(); // 매 건 갱신 — 중간에 봐도 됨
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONC, batch.length) }, worker));
  writeReview();
  console.log(`[gen-items] 완료 — ok ${ok} / fail ${fail}. 남은 미생성 ${pending.length - ok}개.`);
  console.log('리뷰: public/item-review.html (bun dev → http://localhost:5174/item-review.html, 또는 파일 직접 열기)');
}

void main();
