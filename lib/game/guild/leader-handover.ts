import 'server-only';

import { and, eq, isNotNull, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { guilds, guildMembers } from '@/lib/db/schema/guild';
import { mailbox } from '@/lib/db/schema/mailbox';

import { logGuildAudit } from './audit';
import { GUILD_LEADER_HANDOVER_DAYS, GUILD_LEADER_HANDOVER_WARN_DAYS } from './balance';
import { neutralizeAndDeleteGuild } from './disband';

/**
 * 길드장 자동 위임/해산 — GUILD §4. 매일 cron. 길드장 7일 미접속 시 직책 이전(추방 아님, 멤버 유지).
 *  - 후계자 = **활성 멤버**(미접속<7일) 중 부길드장 우선 → 누적 기여도 1위 → 동률 시 가입 오래된 순.
 *    (부길드장 전원 잠수/부재면 활성 일반 멤버로 연쇄 승격 — 빈 길드 영구 잠금 방지.)
 *  - **활성 후계자가 없으면 자동 해산**(2026-07-28 사용자 확정) — 1인/전원 잠수 길드가 이름을
 *    점유한 채 영구 존속하던 공백 해소. 해산 스냅샷·구역 중립화는 disband 공용 경로.
 *  - 5일차 경고 우편 1회(leader_handover_warned_at 멱등) 후 7일차 위임/해산 — 억울한 강등 방지.
 *    (푸시는 푸시 v1 범위 밖이라 우편만. 길드장 재활동 시 경고 플래그 리셋.)
 *  - 미접속 기준 = characters.last_seen_at(없으면 guilds.created_at 폴백).
 */
type GuildRow = { id: string; leader: string; warnedAt: Date | null; daysInactive: number };
type Successor = { userId: string; nickname: string | null };

export async function runLeaderHandover(
  serverId: number,
): Promise<{ warned: number; handed: number; disbanded: number }> {
  const rows = (await db.execute(sql`
    select g.id::text id, g.leader_user_id::text leader, g.leader_handover_warned_at warned_at,
           extract(epoch from (now() - coalesce(c.last_seen_at, g.created_at))) / 86400 days_inactive
    from guilds g
    left join characters c on c.user_id = g.leader_user_id and c.server_id = g.server_id
    where g.server_id = ${serverId}
  `)) as unknown as { id: string; leader: string; warned_at: Date | null; days_inactive: number }[];

  let warned = 0;
  let handed = 0;
  let disbanded = 0;
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

    // 7일 이상 → 위임 시도, 활성 후계자 없으면 자동 해산.
    if (g.daysInactive >= GUILD_LEADER_HANDOVER_DAYS) {
      const res = await handover(serverId, g);
      if (res === 'handed') handed++;
      else if (res === 'no_successor' && (await autoDisband(serverId, g))) disbanded++;
      continue;
    }

    // 5~6일차 → 경고 우편 1회(멱등).
    if (!g.warnedAt) {
      if (await warnLeader(serverId, g)) warned++;
    }
  }
  return { warned, handed, disbanded };
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
      type: 'guild',
      title: '길드장 자동 위임 경고',
      body: `장기 미접속이 이어지고 있습니다. ${GUILD_LEADER_HANDOVER_DAYS}일 이상 접속하지 않으면 길드장 직책이 활성 길드원에게 자동으로 위임되며(길드에는 멤버로 남습니다), 위임받을 활성 길드원이 없으면 길드가 자동 해산됩니다. 길드를 계속 이끌려면 접속해 주세요.`,
      senderLabel: '시스템',
      payload: {},
    });
    return true;
  });
}

/**
 * 7일차 위임 — 활성 후계자 승격 + 길드장 강등(멤버).
 * 반환: 'handed'=위임 완료 · 'no_successor'=활성 후계자 없음(→ 호출부가 자동 해산) ·
 *       'skip'=경합/역할 변경 등으로 이번 틱 보류(해산 금지 — 오판 방지).
 */
