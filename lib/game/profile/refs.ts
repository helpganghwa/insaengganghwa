/**
 * PROFILE §4.3 — Pixellab v2 reference 풀 매핑.
 *
 * v1: 모든 케이스에 검증된 단일 쌍 (concept=bishonen-red, reference=bishojo-elf).
 * v6 사용자 만족 결과의 입력 매핑(2026-05-27).
 *
 * 추후 ref pool 확장 시 gender·옵션 기반 분기 추가 — `reference-bishojo-adventurer.png`도
 * pool에 보관(PROFILE §11).
 */
import 'server-only';

import { join } from 'node:path';
import { readFile } from 'node:fs/promises';

export type ProfileGender = 'male' | 'female';

const REFS_DIR = join(process.cwd(), 'public', 'sprites', 'profile', 'refs');

const CONCEPT_BISHONEN_RED = 'concept-bishonen-red.png';
const REFERENCE_BISHOJO_ELF = 'reference-bishojo-elf.png';

export interface RefPair {
  /** concept_image — 톤 주도 ref. base64 변환 전 절대 경로. */
  conceptPath: string;
  /** reference_image — 구도 보조 ref. base64 변환 전 절대 경로. */
  referencePath: string;
}

/**
 * v1: 옵션 무관 단일 쌍 반환. 시그니처는 옵션 받게 두고 분기는 추후 확장.
 */
export function pickRefs(_opts: { gender: ProfileGender }): RefPair {
  return {
    conceptPath: join(REFS_DIR, CONCEPT_BISHONEN_RED),
    referencePath: join(REFS_DIR, REFERENCE_BISHOJO_ELF),
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
