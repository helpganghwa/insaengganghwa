import 'server-only';

import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * 길드 기여도 보관(0217) — 문의 #331. 탈퇴·추방으로 guild_members 행이 지워지기 **직전에** 호출해
 * 그 길드에서 쌓은 기여도를 남긴다. 같은 길드에 이미 보관분이 있으면(두 번째 이탈) 지금 값으로 덮는다 —
 * 재가입 때 보관분을 합쳐 넣었으므로 현재 값이 곧 그 길드 누적이다. 기여도 0이면 남길 것이 없어 건너뛴다.
 */
export async function stashContribution(tx: Tx, userId: string, serverId: number): Promise<void> {
  await tx.execute(sql`
    insert into guild_contribution_stash (user_id, server_id, guild_id, contribution_points, left_at)
    select m.user_id, m.server_id, m.guild_id, m.contribution_points, now()
      from guild_members m
     where m.user_id = ${userId}::uuid and m.server_id = ${serverId} and m.contribution_points > 0
    on conflict (user_id, server_id, guild_id)
      do update set contribution_points = excluded.contribution_points, left_at = excluded.left_at`);
}

/**
 * 재가입 복원 — guild_members insert **직후** 같은 트랜잭션에서 호출. 그 길드의 보관분을 꺼내 기여도에 더하고
 * 보관 행은 지운다(다음 이탈 때 다시 쌓인 값 전체로 보관). 보관분이 없으면 아무것도 하지 않는다.
 */
export async function restoreContribution(
  tx: Tx,
  userId: string,
  serverId: number,
  guildId: bigint | string,
): Promise<void> {
  await tx.execute(sql`
    with s as (
      delete from guild_contribution_stash
       where user_id = ${userId}::uuid and server_id = ${serverId} and guild_id = ${String(guildId)}::bigint
      returning contribution_points
    )
    update guild_members m
       set contribution_points = m.contribution_points + s.contribution_points
      from s
     where m.user_id = ${userId}::uuid and m.server_id = ${serverId}`);
}
