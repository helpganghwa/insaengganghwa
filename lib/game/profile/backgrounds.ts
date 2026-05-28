/**
 * PROFILE §8 — 프로필 배경 카탈로그(전역 1개 선택).
 * 고정 에셋: public/bg/{key}.png (pixellab 생성, 꽉 찬 불투명 씬).
 * 서버/클라 공용 순수 상수 — 'server-only' 붙이지 않음(선택 UI에서 import).
 */
export type ProfileBackgroundKey = 'forge' | 'sanctum' | 'meadow';

export interface ProfileBackground {
  key: ProfileBackgroundKey;
  label: string;
  /** public 정적 경로. */
  src: string;
}

export const PROFILE_BACKGROUNDS: ProfileBackground[] = [
  { key: 'forge', label: '강화 대장간', src: '/bg/forge.png' },
  { key: 'sanctum', label: '룬 제단', src: '/bg/sanctum.png' },
  { key: 'meadow', label: '노을 평원', src: '/bg/meadow.png' },
];

const BG_MAP = new Map(PROFILE_BACKGROUNDS.map((b) => [b.key, b] as const));

/** key → public src. 미설정/미존재면 null. */
export function backgroundSrc(key: string | null | undefined): string | null {
  if (!key) return null;
  return BG_MAP.get(key as ProfileBackgroundKey)?.src ?? null;
}

/** 화이트리스트 검증(액션 입력 가드). */
export function isValidBackground(key: string): key is ProfileBackgroundKey {
  return BG_MAP.has(key as ProfileBackgroundKey);
}
