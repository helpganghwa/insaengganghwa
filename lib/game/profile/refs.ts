/**
 * PROFILE §4.3 — Pixellab v2 reference 풀 매핑.
 *
 * `concept_image`(톤 주도)는 모든 케이스에 `concept-bishonen-red` 고정 — 가장 강한
 * 톤·검증된 아니메 결(2026-05-27). `reference_image`(구도 보조)만 gender·컨셉에 따라 분기.
 *
 * 외부 reference 3장만 사용(`public/sprites/profile/refs/`) — v1 확정, 사용자 캐릭터
 * 추가 X. 풀 확장은 운영 후 필요 시점.
 */
import 'server-only';

import { join } from 'node:path';
import { readFile } from 'node:fs/promises';

export type ProfileGender = 'male' | 'female';

/** 컨셉 카테고리 — description HEADER + ref 분기에 사용. */
export type ProfileConceptCategory =
  | 'scholar'
  | 'mage'
  | 'warrior'
  | 'ranger'
  | 'rogue'
  | 'noble'
  | 'apprentice'
  | 'merchant';

const REFS_DIR = join(process.cwd(), 'public', 'sprites', 'profile', 'refs');

const CONCEPT_BISHONEN_RED = 'concept-bishonen-red.png';
const REFERENCE_BISHOJO_ELF = 'reference-bishojo-elf.png';
const REFERENCE_BISHOJO_ADVENTURER = 'reference-bishojo-adventurer.png';

export interface RefPair {
  /** concept_image — 톤 주도 ref. base64 변환 전 절대 경로. */
  conceptPath: string;
  /** reference_image — 구도 보조 ref. base64 변환 전 절대 경로. */
  referencePath: string;
}

/**
 * 검증된 매핑 (PROFILE §4.3):
 * - female + ranger|rogue → adventurer
 * - 그 외 (female 학자·기사·마법사·노블 등 + male all) → elf
 * - concept는 unconditional bishonen-red.
 */
export function pickRefs(opts: {
  gender: ProfileGender;
  conceptCategory: ProfileConceptCategory;
}): RefPair {
  const isFemaleAdventurous =
    opts.gender === 'female' &&
    (opts.conceptCategory === 'ranger' || opts.conceptCategory === 'rogue');

  const referenceName = isFemaleAdventurous
    ? REFERENCE_BISHOJO_ADVENTURER
    : REFERENCE_BISHOJO_ELF;

  return {
    conceptPath: join(REFS_DIR, CONCEPT_BISHONEN_RED),
    referencePath: join(REFS_DIR, referenceName),
  };
}

/** 두 ref를 base64 PNG로 로드 — Pixellab v2 호출 직전 사용. */
export async function loadRefsBase64(pair: RefPair): Promise<{
  conceptBase64: string;
  referenceBase64: string;
}> {
  const [concept, reference] = await Promise.all([
    readFile(pair.conceptPath),
    readFile(pair.referencePath),
  ]);
  return {
    conceptBase64: concept.toString('base64'),
    referenceBase64: reference.toString('base64'),
  };
}
