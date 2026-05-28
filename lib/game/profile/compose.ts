/**
 * PROFILE §4.2 — description 합성.
 *
 * 블록 결합: HEADER · Face · Hair · Motifs(장비 3종 모티프 통합) · Style.
 * - 장비는 **직접 입거나 들지 않음** — 각 장비의 컨셉·테마가 아바타 의상/실루엣/디테일에
 *   메타포로 녹아듦(2026-05-27 사용자 결정). 예: "드래곤 검" → 어깨 용 날개 모티프,
 *   "개구리 단검" → 초록 leaf 패턴, "팰러딘 흉갑" → 흰·금 oath 엠블럼.
 * - 장비 lore 사용 금지(sprite-prompt-visual-only). `art` 외형 토큰만.
 * - HEADER의 비율·신체 라인 명시가 model 비율을 결정하는 유일한 수단
 *   (CreateCharacterProRequest엔 proportions·negative_description 없음, 2026-05-27 검증).
 * - female은 일본 아니메 신체 라인(가는 허리·풍성한 가슴·curvy thighs) 명시 필수.
 */
import 'server-only';

import { CATALOG_ITEMS, type CatalogItem } from '@/lib/game/equipment/catalog';
import { ITEM_MOTIFS } from '@/lib/game/equipment/motifs';
import type { ProfileGender } from './refs';

// 헤어 컬러·스타일 옵션 폐기 (2026-05-28 사용자 결정) — 머리색은 장비 모티프 팔레트를
// 따라가도록 모델에 위임. 유저가 직접 고르지 않음.

/**
 * 종족 6종 — 서버 weighted random 부여 (2026-05-28 사용자 결정).
 * human이 default(line 생략), 나머지는 race line 추가로 시각 변별 강화.
 */
export type ProfileRace =
  | 'human'
  | 'elf'
  | 'dark_elf'
  | 'nekomimi'
  | 'dragonkin'
  | 'fairy';

// 표정 옵션 폐기 (2026-05-28 사용자 결정) — 얼굴 지시는 source 그대로 유지(표정 변경 X).

/**
 * 머리 길이 — 서버 random 부여 (2026-05-28 사용자 결정). 색은 장비 모티프 팔레트를 따르고
 * 길이만 랜덤으로 변별. natural = 어깨선 전후 자연스러운 길이.
 */
export type ProfileHairLength = 'long' | 'short' | 'natural';

/**
 * 포즈 — 서버 random 가벼운 변형 (2026-05-28 재도입). state가 source 전신을 강하게 보존하므로
 * 팔·손 수준의 가벼운 포즈만(레퍼런스 비율·전신 유지). 실제 반영도는 e2e로 검증.
 */
export type ProfilePose = 'natural' | 'arms_crossed' | 'hand_wave' | 'peace_sign' | 'hand_on_hip';

/** 합성 옵션 — gender(유저)만 선택. hairLength·pose·race는 서버 random. 표정·얼굴은 source 유지. */
export interface ProfileOptions {
  gender: ProfileGender;
  hairLength: ProfileHairLength;
  pose: ProfilePose;
  race: ProfileRace;
}

export interface ProfileEquipment {
  weaponKey: string;
  armorKey: string;
  accessoryKey: string;
}

/** 카탈로그 조회 헬퍼 — N+1 회피 위해 lookup 1회 빌드. */
const ITEM_BY_KEY: ReadonlyMap<string, CatalogItem> = new Map(
  CATALOG_ITEMS.map((c) => [c.key, c]),
);

function getItem(key: string, slot: CatalogItem['slot']): CatalogItem {
  const item = ITEM_BY_KEY.get(key);
  if (!item) throw new Error(`EQUIP_NOT_FOUND: ${key}`);
  if (item.slot !== slot) throw new Error(`EQUIP_SLOT_MISMATCH: ${key} is ${item.slot}, expected ${slot}`);
  return item;
}

// ─── 옵션 enum → 텍스트 매핑 ───

/** 종족 → 모티프 개념(얼굴 묘사 X, 통합 모티프로 합류). human은 개념 없음. */
const RACE_MOTIF: Record<ProfileRace, string> = {
  human: '',
  elf: 'elf',
  dark_elf: 'dark elf',
  nekomimi: 'cat',
  dragonkin: 'dragon',
  fairy: 'fairy',
};

/**
 * gender별 weighted random race (2026-05-28 사용자 결정):
 *  - nekomimi·fairy = 여자만, dragonkin = 남자만, human·elf·dark_elf = 공통.
 * crypto.getRandomValues로 서버 RNG (CLAUDE §3.1).
 */
