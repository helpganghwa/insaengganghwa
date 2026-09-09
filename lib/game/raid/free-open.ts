import 'server-only';

import { RAID_FREE_OPENS_PER_DAY, RAID_FREE_OPEN_SINCE_ISO, RAID_TIERS, type RaidTier } from '@/lib/game/balance';

/**
 * 하루 첫 소환 무료(2026-09-08 결정) 적용 여부.
 * 프로덕션은 RAID_FREE_OPEN_SINCE_ISO(업데이트 다음 날 KST 0시)부터, 스테이징(preview)·로컬은 즉시 —
 * "스테이징은 바로 적용해 테스트, 실서버는 업데이트 다음 날부터"(사용자). 서버 전용: VERCEL_ENV는 클라에 없다.
 */
export function raidFreeOpenActive(
  at: Date | number = Date.now(),
  env: string | undefined = process.env.VERCEL_ENV,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): boolean {
  // 허용 목록으로 닫는다(검토 지적) — VERCEL_ENV가 비어 있는 프로덕션 빌드(설정 실수)에서 조기 활성되지 않게.
  // 즉시 적용 = Vercel preview 또는 프로덕션 빌드가 아닌 로컬(dev·test). 그 외(production)는 시작 시각부터.
  const early = env === 'preview' || env === 'development' || nodeEnv !== 'production';
  if (early) return true;
  return new Date(at).getTime() >= Date.parse(RAID_FREE_OPEN_SINCE_ISO);
}

/** 이번 소환비 — 오늘 이미 소환(호스팅)한 횟수가 무료 횟수 미만이면 0. 참여는 세지 않는다. */
export function raidOpenCost(
  tier: RaidTier,
  hostedToday: number,
  at: Date | number = Date.now(),
  env: string | undefined = process.env.VERCEL_ENV,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): number {
  return raidFreeOpenActive(at, env, nodeEnv) && hostedToday < RAID_FREE_OPENS_PER_DAY ? 0 : RAID_TIERS[tier].openCost;
}
