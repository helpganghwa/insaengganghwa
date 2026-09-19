// 추석 아이템 후보(2026-09-19) — Pixellab **객체**(create-1-direction-object) → public/sprites/chuseok-cand/<key>.png
// 실행: bun run scripts/gen-chuseok-cand.ts --dry            (프롬프트만 출력, 호출 없음)
//       bun run scripts/gen-chuseok-cand.ts                  (누락분만 생성 — 재개형, 유료: 실행 전 사용자 확인)
//       bun run scripts/gen-chuseok-cand.ts --only=key1,key2
//
// 기존 120종과 같은 방식(gen-weapon-cand.ts 정본): 객체 · view=sidescroller · 256px(단일 후보) · 슬롯 품질 꼬리표(items-v2 buildArt).
// 키는 **key3 고정**(추석 아이템 전용, 사용자 지정) — 객체 id를 obj-map-cand.json에 key3 라벨로 즉시 기록해,
// 나중에 해방 애니(gen-anim3)를 같은 키로 붙일 수 있게 한다.
// 프롬프트: 무기는 keeper 형식("<형태·재질·색>, <형용사> and <형용사>, clearly a <종류> weapon, no text, large, diagonal"),
// 방어구·장신구는 형태 핵심 + 분위기 형용사만(과도 나열 금지, 결과만 묘사).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { config } from 'dotenv';

import { buildArt, type ItemV2 } from './items-v2';
import { scriptKeyFor } from './pixellab-script-key';

config({ path: '.env.local' });
config({ path: '.env', override: false });

const LABEL = 'key3' as const;
const PIX = 'https://api.pixellab.ai/v2';
const SIZE = 256; // >170 → 단일 후보
const ROOT = process.cwd();
const OUT_DIR = join(ROOT, 'public', 'sprites', 'chuseok-cand');
const MAP_PATH = join(ROOT, 'scripts', 'obj-map-cand.json');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type ChuseokCand = { key: string; nameKo: string; slot: 'weapon' | 'armor' | 'accessory'; concept: string; art: string };

export const CANDIDATES: ChuseokCand[] = [
  // ── 무기 ─────────────────────────────────────────────────────────────────
  {
    key: 'chuseok_songpyeon_fork',
    nameKo: '송편 삼지창',
    slot: 'weapon',
    concept: '송편 찌른 포크',
    art:
      'a giant silver three-pronged fork skewering three plump half-moon songpyeon rice cakes in pastel pink, green and white, ' +
      'a small pine sprig tied at the neck with a red silk knot, a polished silver handle, ' +
      'playful and festive, clearly a trident fork weapon, no text, large, diagonal',
  },
  {
    key: 'chuseok_moonrabbit_mallet',
    nameKo: '달토끼 떡메',
    slot: 'weapon',
    concept: '달토끼가 떡 찧는 떡메',
    art:
      'a large wooden rice-cake pounding mallet with a round barrel head of pale polished wood, ' +
      'a small white moon rabbit carved on its face beside a golden full moon inlay, a long smooth handle wrapped in red cord, ' +
      'charming and festive, clearly a mallet hammer weapon, no text, large, diagonal',
  },
  {
    key: 'chuseok_dokkaebi_club',
    nameKo: '도깨비 방망이',
    slot: 'weapon',
    concept: '도깨비 방망이',
    art:
      'a dokkaebi goblin club — a thick knobbly wooden cudgel studded with rounded iron nubs, ' +
      'tiny golden coins and sparkles spilling from its tip, a braided rope grip, ' +
      'mischievous and magical, clearly a spiked club weapon, no text, large, diagonal',
  },
  // ── 방어구 ───────────────────────────────────────────────────────────────
  {
    key: 'chuseok_hanbok',
    nameKo: '한가위 한복',
    slot: 'armor',
    concept: '한복',
    art:
      'a festive Korean hanbok — a short jeogori jacket with rainbow saekdong striped sleeves, a deep indigo sash tied in a long bow, ' +
      'wide pale jade baji trousers, fine gold moon-and-cloud embroidery along the hems, elegant and joyful',
  },
  {
    key: 'chuseok_moonrabbit_suit',
    nameKo: '달토끼 옷',
    slot: 'armor',
    concept: '달토끼 인형탈',
    art:
      'a plush moon rabbit costume jumpsuit — soft fluffy white fur, a round cotton tail, pink paw-pad mittens, ' +
      'a small golden full-moon patch on the chest, cute and cozy',
  },
  {
    key: 'chuseok_moon_spacesuit',
    nameKo: '달나라 우주복',
    slot: 'armor',
    concept: '우주복(달나라)',
    art:
      'a sleek white lunar spacesuit with soft padded segments and silver joints, a golden full-moon emblem on the chest, ' +
      'a small rabbit mission patch on the shoulder, a slim life-support pack, bright and adventurous',
  },
  // ── 장신구 ───────────────────────────────────────────────────────────────
  {
    key: 'chuseok_dokkaebi_mask',
    nameKo: '도깨비 탈',
    slot: 'accessory',
    concept: '도깨비',
    art:
      'a painted dokkaebi goblin mask — a grinning red face with two small golden horns, bold black brows and bright round eyes, ' +
      'a fringe of colorful paper tassels along the top, lively and mischievous',
  },
  {
    key: 'chuseok_fullmoon_norigae',
    nameKo: '보름달 노리개',
    slot: 'accessory',
    concept: '보름달 노리개',
    art:
      'a traditional Korean norigae ornament — a round pale jade full-moon disc framed in gold, ' +
      'a knotted crimson silk cord and long flowing silk tassels in red and gold, graceful and luminous',
  },
  {
    key: 'chuseok_bok_pouch',
    nameKo: '한가위 복주머니',
    slot: 'accessory',
    concept: '복주머니',
    art:
      'a round silk lucky pouch bokjumeoni in deep red with a gold-embroidered moon rabbit and full moon, ' +
      'a drawstring of braided five-color cord with small tassels, festive and precious',
  },
];

