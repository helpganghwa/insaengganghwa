// 할로윈 아이템 후보(2026-10-20) — Pixellab **객체**(create-1-direction-object) → public/sprites/halloween-cand/<key>.png
// 실행: bun run scripts/gen-halloween-cand.ts --dry            (프롬프트만 출력, 호출 없음)
//       bun run scripts/gen-halloween-cand.ts                  (누락분만 생성 — 재개형, 유료: 실행 전 사용자 확인)
//       bun run scripts/gen-halloween-cand.ts --only=key1,key2
//       bun run scripts/gen-halloween-cand.ts --concurrency=4     (동시 4개)
//
// 추석 후보(gen-chuseok-cand.ts)와 같은 방식: 객체 · view=sidescroller · 256px(단일 후보) · 키는 key3 고정.
// 객체 id는 obj-map-cand.json에 key3 라벨로 즉시 기록해, 해방 애니(gen-anim3)를 같은 키로 붙인다.
// 1차(10-20): 네 세트(대장장이·유령 신부·프랑켄슈타인·유령 저택 메이드) × 3부위 × 2안 = 24장.
// 꼬리표: 밝은 세트(대장장이)는 items-v2 꼬리표 그대로, 어두운 세트는 'bright and stylish, not gothic'을 뺀 꼬리표(완성 프롬프트).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { config } from 'dotenv';

import { scriptKeyFor } from './pixellab-script-key';

config({ path: '.env.local' });
config({ path: '.env', override: false });

const LABEL = 'key3' as const;
const PIX = 'https://api.pixellab.ai/v2';
const SIZE = 256;
const ROOT = process.cwd();
const OUT_DIR = join(ROOT, 'public', 'sprites', 'halloween-cand');
const MAP_PATH = join(ROOT, 'scripts', 'obj-map-cand.json');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Slot = 'weapon' | 'armor' | 'accessory';
export type HalloweenCand = {
  key: string;
  nameKo: string;
  set: 'smith' | 'bride' | 'frank' | 'maid' | 'smith2' | 'ghost' | 'orc' | 'skeleton';
  slot: Slot;
  /** 밝은 세트는 items-v2 꼬리표(not gothic), 어두운 세트는 할로윈 꼬리표. */
  tone: 'bright' | 'dark' | 'costume';
  concept: string;
  art: string;
  batch: 1 | 2;
};

const TAIL_BRIGHT: Record<Slot, string> = {
  weapon: 'a beautiful clean fantasy anime RPG gacha-game weapon, bright and stylish, not gothic, a single isolated object on a plain flat empty background, large, pixel art',
  armor: 'a beautiful clean fantasy anime RPG gacha-game outfit, bright and stylish, not gothic, shown as the worn outfit on its own with no head and no neck, a slim full-length figure, a single isolated object on a plain flat empty background, pixel art',
  accessory: 'a beautiful clean fantasy anime RPG gacha-game item, bright and stylish, not gothic, a single isolated object on a plain flat empty background, pixel art',
};
const TAIL_DARK: Record<Slot, string> = {
  weapon: 'a beautiful clean fantasy anime RPG gacha-game weapon, elegant and stylish, a single isolated object on a plain flat empty background, large, pixel art',
  armor: 'a beautiful clean fantasy anime RPG gacha-game outfit, elegant and stylish, shown as the worn outfit on its own with no head and no neck, a slim full-length figure, a single isolated object on a plain flat empty background, pixel art',
  accessory: 'a beautiful clean fantasy anime RPG gacha-game item, elegant and stylish, a single isolated object on a plain flat empty background, pixel art',
};

