import 'server-only';

import { sql, type SQL } from 'drizzle-orm';

import { TAX_COLLECT_COOLDOWN_LEGACY_MIN, TAX_COLLECT_COOLDOWN_MIN, taxCooldownMsFor } from './balance';

/**
 * 세금 수금 쿨다운 48h 적용 시작(2026-09-18, 소규모 업데이트 8) — 이 시각 **이후에 시작된** 쿨다운부터 48h,
 * 그 전에 시작된 쿨다운은 끝까지 72h(balance.ts 전환 규칙).
 *
 * ⚠ 프로덕션 값은 **8회차 배포 커밋에서 실제 배포 시각으로 바꾼다.** 먼 미래(기본값)면 프로덕션은 계속 72h로
 *   동작한다(안전한 기본 — 바꾸는 걸 잊어도 규칙이 앞당겨지지 않는다).
 * 스테이징(preview)·로컬은 이 커밋 시각부터 바로 적용해 확인할 수 있게 한다. 허용 목록으로 닫는다 —
 * VERCEL_ENV가 비어 있는 프로덕션 빌드(설정 실수)에서 조기 적용되지 않게(raid free-open.ts와 같은 방식).
 */
export const TAX_COOLDOWN_48H_SINCE_PROD_ISO = '2026-09-18T23:12:00.000Z'; // 소규모 업데이트 8 프로덕션 배포 시각
export const TAX_COOLDOWN_48H_SINCE_STAGING_ISO = '2026-09-18T06:00:00.000Z';

export function taxCooldown48SinceMs(
  env: string | undefined = process.env.VERCEL_ENV,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): number {
  const early = env === 'preview' || env === 'development' || nodeEnv !== 'production';
  return Date.parse(early ? TAX_COOLDOWN_48H_SINCE_STAGING_ISO : TAX_COOLDOWN_48H_SINCE_PROD_ISO);
}

/**
 * SQL 조건 — `<alias>.<col>`에서 시작된 쿨다운이 `at` 시점에 끝났는가(null이면 게이트 없음 = 참).
 * 쿨다운 길이는 그 시작 시각이 48h 적용 시작 전이면 72h, 이후면 48h.
 */
export function taxCooldownDoneSql(alias: string, col: 'captured_at' | 'last_tax_collected_at', at: SQL | string): SQL {
  const c = sql.raw(`${alias}.${col}`);
  const since = new Date(taxCooldown48SinceMs()).toISOString();
  const atExpr = typeof at === 'string' ? sql`${at}::timestamptz` : at;
  return sql`(${c} is null or ${c} <= ${atExpr} - ((case when ${c} >= ${since}::timestamptz then ${TAX_COLLECT_COOLDOWN_MIN} else ${TAX_COLLECT_COOLDOWN_LEGACY_MIN} end) || ' minutes')::interval)`;
}

/** 지금 수금하면 걸리는 쿨다운(분) — 안내 문구용(화면 컴포넌트가 렌더 중 시계를 읽지 않게 여기서). */
export function taxNextCooldownMin(): number {
  return taxCooldownMsFor(Date.now(), taxCooldown48SinceMs()) / 60_000;
}
