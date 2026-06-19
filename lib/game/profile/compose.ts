/**
 * PROFILE §4.2 — description 합성.
 *
 * 골격: 정체성(애니풍·비율 강앵커+성별) · 장비 줄 · 포맷 · 포즈 · Confirm.
 * - 장비는 **실제로 입고·드는** 형태로 묘사(wielding/wearing + wornDesc, 외형 토큰만).
 * - **애니풍·신체비율 보존이 일관성의 핵심**: create-character-state가 애니 소스에서
 *   파생하므로 "소스의 Japanese anime art style·small head·slim proportions 유지"를
 *   genderClause(앞)+Confirm(끝) 이중 앵커. 이를 약화하면 애니풍 상실·머리 커짐·생성마다
 *   들쭉날쭉(2026-06-19 회귀로 검증) → 장비 강조는 "clearly show" 수준까지만(과잉 초점 금지).
 * - 비율(CreateCharacterProRequest엔 proportions·negative_description 없음, 2026-05-27 검증).
 *   남성은 flat masculine chest·masculine build로 성별 뒤집힘 방지(부정형 X — 긍정 묘사만,
 *   이미지 생성기는 no/not을 잘 못 다뤄 오히려 그 개념을 끌어옴, 2026-06-19 사용자).
 */
import 'server-only';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CATALOG_ITEMS, type CatalogItem } from '@/lib/game/equipment/catalog';
import { ITEM_MOTIFS } from '@/lib/game/equipment/motifs';
import { spritePath } from '@/lib/game/equipment/sprite-manifest';
import { generateOutfitClause } from './outfit-llm';
import type { ProfileGender } from './refs';