// 2차 분장 세트 — 할로윈 축제 분장 옷 느낌(귀엽고 장난스럽게), 고딕 금지 꼬리표는 뺀다.
const TAIL_COSTUME: Record<Slot, string> = {
  weapon: 'a beautiful clean fantasy anime RPG gacha-game Halloween costume weapon, cute and festive, a single isolated object on a plain flat empty background, large, pixel art',
  armor: 'a beautiful clean fantasy anime RPG gacha-game Halloween costume outfit, cute and festive, shown as the worn outfit on its own with no head and no neck, a slim full-length figure, a single isolated object on a plain flat empty background, pixel art',
  accessory: 'a beautiful clean fantasy anime RPG gacha-game Halloween costume item, cute and festive, a single isolated object on a plain flat empty background, pixel art',
};

export const SET_NAME: Record<HalloweenCand['set'], string> = {
  smith: '대장장이',
  bride: '유령 신부',
  frank: '프랑켄슈타인',
  maid: '유령 저택 메이드',
  smith2: '대장장이(2차)',
  ghost: '유령 분장',
  orc: '오크 분장',
  skeleton: '해골 분장',
};

export const CANDIDATES: HalloweenCand[] = [
  // ══ 대장장이 ══════════════════════════════════════════════════════════════
  {
    key: 'hw_smith_tongs_a', nameKo: '달군 쇠 집게(쇳덩이)', set: 'smith', slot: 'weapon', tone: 'bright', batch: 1,
    concept: '긴 집게가 벌겋게 달군 쇳덩이를 물고 있음, 불똥',
    art:
      'a pair of long blacksmith tongs of dark forged iron, the jaws gripping a glowing orange-hot iron bar with bright sparks flying from its tip, ' +
      'a riveted pivot, handles wrapped in worn brown leather, sturdy and fiery, clearly a tongs weapon, no text, large, diagonal',
  },
  {
    key: 'hw_smith_tongs_b', nameKo: '달군 쇠 집게(편자)', set: 'smith', slot: 'weapon', tone: 'bright', batch: 1,
    concept: '집게가 달군 편자를 물고 있음, 놋쇠 리벳',
    art:
      'long heavy iron smithing tongs with a glowing red-hot horseshoe clamped in the jaws, ember sparks scattering, dark steel with brass rivets, ' +
      'handles bound in dark leather cord, rugged and fiery, clearly a tongs weapon, no text, large, diagonal',
  },
  {
    key: 'hw_smith_apron_a', nameKo: '그을린 가죽 앞치마(갈색)', set: 'smith', slot: 'armor', tone: 'bright', batch: 1,
    concept: '두꺼운 갈색 가죽 앞치마, 소매 걷은 셔츠',
    art:
      'a blacksmith outfit: a thick dark brown leather apron with scorch marks and small ember burns, worn over a cream linen shirt with the sleeves rolled to the elbow, ' +
      'a wide belt with a brass buckle, dark trousers and heavy boots, sturdy and warm',
  },
  {
    key: 'hw_smith_apron_b', nameKo: '그을린 가죽 앞치마(잿빛)', set: 'smith', slot: 'armor', tone: 'bright', batch: 1,
    concept: '잿빛 가죽 앞치마에 놋쇠 리벳, 붉은 셔츠',
    art:
      'a smith work outfit: a heavy charcoal-gray leather apron with brass rivets and a scorched hem, over a rust-red shirt with rolled sleeves, ' +
      'thick leather gloves tucked in the belt, dark work trousers and boots, rugged and dependable',
  },
  {
    key: 'hw_smith_belt_a', nameKo: '연장 벨트(망치·줄·정)', set: 'smith', slot: 'accessory', tone: 'bright', batch: 1,
    concept: '가죽 벨트에 작은 망치·줄·정',
    art:
      'a blacksmith tool belt: a wide dark leather belt with a heavy brass buckle, a small iron hammer, a rasp file and a chisel hanging from leather loops, ' +
      'a small leather pouch at the side, rugged and practical',
  },
  {
    key: 'hw_smith_belt_b', nameKo: '연장 벨트(고리식)', set: 'smith', slot: 'accessory', tone: 'bright', batch: 1,
    concept: '놋쇠 고리에 망치·집게·펀치, 철사 뭉치',
    art:
      'a leather smith belt with a square iron buckle, a hammer, small tongs and a punch hanging from brass rings, a coil of wire and a small pouch of nails, ' +
      'worn and sturdy',
  },
  // ══ 유령 신부 ═════════════════════════════════════════════════════════════
  {
    key: 'hw_bride_candelabra_a', nameKo: '꺼지지 않는 촛대(세 갈래)', set: 'bride', slot: 'weapon', tone: 'dark', batch: 1,
    concept: '세 갈래 은촛대, 푸른 촛불, 흐르는 촛농',
    art:
      'a tall three-branched tarnished silver candelabra with three pale candles burning with ghostly blue flames, wax dripping down the arms, ' +
      'an ornate twisted stem and a heavy filigree base, haunting and elegant, clearly a candelabra weapon, no text, large, diagonal',
  },
  {
    key: 'hw_bride_candelabra_b', nameKo: '꺼지지 않는 촛대(덩굴 팔)', set: 'bride', slot: 'weapon', tone: 'dark', batch: 1,
    concept: '덩굴처럼 감긴 팔, 거미줄, 푸른 불꽃',
    art:
      'an ornate silver candelabra with three arms curling like vines, three white candles with flickering pale blue flames, thin cobweb strands between the arms, ' +
      'a long slender stem ending in a spiked base, ghostly and elegant, clearly a candelabra mace weapon, no text, large, diagonal',
  },
  {
    key: 'hw_bride_dress_a', nameKo: '빛바랜 웨딩드레스(새틴)', set: 'bride', slot: 'armor', tone: 'dark', batch: 1,
    concept: '푸르스름한 흰 새틴, 찢긴 밑단, 레이스 소매',
    art:
      'a faded ghost bride wedding dress: pale bluish-white satin with a torn tattered hem, long sheer lace sleeves, a satin ribbon at the waist, ' +
      'a faint blue glow along the edges, haunting and elegant',
  },
  {
    key: 'hw_bride_dress_b', nameKo: '빛바랜 웨딩드레스(튤)', set: 'bride', slot: 'armor', tone: 'dark', batch: 1,
    concept: '은실 자수 보디스, 겹겹 튤 치마가 길게 끌림',
    art:
      'an old wedding gown in ghostly white with a pale blue tint, a fitted bodice with silver thread embroidery, a long ragged trailing skirt of layered tulle, ' +
      'thin silver lace at the neckline, delicate and eerie',
  },
  {
    key: 'hw_bride_veil_a', nameKo: '검은 면사포(장미 티아라)', set: 'bride', slot: 'accessory', tone: 'dark', batch: 1,
    concept: '뒤로 넘긴 검은 레이스 면사포, 검은 장미 은 티아라',
    art:
      'a black lace bridal veil swept back behind the head, held by a small silver tiara of dark roses, long sheer black tulle flowing down the back, ' +
      'mournful and elegant',
  },
  {
    key: 'hw_bride_veil_b', nameKo: '검은 면사포(시든 장미 화관)', set: 'bride', slot: 'accessory', tone: 'dark', batch: 1,
    concept: '시든 흰 장미 화관에 달린 긴 검은 면사포',
    art:
      'a long black wedding veil thrown back behind the head, attached to a wreath of withered white roses and silver leaves, translucent black mesh with lace edging, ' +
      'haunting and graceful',
  },
  // ══ 프랑켄슈타인 ══════════════════════════════════════════════════════════
  {
    key: 'hw_frank_wrench_a', nameKo: '볼트 조이는 거대 스패너(구리)', set: 'frank', slot: 'weapon', tone: 'dark', batch: 1,
    concept: '구리색 거대 스패너, 턱에 전기 불꽃',
    art:
      'a giant heavy copper wrench with a wide open jaw, crackling blue-white electric sparks arcing across the jaw, a thick riveted handle with a dark rubber grip, ' +
      'powerful and electric, clearly a wrench weapon, no text, large, diagonal',
  },
  {
    key: 'hw_frank_wrench_b', nameKo: '볼트 조이는 거대 스패너(코일)', set: 'frank', slot: 'weapon', tone: 'dark', batch: 1,
    concept: '낡은 구리·놋쇠, 초록 코일, 전기 아크',
    art:
      'an oversized spanner wrench of weathered copper and brass, a glowing green lightning coil wrapped around the handle and bright electric arcs at the jaw, ' +
      'bold and electric, clearly a wrench club weapon, no text, large, diagonal',
  },
  {
    key: 'hw_frank_jacket_a', nameKo: '꿰맨 자국 재킷(초록·갈색)', set: 'frank', slot: 'armor', tone: 'dark', batch: 1,
    concept: '짧은 소매, 굵은 검은 십자 실밥, 기운 천',
    art:
      'a patchwork monster jacket: a dark green and brown short-sleeved jacket stitched together from mismatched cloth with thick black cross stitches, ' +
      'a ragged collar, dark trousers with torn cuffs, scrappy and bold',
  },
  {
    key: 'hw_frank_jacket_b', nameKo: '꿰맨 자국 재킷(올리브·회색)', set: 'frank', slot: 'armor', tone: 'dark', batch: 1,
    concept: '올리브·회색 기운 천, 거친 검은 실, 큰 단추',
    art:
      'a stitched-up jacket in faded olive and gray patches sewn with coarse black thread, short frayed sleeves, large mismatched buttons, ' +
      'dark trousers with patched knees, rough and striking',
  },
  {
    key: 'hw_frank_choker_a', nameKo: '목 볼트 초커(가죽)', set: 'frank', slot: 'accessory', tone: 'dark', batch: 1,
    concept: '검은 가죽 초커, 양쪽 쇠 볼트, 불꽃',
    art:
      'a monster neck bolt choker: a dark leather collar with a large iron bolt on each side, small electric sparks between the bolts, riveted edges, ' +
      'bold and electric',
  },
  {
    key: 'hw_frank_choker_b', nameKo: '목 볼트 초커(금속)', set: 'frank', slot: 'accessory', tone: 'dark', batch: 1,
    concept: '금속 초커, 놋쇠 볼트, 초록 보석',
    art:
      'a thick metal choker collar with two protruding brass bolts and a glowing green gem in the center, small lightning sparks jumping between the bolts, ' +
      'industrial and striking',
  },
  // ══ 유령 저택 메이드 ══════════════════════════════════════════════════════
  {
    key: 'hw_maid_duster_a', nameKo: '깃털 먼지떨이(검은 깃털)', set: 'maid', slot: 'weapon', tone: 'dark', batch: 1,
    concept: '윤기 나는 검은 깃털, 은 손잡이, 검은 리본',
    art:
      'a long feather duster with a full plume of glossy black feathers and a slim polished silver handle, a thin black ribbon tied at the neck, ' +
      'elegant and playful, clearly a feather duster weapon, no text, large, diagonal',
  },
  {
    key: 'hw_maid_duster_b', nameKo: '깃털 먼지떨이(유령불)', set: 'maid', slot: 'weapon', tone: 'dark', batch: 1,
    concept: '검은·보라 깃털 끝에 푸른 빛, 은 손잡이',
    art:
      'a feather duster with a wide fan of black and dark purple feathers glowing pale blue at the tips, an ornate silver handle with a small ring at the end, ' +
      'elegant and eerie, clearly a feather duster weapon, no text, large, diagonal',
  },
  {
    key: 'hw_maid_dress_a', nameKo: '메이드 드레스(긴 소매)', set: 'maid', slot: 'armor', tone: 'dark', batch: 1,
    concept: '검은 긴 소매 드레스, 흰 프릴 앞치마, 흰 레이스 커프스',
    art:
      'a haunted manor maid dress: a black long-sleeved dress with a frilly white apron, white lace cuffs and collar, a black ribbon bow at the chest, ' +
      'white stockings and black shoes, neat and elegant',
  },
  {
    key: 'hw_maid_dress_b', nameKo: '메이드 드레스(퍼프 소매)', set: 'maid', slot: 'armor', tone: 'dark', batch: 1,
    concept: '퍼프 짧은 소매, 흰 러플 앞치마, 보라 리본, 긴 흰 장갑',
    art:
      'a gothic maid uniform: a black dress with puffed short sleeves, a white ruffled apron with lace trim, a dark purple ribbon at the collar, ' +
      'long white gloves and black stockings, prim and elegant',
  },
  {
    key: 'hw_maid_cap_a', nameKo: '레이스 머리 장식(리본)', set: 'maid', slot: 'accessory', tone: 'dark', batch: 1,
    concept: '흰 레이스 캡 밴드, 작은 검은 리본',
    art:
      'a white lace maid headdress: a frilled white lace cap band with a small black ribbon bow, delicate and neat',
  },
  {
    key: 'hw_maid_cap_b', nameKo: '레이스 머리 장식(거미 장식)', set: 'maid', slot: 'accessory', tone: 'dark', batch: 1,
    concept: '흰 러플 레이스 머리띠, 검은 리본 두 가닥, 작은 은 거미',
    art:
      'a white ruffled lace maid headband with two trailing black ribbons and a tiny silver spider charm, dainty and eerie',
  },
  // ══ 2차(10-23): 대장장이(유머) · 유령 분장 · 오크 분장 · 해골 분장 — 세트마다 1안씩 12장 ══
  {
    key: 'hw2_smith_hammer', nameKo: '말하는 담금망치', set: 'smith2', slot: 'weapon', tone: 'bright', batch: 2,
    concept: '망치 머리에 투덜대는 얼굴(부릅뜬 눈·팔자 콧수염·벌린 입), 머리 끝이 달아올라 있음',
    art:
      'a sturdy blacksmith forging hammer whose dark iron head has a grumpy cartoon face: big glaring eyes, bushy eyebrows, a thick curled mustache and an open shouting mouth, ' +
      'one end of the head glowing orange-hot with tiny sparks, a worn wooden handle wrapped in leather, funny and charming, clearly a hammer weapon, no text, large, diagonal',
  },
  {
    key: 'hw2_smith_apron', nameKo: '손때 묻은 가죽 앞치마', set: 'smith2', slot: 'armor', tone: 'bright', batch: 2,
    concept: '평범한 갈색 가죽 앞치마, 소매 걷은 셔츠',
    art:
      'a plain blacksmith work outfit: a simple brown leather apron over a cream linen shirt with the sleeves rolled up, ' +
      'a plain leather belt, dark trousers and sturdy boots, simple and tidy',
  },
  {
    key: 'hw2_smith_scarf', nameKo: '불똥 막이 두건', set: 'smith2', slot: 'accessory', tone: 'bright', batch: 2,
    concept: '뒤로 묶은 천 두건, 기운 자국',
    art:
      'a blacksmith cloth headscarf: a rust-red cotton bandana tied at the back with two short trailing ends, a small sewn patch on the side, simple and neat',
  },
  {
    key: 'hw2_ghost_basket', nameKo: '사탕 가득 호박 바구니', set: 'ghost', slot: 'weapon', tone: 'costume', batch: 2,
    concept: '호박 얼굴 바구니에 포장 사탕이 넘침, 긴 손잡이',
    art:
      'a trick-or-treat jack-o-lantern bucket with a cute carved smiling face, overflowing with colorful wrapped candies and lollipops, hanging from a long curved handle, ' +
      'cute and festive, clearly a weapon held by the handle, no text, large, diagonal',
  },
  {
    key: 'hw2_ghost_sheet', nameKo: '바닥에 끌리는 홑청 망토', set: 'ghost', slot: 'armor', tone: 'costume', batch: 2,
    concept: '흰 천을 뒤집어쓴 유령 분장, 물결치는 밑단, 주황 리본 사탕 주머니',
    art:
      'a ghost costume: a long flowing white sheet robe with a wavy ragged hem trailing on the ground, loose wide sleeves, ' +
      'a small orange ribbon bow and a little candy pouch at the waist, soft and cute',
  },
  {
    key: 'hw2_ghost_mask', nameKo: '눈구멍 뚫린 유령 가면', set: 'ghost', slot: 'accessory', tone: 'costume', batch: 2,
    concept: '둥근 눈구멍 두 개를 뚫은 흰 천 두건 가면',
    art:
      'a white cloth ghost hood mask with two round black eye holes and a small round mouth hole, soft fabric folds, a tiny orange bow on top, cute and spooky',
  },
  {
    key: 'hw2_orc_club', nameKo: '호박 매단 가시 몽둥이', set: 'orc', slot: 'weapon', tone: 'costume', batch: 2,
    concept: '쇠 가시 박힌 커다란 나무 몽둥이, 끈으로 묶은 작은 호박등',
    art:
      'a huge crude wooden club studded with iron spikes, a small carved jack-o-lantern tied to it with rope, orange and purple cloth strips wrapped around the grip, ' +
      'bold and playful, clearly a club weapon, no text, large, diagonal',
  },
  {
    key: 'hw2_orc_vest', nameKo: '누덕누덕 털가죽 조끼', set: 'orc', slot: 'armor', tone: 'costume', batch: 2,
    concept: '털 달린 가죽 조끼, 한쪽 어깨 가죽 갑판, 주황·보라 줄무늬 바지',
    art:
      'an orc costume: a shaggy fur-trimmed patchwork leather vest, a single crude leather shoulder plate with bone studs, a rope belt with a big tusk buckle, ' +
      'orange and purple striped baggy trousers and fur boots, rugged and playful',
  },
  {
    key: 'hw2_orc_mask', nameKo: '엄니 달린 오크 가면', set: 'orc', slot: 'accessory', tone: 'costume', batch: 2,
    concept: '초록 오크 반가면, 큰 아래 엄니, 뾰족 귀',
    art:
      'a green orc half-mask with two big upward tusks, a heavy brow, and long pointed green ears on a headband, painted orange tribal stripes, bold and funny',
  },
  {
    key: 'hw2_skel_bone', nameKo: '리본 묶은 뼈다귀 곤봉', set: 'skeleton', slot: 'weapon', tone: 'costume', batch: 2,
    concept: '커다란 흰 뼈다귀, 손잡이에 보라 리본',
    art:
      'a giant white bone club shaped like a big cartoon femur, a purple ribbon bow tied around the grip, small orange candy charms hanging from the bow, ' +
      'playful and spooky, clearly a club weapon, no text, large, diagonal',
  },
  {
    key: 'hw2_skel_suit', nameKo: '뼈 무늬 쫄쫄이 옷', set: 'skeleton', slot: 'armor', tone: 'costume', batch: 2,
    concept: '검은 전신 옷에 흰 갈비뼈·팔다리뼈 무늬, 짧은 보라 망토',
    art:
      'a skeleton costume: a black full-body suit printed with white ribs, spine and arm and leg bones, a short purple cape over the shoulders, ' +
      'black gloves with white finger bones, playful and spooky',
  },
  {
    key: 'hw2_skel_mask', nameKo: '꽃 얹은 해골 반가면', set: 'skeleton', slot: 'accessory', tone: 'costume', batch: 2,
    concept: '하얀 해골 반가면, 이마에 주황 꽃 한 송이',
    art:
      'a white skull half-mask with big round black eye sockets and a little stitched grin, a single orange flower tucked at the brow, cute and spooky',
  },
];

