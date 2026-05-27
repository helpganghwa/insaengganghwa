/**
 * PROFILE §4.2 — description 합성.
 *
 * 6 블록 결합: HEADER · Face · Hair · Motifs(장비 3종 모티프 통합) · Pose · Style.
 * - 장비는 **직접 입거나 들지 않음** — 각 장비의 컨셉·테마가 아바타 의상/실루엣/디테일에
 *   메타포로 녹아듦(2026-05-27 사용자 결정). 예: "드래곤 검" → 어깨 용 날개 모티프,
 *   "개구리 단검" → 초록 leaf 패턴, "팰러딘 흉갑" → 흰·금 oath 엠블럼.
 * - 장비 lore 사용 금지(sprite-prompt-visual-only). `art` 외형 토큰만.
 * - HEADER의 비율·신체 라인 명시가 model 비율을 결정하는 유일한 수단
 *   (CreateCharacterProRequest엔 proportions·negative_description 없음, 2026-05-27 검증).
 * - female은 일본 아니메 신체 라인(가는 허리·풍성한 가슴·curvy thighs) 명시 필수.
 * - 자세는 Pose 블록이 단독 결정 — HEADER엔 자세 단어 X (sitting/jumping 같은 비-standing 허용).
 */
import 'server-only';

import { CATALOG_ITEMS, type CatalogItem } from '@/lib/game/equipment/catalog';
import type { ProfileGender } from './refs';

export type ProfileHairColor =
  | 'black'
  | 'silver'
  | 'blonde'
  | 'red'
  | 'brown'
  | 'blue'
  | 'pink'
  | 'teal'
  | 'purple'
  | 'white';

export type ProfileHairStyle =
  | 'long_loose'
  | 'long_braided'
  | 'long_ponytail'
  | 'long_twin_tails'
  | 'wavy_medium'
  | 'short_bob'
  | 'pixie_short'
  | 'spiky';

export type ProfileExpression =
  | 'gentle_smile'
  | 'stoic_neutral'
  | 'thoughtful'
  | 'confident_smirk'
  | 'warm_warm';

export type ProfilePose =
  | 'standing_naturally'
  | 'peace_sign'
  | 'sitting'
  | 'hands_on_hips'
  | 'jumping'
  | 'side_glance'
  | 'one_hand_wave'
  | 'hand_on_chin'
  | 'hands_behind_back'
  | 'arms_crossed';

