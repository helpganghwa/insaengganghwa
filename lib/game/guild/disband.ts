import 'server-only';

import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { guilds, guildMembers, zones } from '@/lib/db/schema/guild';

import { logGuildAudit } from './audit';
import { isConquestLocked } from './conquest/schedule';
import { GuildError } from './errors';
import { recalcTaxBonus } from './tax';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * 길드 보유 구역 중립화 + 길드 삭제(멤버 cascade) — GUILD §1 해산.
 * 보유 구역: 소유·집행관·점령시각 해제(중립화). 세금 풀은 길드 삭제로 소멸.
 *
 * ⚠ 점령전 잠금 창(23:00~00:59)에 부르지 말 것 — 그 사이엔 23시에 산출된 미공개 전투가 떠 있고,
 *  길드가 삭제되면 `conquest_battles.winner_guild_id`가 FK(on delete set null)로 NULL이 된다.
 *  자정 공개는 winner가 null이면 소유권을 넘기지 않고 이전 소유자를 '방어 성공'으로 분류하므로,
 *  **실제로 패배한 길드가 방어에 성공했다는 우편을 받고** 리플레이(finale)와 결과가 어긋난다.
 *  자발 해산(disbandGuild)은 아래에서 창을 막는다. 자동 해산 cron은 KST 12시라 창 밖이다.
 */
export async function neutralizeAndDeleteGuild(tx: Tx, guildId: bigint): Promise<void> {
  // 해산 흔적(2026-07-16) — 월드 피드 + 점령전 연대기 재료. 길드 행이 삭제되면 이름·구역을
  // 복원할 수 없으므로 삭제 **전에** 스냅샷을 world_events(guild_disband)로 남긴다
  // (자발 해산·마지막 멤버 탈퇴 자동 해산 공용 경로라 여기 한 곳이면 전 경로 커버).
  const [g] = await tx
    .select({ name: guilds.name, serverId: guilds.serverId })
    .from(guilds)
    .where(eq(guilds.id, guildId))
    .limit(1);
  const freed = await tx
    .select({ name: zones.name })
    .from(zones)
    .where(eq(zones.ownerGuildId, guildId));
  if (g) {
    await tx.execute(sql`
      insert into world_events (server_id, type, guild_id, detail)
      values (${g.serverId}, 'guild_disband', ${guildId},
              ${JSON.stringify({ guildName: g.name, zones: freed.map((z) => z.name) })}::jsonb)
    `);
  }
  await tx
    .update(zones)
    .set({ ownerGuildId: null, executorUserId: null, capturedAt: null, taxBonus: 1 })
    .where(eq(zones.ownerGuildId, guildId));
  await tx.delete(guilds).where(eq(guilds.id, guildId)); // guild_members ON DELETE CASCADE
  // 해산으로 구역이 중립화됐으니 나머지 길드의 독점 세금 보너스(B안)도 재계산(완전장악 상태 변동 반영).
  if (g?.serverId != null) await recalcTaxBonus(g.serverId, tx);
}

/** 길드장 자발 해산 — GUILD §1. 길드장만 가능. 정산·공개 창(23:00~00:59)에는 금지. */
export function disbandGuild(input: { userId: string; serverId: number }): Promise<void> {
  // 배치·집행관 지정·거주 이동과 같은 잠금(schedule.isConquestLocked). 창 안에서 해산하면
  // 미공개 전투의 승자가 사라져 결과가 뒤틀린다(위 neutralizeAndDeleteGuild 주석 참조).
  if (isConquestLocked()) throw new GuildError('BATTLE_IN_PROGRESS');
  return db.transaction(async (tx) => {
    const [m] = await tx
      .select({ guildId: guildMembers.guildId, role: guildMembers.role })
      .from(guildMembers)
      .where(and(eq(guildMembers.userId, input.userId), eq(guildMembers.serverId, input.serverId)))
      .for('update');
    if (!m) throw new GuildError('NOT_IN_GUILD');
    if (m.role !== 'leader') throw new GuildError('NOT_LEADER');
    // 로그 먼저(감사 로그는 guilds FK 없음 → 길드 삭제 후에도 잔존).
    await logGuildAudit(tx, {
      serverId: input.serverId,
      guildId: m.guildId,
      actorUserId: input.userId,
      action: 'disband',
    });
    await neutralizeAndDeleteGuild(tx, m.guildId);
  });
}