function promptOf(c: ChuseokCand): string {
  return buildArt({ key: c.key, slot: c.slot, art: c.art } as unknown as ItemV2);
}

/** 객체 id 즉시 기록 — 애니를 붙일 유일한 연결고리. 라벨 key3(gen-anim3가 이 키로 요청). */
function rememberObject(itemKey: string, objectId: string): void {
  let m: Record<string, { key: string; objectId: string }> = {};
  try {
    if (existsSync(MAP_PATH)) m = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
  } catch {
    m = {};
  }
  m[itemKey] = { key: LABEL, objectId };
  writeFileSync(MAP_PATH, JSON.stringify(m, null, 2) + '\n');
}

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

async function genOne(c: ChuseokCand, key: string): Promise<'ok' | 'skip' | 'fail'> {
  const out = join(OUT_DIR, `${c.key}.png`);
  if (existsSync(out)) return 'skip';
  let objectId = '';
  for (let attempt = 0; attempt < 5; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${PIX}/create-1-direction-object`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: JSON.stringify({ description: promptOf(c), size: SIZE, view: 'sidescroller' }),
      });
    } catch (e) {
      console.error(`  ${c.key} 네트워크 — 재시도: ${(e as Error).message}`);
      await sleep(2000 * 2 ** attempt);
      continue;
    }
    if (res.status === 429) {
      await sleep(3000 * 2 ** attempt);
      continue;
    }
    if (!res.ok) {
      console.error(`  ${c.key} create HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return 'fail';
    }
    const j = (await res.json()) as { object_id?: string };
    objectId = j.object_id ?? '';
    if (objectId) rememberObject(c.key, objectId);
    break;
  }
  if (!objectId) return 'fail';
  for (let i = 0; i < 100; i++) {
    await sleep(3000);
    let g: Response;
    try {
      g = await fetch(`${PIX}/objects/${objectId}`, { headers: { authorization: `Bearer ${key}` } });
    } catch {
      continue;
    }
    if (!g.ok) continue;
    const gj = (await g.json()) as { status?: string; rotation_urls?: unknown; frame_urls?: unknown; storage_urls?: unknown };
    if (gj.status === 'completed' || gj.status === 'review') {
      const url = pickUrl(gj.rotation_urls) ?? pickUrl(gj.frame_urls) ?? pickUrl(gj.storage_urls);
      if (!url) return 'fail';
      const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
      if (buf.length < 8 || buf[0] !== 0x89 || buf[1] !== 0x50) return 'fail';
      writeFileSync(out, buf);
      return 'ok';
    }
    if (gj.status === 'failed') return 'fail';
  }
  console.error(`  ${c.key} 폴링 타임아웃(객체 id 기록됨: ${objectId})`);
  return 'fail';
}

async function main(): Promise<void> {
  const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7).split(',').filter(Boolean);
  const list = only ? CANDIDATES.filter((c) => only.includes(c.key)) : CANDIDATES;
  if (process.argv.includes('--dry')) {
    for (const c of list) console.log(`[${c.slot}] ${c.key} ${c.nameKo}\n  ${promptOf(c)}\n`);
    return;
  }
  const { key, envName } = scriptKeyFor(LABEL);
  if (!key) {
    console.error(`${envName} 필요 — .env.local`);
    process.exit(1);
  }
  mkdirSync(OUT_DIR, { recursive: true });
  console.log(`추석 후보 ${list.length}종 — Pixellab 객체(sidescroller, ${SIZE}px, ${LABEL})\n`);
  let ok = 0;
  let skip = 0;
  let fail = 0;
  for (const c of list) {
    const r = await genOne(c, key); // 동시성 1 — 429 회피(파이프라인 관례)
    if (r === 'ok') ok += 1;
    else if (r === 'skip') skip += 1;
    else fail += 1;
    console.log(`  ${r === 'ok' ? '✓' : r === 'skip' ? '·' : '✗'} [${c.slot}] ${c.key.padEnd(28)} ${c.nameKo}`);
  }
  console.log(`\n완료 — 생성 ${ok} · 스킵 ${skip} · 실패 ${fail}`);
  if (fail > 0) process.exitCode = 1;
}

void main();