/** 유저 옵션 — PROFILE §5.1 5축(gender + hair_color + hair_style + expression + pose). */
export interface ProfileOptions {
  gender: ProfileGender;
  hairColor: ProfileHairColor;
  hairStyle: ProfileHairStyle;
  expression: ProfileExpression;
  pose: ProfilePose;
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

const HAIR_COLOR: Record<ProfileHairColor, string> = {
  black: 'deep black',
  silver: 'shimmering silver',
  blonde: 'golden blonde',
  red: 'fiery red-orange',
  brown: 'warm chestnut brown',
  blue: 'cool cobalt blue',
  pink: 'soft pastel pink',
  teal: 'pale teal-ash',
  purple: 'mystical lavender purple',
  white: 'pure platinum white',
};

/** 스타일별 길이·실루엣 묘사 — 헤어 다양성의 핵심. */
const HAIR_STYLE: Record<ProfileHairStyle, string> = {
  long_loose:
    'voluminous wind-swept long hair flowing past the shoulders with individual pixel strands and side bangs, single small ahoge',
  long_braided:
    'long single braid trailing down the back tied with a small ribbon, side bangs framing the face, single small ahoge',
  long_ponytail:
    'long high ponytail tied with a small clip swaying past the shoulders, side bangs, single small ahoge',
  long_twin_tails:
    'long twin tails tied high on both sides with small ribbons, side bangs, single small ahoge',
  wavy_medium:
    'voluminous wavy medium-length hair just past the chin with playful curls and side bangs, single small ahoge',
  short_bob:
    'sharp short bob cut ending at the jawline with straight bangs framing the eyes, single small ahoge',
  pixie_short:
    'very short pixie cut with soft wisps and a few longer strands falling over the forehead, single small ahoge',
  spiky:
    'lively tousled short-to-medium hair with playful upward tufts and a few longer strands over the forehead, single small ahoge',
};

const EXPRESSION_DESC: Record<ProfileExpression, string> = {
  gentle_smile: 'gentle warm smile with clean readable mouth shape',
  stoic_neutral: 'stoic neutral expression with calm authority',
  thoughtful: 'gentle thoughtful expression with soft brow',
  confident_smirk: 'confident playful smirk with bright cheerful eyes',
  warm_warm: 'warm friendly half-smile, eyes wide open looking forward',
};

/** Pose는 자세 단독 결정 — front-facing 명시로 뒷통수 방지(2026-05-27 검증). */
const POSE_DESC: Record<ProfilePose, string> = {
  standing_naturally:
    'T-pose standing centered front-facing facing the viewer directly, empty hands relaxed at the sides',
  peace_sign:
    'standing centered front-facing facing the viewer directly with one hand held up in a V peace sign at face level, other hand relaxed at side, slight smile',
  sitting:
    'sitting on the ground centered front-facing facing the viewer directly, legs casually crossed, both hands resting on knees',
  hands_on_hips:
    'standing centered front-facing facing the viewer directly, both hands on hips in a confident stance',
  jumping:
    'mid-jump pose centered front-facing facing the viewer directly, both feet off the ground, arms slightly raised dynamically',
  side_glance:
    'body slightly turned to the side with one hand on hip, head turned to face the viewer directly in a sass side glance',
  one_hand_wave:
    'standing centered front-facing facing the viewer directly, one hand raised in a friendly greeting wave, other hand relaxed at side',
  hand_on_chin:
    'standing centered front-facing facing the viewer directly, one hand resting on the chin in a thoughtful pose, other hand relaxed at side',
  hands_behind_back:
    'standing centered front-facing facing the viewer directly, both hands clasped behind the back in gentle upright posture',
  arms_crossed:
    'standing centered front-facing facing the viewer directly, arms crossed firmly in front of the chest',
};

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

function hairBlock(opts: ProfileOptions): string {
  return `Hair: ${HAIR_COLOR[opts.hairColor]} ${HAIR_STYLE[opts.hairStyle]}.`;
}

/**
 * 장비 3종을 캐릭터에 직접 입히지 않고 **모티프**로 녹임.
 * 모델이 "literal item icon으로 캐릭터를 분리해 그리는" 위험 방지.
 */
function motifBlock(eq: ProfileEquipment): string {
  const weapon = getItem(eq.weaponKey, 'weapon');
  const armor = getItem(eq.armorKey, 'armor');
  const accessory = getItem(eq.accessoryKey, 'accessory');
  return [
    'Design motifs woven into the character — translate these themes into the silhouette, outfit fabric, color palette, and small details (DO NOT have the character physically hold or wear the literal item):',
    `- Weapon theme: ${sanitizeArt(weapon.art)} — interpret as wing/horn/symbol/pattern on shoulders, cloak, or hair ornament`,
    `- Armor theme: ${sanitizeArt(armor.art)} — adapt color, material, emblem, and silhouette into an adventurer outfit`,
    `- Accessory theme: ${sanitizeArt(accessory.art)} — fold motif into hair piece, earrings, sleeve detail, or pendant`,
  ].join('\n');
}

function poseBlock(opts: ProfileOptions): string {
  return `Pose: ${POSE_DESC[opts.pose]}.`;
}

/**
 * 최종 description 합성 — Pixellab v2 `description` 필드에 그대로 입력.
 * 최대 2000자(spec). HEADER + 6 블록 + Style ≈ 800~1500자 (장비 art 길이에 따라).
 */
export function composeDescription(opts: ProfileOptions, eq: ProfileEquipment): string {
  return [
    headerBlock(opts),
    faceBlock(opts),
    hairBlock(opts),
    motifBlock(eq),
    poseBlock(opts),
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

  // 각 motif는 80자 trim해 합산 ~800자 안에 들어오게.
  const short = (s: string, n: number) => (s.length > n ? s.slice(0, n).trim() : s);

  return [
    `Edit appearance:`,
    `hair = ${HAIR_COLOR[opts.hairColor]} ${short(HAIR_STYLE[opts.hairStyle], 90)};`,
    `expression = ${EXPRESSION_DESC[opts.expression]};`,
    `pose = ${short(POSE_DESC[opts.pose], 110)}.`,
    `Outfit motifs (color/pattern/small detail only — DO NOT hold or wear literal item icons):`,
    `weapon = ${short(sanitizeArt(weapon.art), 80)};`,
    `armor = ${short(sanitizeArt(armor.art), 80)};`,
    `accessory = ${short(sanitizeArt(accessory.art), 80)}.`,
    `Keep cute Japanese JRPG anime pixel style and full body head-to-feet composition.`,
  ].join(' ');
}
