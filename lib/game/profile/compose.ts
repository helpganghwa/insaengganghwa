/**
 * 프로필 외형 랜덤 픽커 — gender만 유저 선택, 종족·머리길이·포즈는 서버 random 부여.
 * 서버 RNG(crypto.getRandomValues, CLAUDE §3.1). 생성 description 합성은 v3(compose-v3.ts)가 담당.
 */
import 'server-only';

import type { ProfileGender } from './refs';

/**
 * 종족 6종 — gender weighted random(여: nekomimi/fairy 가능, 남: dragonkin 가능, human·elf·dark_elf 공통).
 */
export type ProfileRace = 'human' | 'elf' | 'dark_elf' | 'nekomimi' | 'dragonkin' | 'fairy';

/** 머리 길이 — 서버 random. natural = 어깨선 전후 자연스러운 길이. */
export type ProfileHairLength = 'long' | 'short' | 'natural';

/** 포즈 — natural 1종(전신·비율 보존). */
export type ProfilePose = 'natural';

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

/** gender별 weighted random race — 서버 RNG. */
export function pickRandomRace(gender: ProfileGender): ProfileRace {
  const table = RACE_WEIGHTS_BY_GENDER[gender];
  const r = crypto.getRandomValues(new Uint32Array(1))[0]! % 10000;
  for (const { race, cumBp } of table) if (r < cumBp) return race;
  return 'human';
}

const ALL_HAIR_LENGTHS: ProfileHairLength[] = ['long', 'short', 'natural'];

/** 머리 길이 균등 random — 서버 RNG. */
export function pickRandomHairLength(): ProfileHairLength {
  const i = crypto.getRandomValues(new Uint32Array(1))[0]! % ALL_HAIR_LENGTHS.length;
  return ALL_HAIR_LENGTHS[i]!;
}

const ALL_POSES: ProfilePose[] = ['natural'];

/** 포즈 균등 random — 서버 RNG. */
export function pickRandomPose(): ProfilePose {
  const i = crypto.getRandomValues(new Uint32Array(1))[0]! % ALL_POSES.length;
  return ALL_POSES[i]!;
}
