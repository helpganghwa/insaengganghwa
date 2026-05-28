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

/**
 * 표정 — 서버 random 부여 (2026-05-28 사용자 결정). 무표정 1 + 밝은 계열 3.
 * 우울/날카로운 계열 배제(thoughtful 제거) — 프로필은 밝고 호감가는 톤만.
 */
export type ProfileExpression =
  | 'stoic_neutral'
  | 'gentle_smile'
  | 'confident_smirk'
  | 'warm_warm';

/**
 * 머리 길이 — 서버 random 부여 (2026-05-28 사용자 결정). 색은 장비 모티프 팔레트를 따르고
 * 길이만 랜덤으로 변별. natural = 어깨선 전후 자연스러운 길이.
 */
export type ProfileHairLength = 'long' | 'short' | 'natural';

// 포즈 enum 폐기 (2026-05-28 사용자 결정) — state edit이 source 포즈를 강하게 보존해
// peace_sign/wave 등이 결과에 반영되지 않음. 옵션에서 제거하고 source 포즈를 그대로 사용.

/** 합성 옵션 — gender(유저)만 선택. expression·hairLength·race는 서버 random, 머리색은 장비 모티프 위임. */
export interface ProfileOptions {
  gender: ProfileGender;
  expression: ProfileExpression;
  hairLength: ProfileHairLength;
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

/**
 * catalog `art`는 sprite icon 생성 prompt라 "item icon, ..., single inanimate game loot
 * object on transparent background" boilerplate를 포함. character description에 그대로
 * 쓰면 모델이 "transparent background icon"으로 캐릭터를 분리해 그릴 위험. 가운데 외형
 * 묘사만 추출(2026-05-27 sanity check 확인).
 */
function sanitizeArt(art: string): string {
  // 패턴: "[adj...] [slot] item icon, [shape description], single inanimate game loot object on transparent background"
  const m = art.match(/item icon,\s*([\s\S]+?)(?:,\s*single inanimate game loot object[^,]*)?$/i);
  return (m?.[1] ?? art).trim().replace(/[.,;]\s*$/, '');
}

// ─── 옵션 enum → 텍스트 매핑 (PROFILE §5.1 확정 v2) ───

/** 종족별 시각 변별 trait — "race appearance:" 뒤에 들어감(prefix 없음). */
const RACE_LINE: Record<ProfileRace, string> = {
  human: 'ordinary human',
  elf: 'elf with long delicately pointed ears',
  dark_elf: 'dark elf with dusky purple-tinted skin and long pointed ears',
  nekomimi: 'cat-eared catperson with soft furry cat ears on the head and a slender cat tail',
  dragonkin: 'dragonkin with small curved horns on the forehead and faint scale patches on cheeks',
  fairy: 'fairy with small translucent insect wings on the back and pointed pixie ears',
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

const EXPRESSION_DESC: Record<ProfileExpression, string> = {
  stoic_neutral: 'calm neutral expression, relaxed and composed',
  gentle_smile: 'gentle warm smile with clean readable mouth shape',
  confident_smirk: 'confident playful smirk with bright cheerful eyes',
  warm_warm: 'warm friendly half-smile, eyes wide open looking forward',
};

const ALL_EXPRESSIONS = Object.keys(EXPRESSION_DESC) as ProfileExpression[];

/** 표정 균등 random — 서버 RNG (CLAUDE §3.1). */
export function pickRandomExpression(): ProfileExpression {
  const i = crypto.getRandomValues(new Uint32Array(1))[0]! % ALL_EXPRESSIONS.length;
  return ALL_EXPRESSIONS[i]!;
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

// ─── 공용 STYLE 상수 (서버 상수) ───

const STYLE_BLOCK =
  'cute Japanese JRPG anime pixel art — soft warm features, large round eyes, gentle silhouette, NOT sharp NOT edgy. ' +
  'colored reddish-brown rim outline (not pure black), rich gradient cel shading, pure white background, character only.';

// ─── HEADER 블록 — gender별 신체 라인 분기, 컨셉 generic ───

function headerBlock(opts: ProfileOptions): string {
  const body = opts.gender === 'female' ? 'adult bishojo' : 'adult bishonen';
  const proportions =
    opts.gender === 'female'
      ? '7-heads slim feminine anime body — narrow waist, soft bust, curvy thighs, small head, long legs'
      : '7-heads slim masculine anime body — broad shoulders, long legs, small head';
  return `FULL BODY head-to-feet visible, both feet planted on ground, NOT bust shot. slim ${body} cute young adventurer mascot character of insaeng-ganghwa game, NOT chibi, ${proportions}.`;
}

function faceBlock(opts: ProfileOptions): string {
  const jaw = opts.gender === 'female' ? 'soft jawline' : 'strong jawline';
  const lips = opts.gender === 'female' ? 'small pink lips' : 'small lips';
  const lashes = opts.gender === 'female' ? ' and dramatic lashes' : '';
  return `Face: oval face with ${jaw}, huge anime doe eyes with multi-highlights${lashes}, small nose, ${lips}, ${EXPRESSION_DESC[opts.expression]}.`;
}

/**
 * 장비 3종을 캐릭터에 직접 입히지 않고 **모티프**로 녹임. 머리색도 모티프 팔레트를 따름.
 * 모델이 "literal item icon으로 캐릭터를 분리해 그리는" 위험 방지.
 */
function motifBlock(eq: ProfileEquipment): string {
  const weapon = getItem(eq.weaponKey, 'weapon');
  const armor = getItem(eq.armorKey, 'armor');
  const accessory = getItem(eq.accessoryKey, 'accessory');
  return [
    'Design motifs woven into the character — translate these themes into the silhouette, outfit fabric, color palette, hair color, and small details (DO NOT have the character physically hold or wear the literal item):',
    `- Weapon theme: ${sanitizeArt(weapon.art)} — interpret as wing/horn/symbol/pattern on shoulders, cloak, or hair ornament`,
    `- Armor theme: ${sanitizeArt(armor.art)} — adapt color, material, emblem, and silhouette into an adventurer outfit`,
    `- Accessory theme: ${sanitizeArt(accessory.art)} — fold motif into hair piece, earrings, sleeve detail, or pendant`,
    '- Hair color: drawn from the dominant color of these item themes (model chooses a fitting shade).',
  ].join('\n');
}

/**
 * 최종 description 합성 — Pixellab v2 `description` 필드에 그대로 입력.
 * 최대 2000자(spec). HEADER + 블록 + Style ≈ 800~1500자 (장비 art 길이에 따라).
 */
export function composeDescription(opts: ProfileOptions, eq: ProfileEquipment): string {
  return [
    headerBlock(opts),
    faceBlock(opts),
    motifBlock(eq),
    `Style: ${STYLE_BLOCK}`,
  ].join('\n\n');
}

/**
 * `create_character_state` 용 압축 description (max 1000자, spec).
 * source character의 톤·체형·풀바디·아니메 결을 그대로 유지하고 외형(머리·표정·포즈·옷
 * 모티프)만 변경 지시. composeDescription과 달리 HEADER·Style 블록 생략(source 보존).
 */
export function composeEditDescription(opts: ProfileOptions, eq: ProfileEquipment): string {
  const weapon = getItem(eq.weaponKey, 'weapon');
  const armor = getItem(eq.armorKey, 'armor');
  const accessory = getItem(eq.accessoryKey, 'accessory');

  const short = (s: string, n: number) => (s.length > n ? s.slice(0, n).trim() : s);
  const raceTrait = RACE_LINE[opts.race];

  // positive-only + KEEP/CHANGE 명확 분리. 비율은 "8 heads"(개수 세기, diffusion 약함) 대신
  // small head + long legs 같은 시각 키워드로 지시 (2026-05-28 사용자 결정).
  return [
    // KEEP — source 톤·디자인 보존 + 비율은 small head/long legs 시각 키워드로 강조.
    `KEEP unchanged from source: gender, face structure, the attractive anime art style, color saturation, and overall character vibe.`,
    // PROPORTIONS — 시각적 비율 키워드 (positive, 개수 세기 회피).
    `Slim tall figure with a small head and very long slender legs.`,
    // CAMERA — 풀바디 framing (positive).
    `Wide framing: full character head-to-feet fills the tall frame.`,
    // QUALITY — positive.
    `Sharp clear detailed face, clean background, character only.`,
    // CHANGE — 편집할 것만. 머리 길이는 랜덤, 색은 item 테마 팔레트를 따름.
    `CHANGE these — race appearance: ${short(raceTrait, 90)} (same gender and body as source);`,
    `hair: ${HAIR_LENGTH_DESC[opts.hairLength]}, color drawn from the item themes below;`,
    `expression: ${short(EXPRESSION_DESC[opts.expression], 38)};`,
    // 모티프 강화 — source 옷을 '덧입히기'가 아니라 '완전 교체'로 (2026-05-28 사용자 결정).
    `FULLY REDESIGN the whole outfit & gear from these item themes (replace the source clothing; keep body proportions & art style):`,
    `weapon ${short(sanitizeArt(weapon.art), 34)},`,
    `armor ${short(sanitizeArt(armor.art), 28)},`,
    `accessory ${short(sanitizeArt(accessory.art), 22)}.`,
    // CONFIRM — 끝 reminder (positive).
    `Confirm: same gender as source, small head and long legs, full body with both feet visible on the ground.`,
  ].join(' ');
}
