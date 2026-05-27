/**
 * PROFILE §4.2 — description 합성.
 *
 * 8 블록 결합: HEADER · Face · Hair · Outfit(armor) · Accessory · Holding(weapon) · Pose · Style.
 * - 장비 lore 사용 금지(sprite-prompt-visual-only). `art` 외형 토큰만.
 * - HEADER의 비율·신체 라인 명시가 model 비율을 결정하는 유일한 수단
 *   (CreateCharacterProRequest엔 proportions·negative_description 없음, 2026-05-27 검증).
 * - female은 일본 아니메 신체 라인(가는 허리·풍성한 가슴·curvy thighs) 명시 필수.
 */
import 'server-only';

import { CATALOG_ITEMS, type CatalogItem } from '@/lib/game/equipment/catalog';
import type { ProfileConceptCategory, ProfileGender } from './refs';

export type ProfileHair =
  | 'short_black'
  | 'long_silver'
  | 'long_blonde'
  | 'spiky_red_orange'
  | 'long_brown_wavy'
  | 'long_teal_ash';

export type ProfileExpression =
  | 'gentle_smile'
  | 'stoic_neutral'
  | 'thoughtful'
  | 'confident_smirk'
  | 'warm_warm';

export type ProfilePose =
  | 'hands_relaxed_at_sides'
  | 'arms_crossed'
  | 'one_hand_on_hip'
  | 'gripping_weapon_at_side';

/** 유저 옵션 — PROFILE §5.1 4축 확정안(컨셉 + gender + hair + expression + pose). */
export interface ProfileOptions {
  gender: ProfileGender;
  conceptCategory: ProfileConceptCategory;
  hair: ProfileHair;
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

// ─── 옵션 enum → 텍스트 매핑 (PROFILE §5.1 [TBD] 확정 v1) ───

const HAIR_DESC: Record<ProfileHair, string> = {
  short_black:
    'voluminous deep black short hair with individual pixel strands, slight side bangs, single small ahoge',
  long_silver:
    'voluminous wind-swept long silver hair flowing past the waist with individual pixel strands and side bangs, single small ahoge',
  long_blonde:
    'voluminous wind-swept long golden-blonde hair flowing past the shoulders with individual pixel strands, single small ahoge',
  spiky_red_orange:
    'spiky messy red-orange hair with lighter highlights, a few longer strands falling over the forehead, single small ahoge',
  long_brown_wavy:
    'voluminous wind-swept long warm brown wavy hair flowing past the shoulders with individual pixel strands, single small ahoge',
  long_teal_ash:
    'voluminous wind-swept long pale teal-ash hair flowing past the shoulders with individual pixel strands and side bangs, single small ahoge',
};

const EXPRESSION_DESC: Record<ProfileExpression, string> = {
  gentle_smile: 'gentle warm smile with clean readable mouth shape',
  stoic_neutral: 'stoic neutral expression with calm authority',
  thoughtful: 'gentle thoughtful expression with soft brow',
  confident_smirk: 'confident slight smirk with sharp eye line',
  warm_warm: 'warm friendly half-smile, eyes wide open looking forward',
};

const POSE_DESC: Record<ProfilePose, string> = {
  hands_relaxed_at_sides:
    'T-pose standing centered front-facing facing the viewer directly, empty hands relaxed at sides',
  arms_crossed:
    'standing centered front-facing facing the viewer directly, arms crossed in front of the chest',
  one_hand_on_hip:
    'standing centered front-facing facing the viewer directly with slight hip tilt, one hand resting on hip',
  gripping_weapon_at_side:
    'standing centered front-facing facing the viewer directly, right hand gripping the weapon planted head-down at the side, left hand relaxed',
};

const CONCEPT_LABEL: Record<ProfileConceptCategory, string> = {
  scholar: 'young rune mountain scholar',
  mage: 'young arcane mage adept',
  warrior: 'young warrior adventurer',
  ranger: 'young forest ranger',
  rogue: 'young shadow rogue',
  noble: 'young noble heir adventurer',
  apprentice: 'young apprentice adventurer',
  merchant: 'young traveling merchant',
};

// ─── 공용 STYLE 상수 (서버 상수) ───

const STYLE_BLOCK =
  'colored reddish-brown outline rim (not pure black), rich gradient cel shading, ' +
  'classic JRPG anime pixel art aesthetic, pure white background, character only.';

// ─── HEADER 블록 — gender별 신체 라인 분기 ───

function headerBlock(opts: ProfileOptions): string {
  const body =
    opts.gender === 'female' ? 'adult bishojo' : 'adult bishonen';
  const proportions =
    opts.gender === 'female'
      ? 'emphasizing tall slender feminine anime body proportions with narrow slim waist, ample bust, and curvy thighs (classic JRPG female adventurer build), small head and long graceful legs, total body height approximately seven times head height.'
      : 'emphasizing tall slender masculine anime body proportions with broad shoulders and long legs, small head and total body height approximately seven times head height.';
  return `slim 7-heads-tall ${body} ${CONCEPT_LABEL[opts.conceptCategory]} mascot character of insaeng-ganghwa game, NOT chibi NOT super deformed, ${proportions}`;
}

function faceBlock(opts: ProfileOptions): string {
  const jaw = opts.gender === 'female' ? 'soft jawline' : 'strong jawline';
  const lips = opts.gender === 'female' ? 'small pink lips' : 'small lips';
  const lashes = opts.gender === 'female' ? ' and dramatic lashes' : '';
  return `Face: oval face with ${jaw}, huge anime doe eyes with multi-highlights${lashes}, small nose, ${lips}, ${EXPRESSION_DESC[opts.expression]}.`;
}

function hairBlock(opts: ProfileOptions): string {
  return `Hair: ${HAIR_DESC[opts.hair]}.`;
}

function outfitBlock(eq: ProfileEquipment): string {
  const armor = getItem(eq.armorKey, 'armor');
  return `Outfit: wearing ${sanitizeArt(armor.art)}.`;
}

function accessoryBlock(eq: ProfileEquipment): string {
  const accessory = getItem(eq.accessoryKey, 'accessory');
  return `Accessory: ${sanitizeArt(accessory.art)}.`;
}

function holdingBlock(eq: ProfileEquipment): string {
  const weapon = getItem(eq.weaponKey, 'weapon');
  return `Holding: ${sanitizeArt(weapon.art)}.`;
}

function poseBlock(opts: ProfileOptions): string {
  return `Pose: ${POSE_DESC[opts.pose]}, calm and confident stance.`;
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
    outfitBlock(eq),
    accessoryBlock(eq),
    holdingBlock(eq),
    poseBlock(opts),
    `Style: ${STYLE_BLOCK}`,
  ].join('\n\n');
}