const RACE_WEIGHTS_BY_GENDER: Record<ProfileGender, { race: ProfileRace; cumBp: number }[]> = {
  female: [
    { race: 'human', cumBp: 3000 },
    { race: 'nekomimi', cumBp: 5500 },
    { race: 'fairy', cumBp: 7500 },
    { race: 'elf', cumBp: 9000 },
    { race: 'dark_elf', cumBp: 10000 },
  ],
  male: [
    { race: 'human', cumBp: 4000 },
    { race: 'dragonkin', cumBp: 6500 },
    { race: 'elf', cumBp: 8500 },
    { race: 'dark_elf', cumBp: 10000 },
  ],
};

export function pickRandomRace(gender: ProfileGender): ProfileRace {
  const table = RACE_WEIGHTS_BY_GENDER[gender];
  const r = crypto.getRandomValues(new Uint32Array(1))[0]! % 10000;
  for (const { race, cumBp } of table) if (r < cumBp) return race;
  return 'human';
}

const HAIR_LENGTH_DESC: Record<ProfileHairLength, string> = {
  long: 'long flowing hair',
  short: 'short cropped hair',
  natural: 'natural shoulder-length hair',
};

const ALL_HAIR_LENGTHS = Object.keys(HAIR_LENGTH_DESC) as ProfileHairLength[];

/** 머리 길이 균등 random — 서버 RNG (CLAUDE §3.1). */
export function pickRandomHairLength(): ProfileHairLength {
  const i = crypto.getRandomValues(new Uint32Array(1))[0]! % ALL_HAIR_LENGTHS.length;
  return ALL_HAIR_LENGTHS[i]!;
}

const POSE_DESC: Record<ProfilePose, string> = {
  natural: 'arms resting naturally at the sides',
  arms_crossed: 'arms casually crossed over the chest',
  hand_wave: 'one hand raised in a friendly little wave',
  peace_sign: 'one hand making a cute V sign near the face',
  hand_on_hip: 'one hand resting lightly on the hip',
};

const ALL_POSES = Object.keys(POSE_DESC) as ProfilePose[];

/** 포즈 균등 random — 서버 RNG (CLAUDE §3.1). */
export function pickRandomPose(): ProfilePose {
  const i = crypto.getRandomValues(new Uint32Array(1))[0]! % ALL_POSES.length;
  return ALL_POSES[i]!;
}

/**
 * `create_character_state` 용 압축 description (max 1000자, spec).
 * source character의 톤·체형·풀바디·아니메 결을 그대로 유지하고 외형(머리·표정·포즈·옷
 * 모티프)만 변경 지시. composeDescription과 달리 HEADER·Style 블록 생략(source 보존).
 */
export function composeEditDescription(opts: ProfileOptions, eq: ProfileEquipment): string {
  // getItem 검증(잘못된 키/슬롯 조기 throw) — 반환은 미사용(모티프는 ITEM_MOTIFS에서).
  getItem(eq.weaponKey, 'weapon');
  getItem(eq.armorKey, 'armor');
  getItem(eq.accessoryKey, 'accessory');

  // 모티프 = 장비 3종 개념 + 종족 개념. 색 제거(첫 단어=개념), 무기/방어구/장신구 구분 없이
  // 통합·중복 제거 (2026-05-28 사용자 결정).
  const concept = (key: string) => (ITEM_MOTIFS[key] ?? '').split(',')[0]!.trim();
  const motifs = [
    ...new Set(
      [concept(eq.weaponKey), concept(eq.armorKey), concept(eq.accessoryKey), RACE_MOTIF[opts.race]].filter(
        Boolean,
      ),
    ),
  ].join(', ');

  // 얼굴 이목구비는 source 유지, 표정 자유. 의상은 장르 무제한(자유), 모티프는 느슨한 영감.
  // 외곽 흰점/노이즈 방지 지시 추가 (2026-05-28 사용자 결정).
  return [
    `KEEP unchanged from source: gender, the exact same facial features, the Japanese anime art style, body proportions, and overall vibe.`,
    `Full body head-to-feet, pure clean background, character only. Crisp clean silhouette with smooth solid outlines — no stray white dots, specks or noise around the edges.`,
    `Slim tall figure with a small head and long legs.`,
    `Redesign ONLY the hairstyle (${HAIR_LENGTH_DESC[opts.hairLength]}, fresh new style & color) and the whole outfit — be creative, ANY genre (casual, school uniform, swimwear, dress, suit, modern, fantasy, etc.), loosely inspired by the motifs. Pose: ${POSE_DESC[opts.pose]}. Expression free — any natural pleasant look. You may add handheld props (sword, book, staff…) and decorations (wings, ornaments).`,
    `Motifs (loose only): ${motifs}.`,
    `Confirm: keep the same facial features, body and anime style as source; full body with both feet on the ground.`,
  ].join(' ');
}