async function handover(serverId: number, g: GuildRow): Promise<'handed' | 'no_successor' | 'skip'> {
  return db.transaction(async (tx) => {
    // 길드장 행 잠금(동시 leave/transfer 경합 차단). 이미 다른 사람이면 스킵.
    const [leaderM] = await tx
      .select({ guildId: guildMembers.guildId, role: guildMembers.role })
      .from(guildMembers)
      .where(and(eq(guildMembers.userId, g.leader), eq(guildMembers.serverId, serverId)))
      .for('update');
    if (!leaderM || leaderM.role !== 'leader') return 'skip';

    // 후계자: 활성(미접속<7일) 멤버 중 부길드장 우선 → 기여도 desc → 가입순 asc.
    // ⚠ raw execute 행 키는 SQL 별칭 그대로(camel 자동변환 없음) — "userId" 인용 별칭 필수.
    //   (비인용 user_id 별칭을 s.userId로 읽어 undefined → 승격 UPDATE가 UNDEFINED_VALUE로
    //    매번 롤백되던 버그, 2026-07-22)
    const [s] = (await tx.execute(sql`
      select m.user_id::text "userId", c.nickname
      from guild_members m
      left join characters c on c.user_id = m.user_id and c.server_id = m.server_id
      where m.guild_id = ${leaderM.guildId} and m.user_id <> ${g.leader}
        and coalesce(c.last_seen_at, m.joined_at) >= now() - interval '${sql.raw(String(GUILD_LEADER_HANDOVER_DAYS))} days'
      order by (m.role = 'vice') desc, m.contribution_points desc, m.joined_at asc
      limit 1
      for update of m
    `)) as unknown as Successor[];
    if (!s) return 'no_successor'; // 활성 후계자 없음 — 호출부가 자동 해산 진행

    // ⚠ 승급을 먼저(실패 시 아무것도 안 바꾸고 중단) → 강등. 강등 먼저 하면 승급 실패 시 tx가 그대로
    // 커밋돼 리더 없는 동결 길드가 된다. 후계자 행은 for update of m로 잠겨 0행이면 동시삭제 케이스.
    const promoted = await tx
      .update(guildMembers)
      .set({ role: 'leader' })
      .where(and(eq(guildMembers.userId, s.userId), eq(guildMembers.serverId, serverId)))
      .returning({ uid: guildMembers.userId });
    if (promoted.length === 0) return 'skip';
    await tx
      .update(guildMembers)
      .set({ role: 'member' })
      .where(and(eq(guildMembers.userId, g.leader), eq(guildMembers.serverId, serverId)));
    await tx
      .update(guilds)
      .set({ leaderUserId: s.userId, leaderHandoverWarnedAt: null })
      .where(eq(guilds.id, BigInt(g.id)));
    await logGuildAudit(tx, {
      serverId,
      guildId: BigInt(g.id),
      actorUserId: null, // 시스템(cron) 자동 위임
      action: 'auto_handover',
      targetUserId: s.userId,
      detail: { from: g.leader },
    });

    // 통지 우편 — 신임 길드장 + 강등된 전 길드장(복귀 시 확인).
    await tx.insert(mailbox).values([
      {
        userId: s.userId,
        serverId,
        type: 'guild' as const,
        title: '길드장 위임',
        body: '전 길드장의 장기 미접속으로 길드장 직책을 위임받았습니다. 길드 운영을 이어가 주세요.',
        senderLabel: '시스템',
        payload: {},
      },
      {
        userId: g.leader,
        serverId,
        type: 'guild' as const,
        title: '길드장 자동 위임',
        body: `장기 미접속으로 길드장 직책이 ${s.nickname ?? '활성 길드원'}에게 자동 위임되었습니다. 길드에는 멤버로 남아 있습니다.`,
        senderLabel: '시스템',
        payload: {},
      },
    ]);
    return 'handed';
  });
}

/**
 * 자동 해산 — 길드장 7일+ 미접속 && 활성 후계자 0명(1인/전원 잠수 길드). 2026-07-28 사용자 확정.
 * 스냅샷(world_events)·구역 중립화·삭제는 disband 공용 경로. 전 멤버 통지 우편은 삭제 전에
 * (guild_members가 길드 삭제와 cascade — 우편은 독립 잔존이라 복귀 시 확인 가능).
 */
async function autoDisband(serverId: number, g: GuildRow): Promise<boolean> {
  return db.transaction(async (tx) => {
    // 길드장 행 잠금 + 재검증(handover tx와 사이에 상태가 바뀌었을 수 있음 — 별도 tx라 재확인).
    const [leaderM] = await tx
      .select({ guildId: guildMembers.guildId, role: guildMembers.role })
      .from(guildMembers)
      .where(and(eq(guildMembers.userId, g.leader), eq(guildMembers.serverId, serverId)))
      .for('update');
    if (!leaderM || leaderM.role !== 'leader') return false;
    const guildId = leaderM.guildId;

    // 활성 멤버 재확인 — 있으면 해산 금지(이번 틱 보류, 다음 틱에 위임 경로로).
    const [active] = (await tx.execute(sql`
      select 1 from guild_members m
      left join characters c on c.user_id = m.user_id and c.server_id = m.server_id
      where m.guild_id = ${guildId} and m.user_id <> ${g.leader}
        and coalesce(c.last_seen_at, m.joined_at) >= now() - interval '${sql.raw(String(GUILD_LEADER_HANDOVER_DAYS))} days'
      limit 1
    `)) as unknown as unknown[];
    if (active) return false;

    const [gRow] = await tx
      .select({ name: guilds.name })
      .from(guilds)
      .where(eq(guilds.id, guildId))
      .limit(1);
    const members = await tx
      .select({ userId: guildMembers.userId })
      .from(guildMembers)
      .where(eq(guildMembers.guildId, guildId));

    // 로그 먼저(감사 로그는 guilds FK 없음 → 삭제 후에도 잔존) → 통지 우편 → 공용 해산.
    await logGuildAudit(tx, {
      serverId,
      guildId,
      actorUserId: null, // 시스템(cron)
      action: 'disband',
      detail: { auto: true, reason: 'leader_inactive_no_successor' },
    });
    // 멤버별 여파 행(target_user_id) — 자발 해산(disband.ts)과 같은 이유·같은 형식. 이 행이
    // "이 유저가 언제 길드를 잃었는가"의 유일한 사후 근거다(칭호 '무소속' 기산점, judge.ts).
    for (const mem of members) {
      await logGuildAudit(tx, {
        serverId,
        guildId,
        actorUserId: null,
        action: 'disband',
        targetUserId: mem.userId,
        detail: { auto: true },
      });
    }
    if (members.length > 0) {
      await tx.insert(mailbox).values(
        members.map((m) => ({
          userId: m.userId,
          serverId,
          type: 'guild' as const,
          title: '길드 자동 해산',
          body: `길드 '${gRow?.name ?? ''}'이(가) 길드장의 장기 미접속과 활동 길드원 부재로 자동 해산되었습니다. 새 길드에 가입하거나 직접 창설할 수 있습니다.`,
          senderLabel: '시스템',
          payload: {},
        })),
      );
    }
    await neutralizeAndDeleteGuild(tx, guildId);
    return true;
  });
}
