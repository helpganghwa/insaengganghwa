import 'server-only';

import { and, eq, isNotNull, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { guilds, guildMembers } from '@/lib/db/schema/guild';
import { mailbox } from '@/lib/db/schema/mailbox';

import { GUILD_LEADER_HANDOVER_DAYS, GUILD_LEADER_HANDOVER_WARN_DAYS } from './balance';

/**
 * 길드장 자동 위임 — GUILD §4. 매일 cron. 길드장 7일 미접속 시 직책 이전(추방 아님, 멤버 유지).
 *  - 후계자 = **활성 멤버**(미접속<7일) 중 부길드장 우선 → 누적 기여도 1위 → 동률 시 가입 오래된 순.
 *    (부길드장 전원 잠수/부재면 활성 일반 멤버로 연쇄 승격 — 빈 길드 영구 잠금 방지.)
 *  - 5일차 경고 우편 1회(leader_handover_warned_at 멱등) 후 7일차 위임 — 억울한 강등 방지.
 *    (푸시는 푸시 v1 범위 밖이라 우편만. 길드장 재활동 시 경고 플래그 리셋.)
 *  - 미접속 기준 = characters.last_seen_at(없으면 guilds.created_at 폴백). 활성 후계자 없으면 보류.
 */
type GuildRow = { id: string; leader: string; warnedAt: Date | null; daysInactive: number };
type Successor = { userId: string; nickname: string | null };

export async function runLeaderHandover(serverId: number): Promise<{ warned: number; handed: number }> {
  const rows = (await db.execute(sql`
    select g.id::text id, g.leader_user_id::text leader, g.leader_handover_warned_at warned_at,
           extract(epoch from (now() - coalesce(c.last_seen_at, g.created_at))) / 86400 days_inactive
    from guilds g
    left join characters c on c.user_id = g.leader_user_id and c.server_id = g.server_id
    where g.server_id = ${serverId}
  `)) as unknown as { id: string; leader: string; warned_at: Date | null; days_inactive: number }[];

  let warned = 0;
  let handed = 0;
  for (const r of rows) {
    const g: GuildRow = { id: r.id, leader: r.leader, warnedAt: r.warned_at, daysInactive: Number(r.days_inactive) };

    // 길드장 재활동 → 경고 플래그만 켜져 있으면 리셋(다음 잠수 때 다시 경고).
    if (g.daysInactive < GUILD_LEADER_HANDOVER_WARN_DAYS) {
      if (g.warnedAt) {
        await db
          .update(guilds)
          .set({ leaderHandoverWarnedAt: null })
          .where(and(eq(guilds.id, BigInt(g.id)), isNotNull(guilds.leaderHandoverWarnedAt)));
      }
      continue;
    }

    // 7일 이상 → 위임 시도(활성 후계자 있을 때만).
    if (g.daysInactive >= GUILD_LEADER_HANDOVER_DAYS) {
      if (await handover(serverId, g)) handed++;
      continue;
    }

    // 5~6일차 → 경고 우편 1회(멱등).
    if (!g.warnedAt) {
      if (await warnLeader(serverId, g)) warned++;
    }
  }
  return { warned, handed };
}

/** 5일차 경고 우편 + 멱등 플래그 set(동시 cron 중복 방지 — warned_at IS NULL 조건부 update). */
async function warnLeader(serverId: number, g: GuildRow): Promise<boolean> {
  return db.transaction(async (tx) => {
    const set = await tx
      .update(guilds)
      .set({ leaderHandoverWarnedAt: sql`now()` })
      .where(and(eq(guilds.id, BigInt(g.id)), sql`${guilds.leaderHandoverWarnedAt} is null`))
      .returning({ id: guilds.id });
    if (set.length === 0) return false; // 이미 다른 tick이 경고함(멱등)
    await tx.insert(mailbox).values({
      userId: g.leader,
      serverId,
      type: 'notice',
      title: '길드장 자동 위임 경고',
      body: `장기 미접속이 이어지고 있습니다. ${GUILD_LEADER_HANDOVER_DAYS}일 이상 접속하지 않으면 길드장 직책이 활성 길드원에게 자동으로 위임됩니다(길드에는 멤버로 남습니다). 길드를 계속 이끌려면 접속해 주세요.`,
      senderLabel: '시스템',
      payload: {},
    });
    return true;
  });
}

/** 7일차 위임 — 활성 후계자 승격 + 길드장 강등(멤버). 후계자 없으면 보류(false). */
async function handover(serverId: number, g: GuildRow): Promise<boolean> {
  return db.transaction(async (tx) => {
    // 길드장 행 잠금(동시 leave/transfer 경합 차단). 이미 다른 사람이면 스킵.
    const [leaderM] = await tx
      .select({ guildId: guildMembers.guildId, role: guildMembers.role })
      .from(guildMembers)
      .where(and(eq(guildMembers.userId, g.leader), eq(guildMembers.serverId, serverId)))
      .for('update');
    if (!leaderM || leaderM.role !== 'leader') return false;

    // 후계자: 활성(미접속<7일) 멤버 중 부길드장 우선 → 기여도 desc → 가입순 asc.
    const [s] = (await tx.execute(sql`
      select m.user_id::text user_id, c.nickname
      from guild_members m
      left join characters c on c.user_id = m.user_id and c.server_id = m.server_id
      where m.guild_id = ${leaderM.guildId} and m.user_id <> ${g.leader}
        and coalesce(c.last_seen_at, m.joined_at) >= now() - interval '${sql.raw(String(GUILD_LEADER_HANDOVER_DAYS))} days'
      order by (m.role = 'vice') desc, m.contribution_points desc, m.joined_at asc
      limit 1
    `)) as unknown as Successor[];
    if (!s) return false; // 활성 후계자 없음 — 보류(빈 길드는 그대로)

    await tx
      .update(guildMembers)
      .set({ role: 'member' })
      .where(and(eq(guildMembers.userId, g.leader), eq(guildMembers.serverId, serverId)));
    await tx
      .update(guildMembers)
      .set({ role: 'leader' })
      .where(and(eq(guildMembers.userId, s.userId), eq(guildMembers.serverId, serverId)));
    await tx
      .update(guilds)
      .set({ leaderUserId: s.userId, leaderHandoverWarnedAt: null })
      .where(eq(guilds.id, BigInt(g.id)));

    // 통지 우편 — 신임 길드장 + 강등된 전 길드장(복귀 시 확인).
    await tx.insert(mailbox).values([
      {
        userId: s.userId,
        serverId,
        type: 'notice' as const,
        title: '길드장 위임',
        body: '전 길드장의 장기 미접속으로 길드장 직책을 위임받았습니다. 길드 운영을 이어가 주세요.',
        senderLabel: '시스템',
        payload: {},
      },
      {
        userId: g.leader,
        serverId,
        type: 'notice' as const,
        title: '길드장 자동 위임',
        body: `장기 미접속으로 길드장 직책이 ${s.nickname ?? '활성 길드원'}에게 자동 위임되었습니다. 길드에는 멤버로 남아 있습니다.`,
        senderLabel: '시스템',
        payload: {},
      },
    ]);
    return true;
  });
}
