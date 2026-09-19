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

export type ChuseokCand = {
  key: string;
  nameKo: string;
  slot: 'weapon' | 'armor' | 'accessory';
  concept: string;
  art: string;
  /** 1차(09-19 오후) · 2차(한국 사극·민담 코스튬, 09-19 저녁). */
  batch: 1 | 2;
};

export const CANDIDATES: ChuseokCand[] = [
  // ── 무기 ─────────────────────────────────────────────────────────────────
  {
    key: 'chuseok_songpyeon_fork',
    nameKo: '송편 삼지창',
    slot: 'weapon',
    batch: 1,
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
    batch: 1,
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
    batch: 1,
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
    batch: 1,
    concept: '한복',
    art:
      'a festive Korean hanbok — a short jeogori jacket with rainbow saekdong striped sleeves, a deep indigo sash tied in a long bow, ' +
      'wide pale jade baji trousers, fine gold moon-and-cloud embroidery along the hems, elegant and joyful',
  },
  {
    key: 'chuseok_moonrabbit_suit',
    nameKo: '달토끼 옷',
    slot: 'armor',
    batch: 1,
    concept: '달토끼 인형탈',
    art:
      'a plush moon rabbit costume jumpsuit — soft fluffy white fur, a round cotton tail, pink paw-pad mittens, ' +
      'a small golden full-moon patch on the chest, cute and cozy',
  },
  {
    key: 'chuseok_moon_spacesuit',
    nameKo: '달나라 우주복',
    slot: 'armor',
    batch: 1,
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
    batch: 1,
    concept: '도깨비',
    art:
      'a painted dokkaebi goblin mask — a grinning red face with two small golden horns, bold black brows and bright round eyes, ' +
      'a fringe of colorful paper tassels along the top, lively and mischievous',
  },
  {
    key: 'chuseok_fullmoon_norigae',
    nameKo: '보름달 노리개',
    slot: 'accessory',
    batch: 1,
    concept: '보름달 노리개',
    art:
      'a traditional Korean norigae ornament — a round pale jade full-moon disc framed in gold, ' +
      'a knotted crimson silk cord and long flowing silk tassels in red and gold, graceful and luminous',
  },
  {
    key: 'chuseok_bok_pouch',
    nameKo: '한가위 복주머니',
    slot: 'accessory',
    batch: 1,
    concept: '복주머니',
    art:
      'a round silk lucky pouch bokjumeoni in deep red with a gold-embroidered moon rabbit and full moon, ' +
      'a drawstring of braided five-color cord with small tassels, festive and precious',
  },
  // ══ 2차: 한국 사극·민담 코스튬(09-19 저녁, 사용자 '코스튬플레이 하기 좋은 것') ══════════════
  // 시험 아바타 교훈 — 실루엣만으로 알아보는 물건 위주(작은 장식은 아바타에서 사라진다), 머리 장신구·전신 의상은 잘 산다.
  {
    key: 'chuseok_golden_axe',
    nameKo: '금도끼',
    slot: 'weapon',
    batch: 2,
    concept: '산신령 · 금도끼 은도끼',
    art:
      'a gleaming golden axe — a broad polished gold crescent blade with a soft radiant shine, a small cloud motif engraved near the edge, ' +
      'a straight pale wooden haft bound in gold rings, legendary and radiant, clearly a one-handed axe weapon, no text, large, diagonal',
  },
  {
    key: 'chuseok_hwando',
    nameKo: '조선 환도',
    slot: 'weapon',
    batch: 2,
    concept: '조선 무관 · 사극 무사',
    art:
      'a Joseon hwando saber — a single slightly curved single-edged steel blade with a bright polished edge, a round brass guard, ' +
      'a black lacquered hilt wrapped in cord with a long red silk tassel hanging from the pommel, noble and disciplined, ' +
      'clearly a curved saber sword weapon, no text, large, diagonal',
  },
  {
    key: 'chuseok_foxfire_staff',
    nameKo: '여우불 지팡이',
    slot: 'weapon',
    batch: 2,
    concept: '구미호',
    art:
      'a nine-tailed fox spirit staff — a slender pale birch staff curling at the top around a floating orb of soft blue fox fire, ' +
      'small white fox-fur tails tied below the orb with a red cord, mystical and elegant, clearly a staff magic rod weapon, no text, large, diagonal',
  },
  {
    key: 'chuseok_gonryongpo',
    nameKo: '곤룡포',
    slot: 'armor',
    batch: 2,
    concept: '조선의 왕',
    art:
      "a Joseon king's gonryongpo dragon robe — a long crimson silk robe with round golden dragon medallions on the chest and shoulders, " +
      'a jade-plaque belt at the waist, wide sleeves with dark cuffs, majestic and regal',
  },
  {
    key: 'chuseok_dujeonggap',
    nameKo: '두정갑',
    slot: 'armor',
    batch: 2,
    concept: '조선 무관',
    art:
      'a Joseon dujeonggap brigandine coat armor — a long crimson padded coat studded with rows of round brass rivets, blue-trimmed edges, ' +
      'a leather belt, split coat skirts over dark trousers and boots, stately and martial',
  },
  {
    key: 'chuseok_reaper_dopo',
    nameKo: '저승사자 도포',
    slot: 'armor',
    batch: 2,
    concept: '저승사자',
    // 어두운 옷이라 슬롯 꼬리표의 'bright and stylish, not gothic'을 뺀 완성 프롬프트(buildArt가 그대로 쓴다).
    art:
      "a Korean grim reaper's black dopo robe — a long flowing black silk robe with very wide sleeves, a thin dark red sash tied at the chest, " +
      'a pale inner collar, solemn and elegant, a beautiful clean fantasy anime RPG gacha-game outfit, ' +
      'shown as the worn outfit on its own with no head and no neck, a slim full-length figure, a single isolated object on a plain flat empty background, pixel art',
  },
  {
    key: 'chuseok_heungnip',
    nameKo: '흑립',
    slot: 'accessory',
    batch: 2,
    concept: '선비 · 저승사자 · 사극',
    art:
      'a Joseon black gat hat — a tall translucent black horsehair crown with a very wide flat round brim, ' +
      'a long string of dark amber beads as the chin strap, refined and scholarly',
  },
  {
    key: 'chuseok_ikseongwan',
    nameKo: '익선관',
    slot: 'accessory',
    batch: 2,
    concept: '조선의 왕',
    art: "a Joseon king's ikseongwan crown hat — a black silk crown with two upright rounded wing panels at the back, a subtle gold trim, dignified and regal",
  },
  {
    key: 'chuseok_sangmo',
    nameKo: '상모',
    slot: 'accessory',
    batch: 2,
    concept: '풍물놀이',
    art:
      'a Korean pungmul sangmo hat — a small black felt hat with a colorful paper flower on top ' +
      'and a very long white paper ribbon streaming from its crown in a graceful curve, lively and festive',
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

// 직접 실행할 때만 생성한다 — 검토 페이지 빌더가 CANDIDATES만 가져다 쓸 때 유료 호출이 나가지 않게.
if (process.argv[1]?.endsWith('gen-chuseok-cand.ts')) void main();