export function promptOf(c: HalloweenCand): string {
  const tail = (c.tone === 'bright' ? TAIL_BRIGHT : c.tone === 'costume' ? TAIL_COSTUME : TAIL_DARK)[c.slot];
  return `${c.art}, ${tail}`;
}

function rememberedObject(itemKey: string): string {
  try {
    const m = JSON.parse(readFileSync(MAP_PATH, 'utf8')) as Record<string, { key: string; objectId: string }>;
    return m[itemKey]?.key === LABEL ? (m[itemKey].objectId ?? '') : '';
  } catch {
    return '';
  }
}

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

async function genOne(c: HalloweenCand, key: string): Promise<'ok' | 'skip' | 'fail'> {
  const out = join(OUT_DIR, `${c.key}.png`);
  if (existsSync(out)) return 'skip';
  // 생성은 됐는데 내려받다 끊긴 경우 — 기록된 객체 id로 결과만 다시 받는다(추석 11차에서 이중 과금 경험).
  let objectId = rememberedObject(c.key);
  if (objectId) console.log(`  ${c.key} 기록된 객체 재사용(생성 요청 없음)`);
  for (let attempt = 0; attempt < 5 && !objectId; attempt++) {
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
      let buf: Buffer | null = null;
      for (let d = 0; d < 4 && !buf; d++) {
        try {
          buf = Buffer.from(await (await fetch(url)).arrayBuffer());
        } catch (e) {
          console.error(`  ${c.key} 내려받기 — 재시도: ${(e as Error).message}`);
          await sleep(1500 * 2 ** d);
        }
      }
      if (!buf || buf.length < 8 || buf[0] !== 0x89 || buf[1] !== 0x50) return 'fail';
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
  const batchArg = Number(process.argv.find((a) => a.startsWith('--batch='))?.slice(8) ?? 0);
  const pool = batchArg ? CANDIDATES.filter((c) => c.batch === batchArg) : CANDIDATES;
  const list = only ? pool.filter((c) => only.includes(c.key)) : pool;
  if (process.argv.includes('--dry')) {
    for (const c of list) console.log(`[${SET_NAME[c.set]}/${c.slot}] ${c.key} ${c.nameKo}\n  ${promptOf(c)}\n`);
    return;
  }
  const { key, envName } = scriptKeyFor(LABEL);
  if (!key) {
    console.error(`${envName} 필요 — .env.local`);
    process.exit(1);
  }
  mkdirSync(OUT_DIR, { recursive: true });
  console.log(`할로윈 후보 ${list.length}종 — Pixellab 객체(sidescroller, ${SIZE}px, ${LABEL})\n`);
  // 동시성: 기본 1(429 회피 관례). --concurrency=N으로 올릴 수 있다(10-20 사용자 요청: 남은 분량 4개씩).
  const concurrency = Math.max(1, Number(process.argv.find((a) => a.startsWith('--concurrency='))?.slice(14) ?? 1) || 1);
  let ok = 0;
  let skip = 0;
  let fail = 0;
  let next = 0;
  const worker = async () => {
    while (next < list.length) {
      const c = list[next++]!;
      const r = await genOne(c, key);
      if (r === 'ok') ok += 1;
      else if (r === 'skip') skip += 1;
      else fail += 1;
      console.log(`  ${r === 'ok' ? '✓' : r === 'skip' ? '·' : '✗'} [${c.slot}] ${c.key.padEnd(26)} ${c.nameKo}`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, list.length) }, worker));
  console.log(`\n완료 — 생성 ${ok} · 스킵 ${skip} · 실패 ${fail}`);
  if (fail > 0) process.exitCode = 1;
}

// 직접 실행할 때만 생성한다 — 검토 페이지 빌더가 CANDIDATES만 가져다 쓸 때 유료 호출이 나가지 않게.
if (process.argv[1]?.endsWith('gen-halloween-cand.ts')) void main();