/** 장비 스프라이트 PNG → base64(vision 입력). 파일 부재 시 throw(상위 catch fallback). */
function readSpriteB64(key: string): string {
  const rel = spritePath(key);
  if (!rel) throw new Error(`NO_SPRITE: ${key}`);
  return readFileSync(join(process.cwd(), 'public', rel.replace(/^\//, ''))).toString('base64');
}

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
export type ProfilePose = 'natural';

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

// 손 점유 포즈 전부 제거(arms_crossed/hand_wave/peace_sign/hand_on_hip). natural 1종.
// "arms resting at the sides"는 빈손을 암시해 무기가 사라지는 문제(bf84eaef) → "standing
// naturally"로 변경. 무기는 wpnPhrase의 'held in hand'로 손에 확실히 쥐도록 명시.
const POSE_DESC: Record<ProfilePose, string> = {
  natural: 'standing naturally',
};

const ALL_POSES = Object.keys(POSE_DESC) as ProfilePose[];

/** 포즈 균등 random — 서버 RNG (CLAUDE §3.1). */
export function pickRandomPose(): ProfilePose {
  const i = crypto.getRandomValues(new Uint32Array(1))[0]! % ALL_POSES.length;
  return ALL_POSES[i]!;
}

/** 고정 골격(애니풍·비율 강앵커 + 성별 + 포맷·포즈 + Confirm) + 가변 장비 줄 결합. */
function assemble(opts: ProfileOptions, outfitClause: string): string {
  // create-character-state는 애니풍 소스에서 파생 — "소스의 애니 스타일·비율 유지"를
  // 앞(genderClause)+끝(Confirm) 이중으로 강하게 앵커해야 애니풍·머리비율이 일관(2026-06-19 회귀 교정).
  // 성별 강제(남=FLAT chest 안티플립)도 유지. 장비는 outfitClause가 정확히 묘사(과잉 초점 X).
  const genderClause =
    opts.gender === 'male'
      ? `MALE bishōnen boy drawn in clean Japanese anime (cel-shaded) art style, with a masculine boyish face, a flat masculine chest, and a masculine build and hair. KEEP from the source character exactly: the same Japanese anime art style, the same face, and the same slim tall proportions with a small head and long legs. He stays clearly male, masculine.`
      : `FEMALE bishōjo drawn in clean Japanese anime (cel-shaded) art style, with a feminine face and figure. KEEP from the source character exactly: the same Japanese anime art style, the same face, and the same slim tall proportions with a small head and long legs. She stays clearly female.`;
  // 포즈 문구 제거 — 포즈가 natural('standing naturally') 1종뿐이라 기본자세와 동일,
  // 명시 불필요(2026-06-19 사용자). 무기 'held in hand'는 outfitClause에 있어 영향 없음.
  return [
    genderClause,
    outfitClause,
    `Full body head-to-feet, both feet on the ground; exactly two arms and two legs with one hand at the end of each arm; on a clean transparent background, character only, with clean solid outlines.`,
    `Confirm: keep the source's Japanese anime art style, face and slim tall proportions with a small head; full body with both feet visible.`,
  ].join(' ');
}

/**
 * 최종 1000자(Pixellab spec) 보장 — 고정 앵커(성별·포맷·포즈·Confirm)는 보존하고
 * outfit만 남는 예산에 맞춰 단어경계로 절단. 어떤 입력이든 결과 ≤1000을 보장한다.
 */
function finalizeUnder1000(opts: ProfileOptions, outfitClause: string): string {
  let final = assemble(opts, outfitClause);
  if (final.length <= 1000) return final;
  // outfit 제외 고정부 길이 → outfit 예산 산출 후 단어경계 절단.
  const fixedLen = final.length - outfitClause.length;
  const budget = 1000 - fixedLen - 1;
  if (budget > 24 && outfitClause.length > budget) {
    let t = outfitClause.slice(0, budget);
    const sp = t.lastIndexOf(' ');
    if (sp > 0) t = t.slice(0, sp);
    outfitClause = t.trimEnd().replace(/[,;:]+$/, '') + '.';
    final = assemble(opts, outfitClause);
  }
  // 고정부만으로도 초과(이론상 거의 없음) → 단어경계 하드컷.
  if (final.length > 1000) {
    const cut = final.slice(0, 1000);
    final = cut.slice(0, Math.max(1, cut.lastIndexOf(' '))).trimEnd();
  }
  return final;
}

/** Haiku 실패 시 정적 의상절(장르 자유·모티프 느슨) — 기존 동작 보존. */
function staticOutfitClause(opts: ProfileOptions, motifsConcept: string): string {
  return `Give the character a fresh new hairstyle (${HAIR_LENGTH_DESC[opts.hairLength]}, new color) and a whole new outfit and gear — be creative, ANY genre (casual, school uniform, swimwear, dress, suit, modern, fantasy, etc.), built around the motifs and clearly visible: ${motifsConcept}.`;
}

/** 폴백(outfit-llm)용 — 머리·의상·장비 재디자인 prefix(장비를 또렷이 보이게, 단 과잉 초점 X). */
const EQUIP_PREFIX =
  'Give the character a fresh new hairstyle and redesign the outfit and gear to clearly show these items: ';

/**
 * `create_character_state` 용 압축 description (max 1000자, spec).
 * 하이브리드 (2026-05-28 사용자 결정): 고정 골격은 코드, 의상/헤어 절은 Haiku가 모티프·종족·
 * 성별을 받아 매번 다르게 생성 → 다양성·랜덤성 확보. Haiku 실패 시 정적 절로 fallback.
 */
export async function composeEditDescription(
  opts: ProfileOptions,
  eq: ProfileEquipment,
): Promise<string> {
  // 장비 3종 — vision 입력(스프라이트 이미지 + 이름 + art). 잘못된 키/슬롯은 조기 throw.
  const wpn = getItem(eq.weaponKey, 'weapon');
  const arm = getItem(eq.armorKey, 'armor');
  const acc = getItem(eq.accessoryKey, 'accessory');

  // concept-only(색 제거, 첫 단어) — Haiku 실패 시 정적 fallback용.
  const concept = (key: string) => (ITEM_MOTIFS[key] ?? '').split(',')[0]!.trim();
  const motifsConcept = [
    ...new Set(
      [concept(eq.weaponKey), concept(eq.armorKey), concept(eq.accessoryKey), RACE_MOTIF[opts.race]].filter(
        Boolean,
      ),
    ),
  ].join(', ');

  // 머리·장비를 새로 그리되 장비를 시각 초점으로 — 성별 대명사만 분기.
  const pron = opts.gender === 'male' ? 'him' : 'her';

  let outfitClause: string;
  if (wpn.wornDesc && arm.wornDesc && acc.wornDesc) {
    // Phase 2: 사전 큐레이션 wornDesc로 결정론적 조립 — 런타임 LLM 변동·스프라이트 오해석·길이초과 제거.
    // 성별중립 묘사라 남/여 모두 body 골격(성별 강제)에 맞춰 자연 렌더.
    // 쌍검/한 쌍 무기 — 양손에 하나씩 들도록 명시(한 자루로 줄어드는 문제 방지).
    const dual = /\b(pair|twin|dual|matching pair)\b|쌍|두 자루/i.test(wpn.wornDesc!);
    // 무기 'held in hand' 명시 — 빈손 렌더로 무기가 사라지는 문제 방지(bf84eaef).
    const wpnPhrase = dual ? `${wpn.wornDesc}, one held in each hand` : `${wpn.wornDesc}, held in hand`;
    outfitClause = `Give ${pron} a fresh new ${HAIR_LENGTH_DESC[opts.hairLength]} in a new color and redesign the outfit and gear to clearly show these items: wielding ${wpnPhrase}, wearing ${arm.wornDesc}, and ${acc.wornDesc}.`;
    // 안전 가드 — 1000자 초과 시 머리절을 줄여 장비 3종 묘사는 보존.
    if (assemble(opts, outfitClause).length > 1000) {
      outfitClause = `Give ${pron} a new hairstyle and outfit showing these items: wielding ${wpnPhrase}, wearing ${arm.wornDesc}, and ${acc.wornDesc}.`;
    }
  } else {
    // 폴백 — wornDesc 미보유 아이템: 기존 outfit-llm(이미지 기반) → 실패 시 정적 절.
    try {
      const items = [wpn, arm, acc].map((it) => ({
        slot: it.slot,
        name: it.nameKo,
        art: it.art,
        imageB64: readSpriteB64(it.key),
      }));
      const clause = await generateOutfitClause({
        gender: opts.gender,
        raceMotif: RACE_MOTIF[opts.race],
        hairLengthDesc: HAIR_LENGTH_DESC[opts.hairLength],
        items,
      });
      outfitClause = `${EQUIP_PREFIX}${clause}.`;
      const over = assemble(opts, outfitClause).length - 1000;
      if (over > 0) {
        let t = clause.slice(0, Math.max(0, clause.length - over - 1));
        const sp = t.lastIndexOf(' ');
        if (sp > 0) t = t.slice(0, sp);
        outfitClause = `${EQUIP_PREFIX}${t.trimEnd()}.`;
      }
    } catch {
      outfitClause = staticOutfitClause(opts, motifsConcept);
    }
  }

  return finalizeUnder1000(opts, outfitClause);
}
