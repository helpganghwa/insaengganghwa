import 'server-only';

import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { guilds, guildMembers, guildLeaveLog, zones } from '@/lib/db/schema/guild';

import { logGuildAudit } from './audit';
import { GuildError } from './errors';
import { recalcTaxBonus } from './tax';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * 길드 보유 구역 중립화 + 길드 삭제(멤버 cascade) — GUILD §1 해산.
 * 보유 구역: 소유·집행관·점령시각 해제(중립화). 세금 풀은 길드 삭제로 소멸.
 *
 * ⚠ 점령전 잠금 창(23:00~00:59)에 불리면 — 그 사이엔 23시에 산출된 미공개 전투가 떠 있고,
 *  길드가 삭제되면 `conquest_battles.winner_guild_id`가 FK(on delete set null)로 NULL이 된다.
 *  자정 공개는 winner가 null이면 소유권을 넘기지 않으므로 구역은 이전 소유자에게 남고,
 *  우편 분류도 '방어 성공'으로 떨어진다. 반면 리플레이(finale)에는 해산한 길드가 이긴 장면이
 *  그대로 남아 결과 표기와 어긋난다. **이 창을 막지는 않는다** — 판단 근거는 disbandGuild 주석.
 *  자동 해산 cron은 KST 12시라 애초에 창 밖이다.
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

/**
 * 길드장 자발 해산 — GUILD §1. 길드장만 가능.
 *
 * ⚠ **정산·공개 창(23:00~00:59)에도 막지 않는다 — 의도된 선택이다.**
 *  배치·집행관 지정·거주 이동은 창 안에서 잠그지만(schedule.isConquestLocked) 그 이유는
 *  **전투 입력이 바뀌거나 소유권 TOCTOU가 생기기 때문**이다. 해산은 이미 확정된 전투 결과를
 *  바꾸지 않고 사후 참조(winner_guild_id)만 끊으므로 성격이 다르다. 실제 여파는 위
 *  neutralizeAndDeleteGuild 주석의 연쇄 하나뿐인데, 재화 손실도 무결성 훼손도 없고 소유권 결과
 *  (이전 소유자 유지)도 합리적이다. 남는 건 리플레이(finale)와 결과 표기의 불일치이고,
 *  그마저 **승리 직후 1시간 안에 해산**이 겹쳐야 발생한다.
 *  반면 잠그면 길드를 접기로 한 유저에게 하루 2시간씩 납득 안 되는 실패를 준다.
 *  → 연대기가 이 경우를 인지해 서술하는 쪽으로 처리한다(승자 NULL + finale 로스터 +
 *    world_events.guild_disband 상관으로 '승자가 사라진 전투'를 판별 가능).
 *  (2026-08-11 사용자 확정. 같은 경로를 다시 발견하고 잠그지 말 것.)
 */
export function disbandGuild(input: { userId: string; serverId: number }): Promise<void> {
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
    // 멤버별 여파 행(target_user_id) — "이 유저가 언제 길드를 잃었는가"의 유일한 사후 근거다.
    // 해산은 멤버 행을 CASCADE로 지워 흔적이 없고, guild_leave_log에 넣는 선택은 안 된다 —
    // 그 테이블은 24h 재가입 잠금의 근거라 리더의 결정으로 쫓겨난 무고한 멤버까지 잠근다.
    // 칭호 '무소속'(길드 없이 7일)이 이 행과 leave_log의 최댓값을 기산점으로 쓴다(judge.ts).
    // 이 행이 없으면 해산 멤버는 이력 없음으로 읽혀 캐릭터 생성일 폴백으로 즉시 지급된다.
    const members = await tx
      .select({ userId: guildMembers.userId })
      .from(guildMembers)
      .where(and(eq(guildMembers.guildId, m.guildId), eq(guildMembers.serverId, input.serverId)));
    for (const mem of members) {
      await logGuildAudit(tx, {
        serverId: input.serverId,
        guildId: m.guildId,
        actorUserId: input.userId,
        action: 'disband',
        targetUserId: mem.userId,
      });
    }
    // 해산을 **결정한 길드장 본인**에게는 24h 재가입 잠금을 남긴다(전수 감사 2026-08-21) —
    // 솔로 길드장이 "탈퇴" 대신 "해산"을 누르면 잠금 0으로 즉시 갈아타던 우회 차단.
    // 일반 멤버는 본인 의사가 아니므로 위 disband audit 행만(잠금 없음 — 기존 의도 유지).
    await tx.insert(guildLeaveLog).values({ userId: input.userId, serverId: input.serverId });
    await neutralizeAndDeleteGuild(tx, m.guildId);
  });
}
