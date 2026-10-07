/**
 * 월드보스 종류 — 출현 구역의 지역(zone_region)마다 하나. 순수 모듈(클라이언트도 가져다 쓴다).
 * 이름은 그림 시안과 함께 확정할 자리 표시(docs/WORLD-BOSS.md §1). 바꾸면 우편·푸시 문구에 그대로 반영된다.
 */
import { REGION_META, type Region } from '@/lib/game/guild/region-meta';

export type WorldBossRegion = Region;

export const WORLD_BOSS_NAMES: Record<WorldBossRegion, string> = {
  volcano: '화산의 거룡',
  temple: '잊힌 신전의 수호자',
  swamp: '늪의 군주',
  orc: '오크 대족장',
  kingdom: '왕국의 폭군',
  angel: '타락한 대천사',
};

export function isWorldBossRegion(v: unknown): v is WorldBossRegion {
  return typeof v === 'string' && Object.hasOwn(WORLD_BOSS_NAMES, v);
}

/** 지역 값 → 보스 이름. 알 수 없는 값이면 '월드보스'. */
export function worldBossName(region: string): string {
  return isWorldBossRegion(region) ? WORLD_BOSS_NAMES[region] : '월드보스';
}

/** 지역 값 → 지역 표시명(세계지도와 같은 이름). */
export function worldBossRegionLabel(region: string): string {
  return isWorldBossRegion(region) ? REGION_META[region].label : '';
}

/**
 * 보스 그림 경로 — 지역마다 한 장(`public/sprites/world-boss/<region>.png`, 128px).
 * 지금은 레이드 보스 그림을 복사한 자리 표시(10-07) — 전용 그림은 시안 확정 뒤 Pixellab으로 생성해 같은 경로에 덮어쓴다.
 */
export function worldBossSpriteUrl(region: string): string {
  return `/sprites/world-boss/${isWorldBossRegion(region) ? region : 'volcano'}.png`;
}
