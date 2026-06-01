/**
 * 레이드 보스 시각 자산 — 정적 PNG + APNG(자체 재생) + 배경 이미지.
 *
 * 자산 위치 (public/sprites/boss/):
 *   <code>.png         정적 단일 PNG (필수)
 *   <code>__anim.png   APNG 애니 (있으면 BossSprite가 자동 재생)
 *   bg/<code>.png      배경 이미지 (없으면 BOSS_BG_CLASS 그라데이션 폴백)
 *
 * Pixellab 객체 애니는 API 다운로드 불가 → 웹에서 APNG 수동 export 후
 * `<code>__anim.png`로 배치. 신화 워크플로와 동일.
 */
import type { RaidBoss } from './bosses';

export type BossSpriteEntry = {
  static: string;
  apng?: string;
  bg?: string;
};

/** 보스별 폴백 그라데이션 — bg 부재 시 분위기 보장. Tailwind from/via/to. */
export const BOSS_BG_CLASS: Record<RaidBoss, string> = {
  slime_king: 'from-emerald-900 via-green-800 to-emerald-950',
  orc_chief: 'from-red-950 via-stone-800 to-zinc-950',
  stone_golem: 'from-stone-600 via-stone-800 to-zinc-900',
  dragon_west: 'from-orange-900 via-red-900 to-zinc-950',
  fallen_angel: 'from-violet-950 via-purple-900 to-zinc-950',
};

export function getBossBgClass(code: string): string {
  return (
    (BOSS_BG_CLASS as Record<string, string>)[code] ??
    'from-zinc-800 via-zinc-900 to-black'
  );
}

/** 보스별 카드 외곽 글로우 색 — 배경 톤과 동조시켜 시각 정체성 유지. */
const BOSS_SHADOW: Record<RaidBoss, string> = {
  slime_king:   '0 0 24px rgba(16, 185, 129, 0.40)',   // emerald
  orc_chief:    '0 0 24px rgba(220, 38, 38, 0.40)',    // red
  stone_golem:  '0 0 24px rgba(168, 162, 158, 0.40)',  // stone
  dragon_west:  '0 0 24px rgba(249, 115, 22, 0.45)',   // orange
  fallen_angel: '0 0 24px rgba(168, 85, 247, 0.40)',   // violet
};

export function getBossShadow(code: string): string {
  return (
    (BOSS_SHADOW as Record<string, string>)[code] ??
    '0 0 24px rgba(245, 158, 11, 0.35)'
  );
}

export const BOSS_SPRITES: Record<RaidBoss, BossSpriteEntry> = {
  slime_king: {
    static: '/sprites/boss/slime_king.png',
    apng: '/sprites/boss/slime_king__anim.png',
    bg: '/sprites/boss/bg/slime_king.png',
  },
  orc_chief: {
    static: '/sprites/boss/orc_chief.png',
    apng: '/sprites/boss/orc_chief__anim.png',
    bg: '/sprites/boss/bg/orc_chief.png',
  },
  stone_golem: {
    static: '/sprites/boss/stone_golem.png',
    apng: '/sprites/boss/stone_golem__anim.png',
    bg: '/sprites/boss/bg/stone_golem.png',
  },
  dragon_west: {
    static: '/sprites/boss/dragon_west.png',
    apng: '/sprites/boss/dragon_west__anim.png',
    bg: '/sprites/boss/bg/dragon_west.png',
  },
  fallen_angel: {
    static: '/sprites/boss/fallen_angel.png',
    apng: '/sprites/boss/fallen_angel__anim.png',
    bg: '/sprites/boss/bg/fallen_angel.png',
  },
};

export function getBossSprite(code: string): BossSpriteEntry | null {
  return (BOSS_SPRITES as Record<string, BossSpriteEntry>)[code] ?? null;
}

export function getBossBg(code: string): string | null {
  return getBossSprite(code)?.bg ?? null;
}
