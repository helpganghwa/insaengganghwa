import 'server-only';

import { sql, type SQL } from 'drizzle-orm';

import { db } from '@/lib/db/client';

/**
 * 승자 이름 스냅샷 컬럼(0201 `conquest_battles.winner_guild_name`) 호환 조각(2026-09-17).
 * 컬럼은 소규모 업데이트 8 배포 때 프로덕션에 생긴다. 그 전에도 스테이징 역사 페이지가 프로덕션 DB를 읽으므로,
 * 컬럼이 없으면 종전 조회(guilds 조인만)로, 있으면 coalesce(현재 이름, 스냅샷)으로 동작한다. 배포 후엔 자동으로 새 경로.
 * 조회는 information_schema 한 줄이라 집계 쿼리에 비해 비용이 무시할 만하다(요청 스코프 DB를 그대로 따른다).
 */
export async function winnerNameFragments(): Promise<{
  /** `coalesce(g.name, cb.winner_guild_name)` 또는 `g.name` — 승자 이름(별칭 g/cb 고정). */
  winner: (guildAlias: string, battleAlias: string) => SQL;
  /** `(x.winner_guild_id is not null or x.winner_guild_name is not null)` 또는 id만 — 승자가 있는 전투 조건. */
  hasWinner: (battleAlias: string) => SQL;
}> {
  const rows = (await db.execute(
    sql`select 1 from information_schema.columns where table_name = 'conquest_battles' and column_name = 'winner_guild_name'`,
  )) as unknown as unknown[];
  const has = rows.length > 0;
  return {
    winner: (g, cb) => sql.raw(has ? `coalesce(${g}.name, ${cb}.winner_guild_name)` : `${g}.name`),
    hasWinner: (cb) => sql.raw(has ? `(${cb}.winner_guild_id is not null or ${cb}.winner_guild_name is not null)` : `${cb}.winner_guild_id is not null`),
  };
}
