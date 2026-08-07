import 'server-only';

import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { guilds, guildMembers } from '@/lib/db/schema/guild';
import { characters } from '@/lib/db/schema/server';
import { filterByActiveServer, sendPushToUsers } from '@/lib/push/send';

import { GUILD_PERM } from './permissions';

/**
 * 길드 알림(2026-07-30) — 가입 신청 접수 / 승인·거절 두 가지만.
 *
 * 여태 길드에는 알림이 하나도 없었다(세금 분배 우편만 있었다). 그래서 신청이 쌓여도 길드장이
 * 몰랐고, "부길드장에게 가입 승인 권한을 달라"는 요구(문의 #106·#107)의 실제 원인이 그것이었다.
 * 권한만 위임하면 부길드장도 똑같이 모르므로 알림을 함께 넣는다.
 *
 * 전부 best-effort — 실패해도 본 동작(신청·승인)을 되돌리지 않는다. 호출은 트랜잭션 커밋 뒤
 * `after()`에서 한다(발송 지연이 응답을 붙잡지 않게).
 */

/**
 * 가입 신청 접수 → 처리할 수 있는 사람에게. 길드장 + joinReview 권한을 받은 부길드장.
 * 권한 없는 부길드장에게는 보내지 않는다 — 눌러도 못 하는 알림은 소음이다.
 */
export async function notifyJoinRequest(input: {
  guildId: bigint;
  serverId: number;
  applicantUserId: string;
}): Promise<void> {
  const [applicant] = await db
    .select({ nickname: characters.nickname })
    .from(characters)
    .where(
      and(eq(characters.userId, input.applicantUserId), eq(characters.serverId, input.serverId)),
    )
    .limit(1);
  const nickname = applicant?.nickname ?? '플레이어';
  const rows = await db
    .select({ userId: guildMembers.userId })
    .from(guildMembers)
    .where(
      and(
        eq(guildMembers.guildId, input.guildId),
        eq(guildMembers.serverId, input.serverId),
        sql`(${guildMembers.role} = 'leader' or (${guildMembers.role} = 'vice' and (${guildMembers.permissions} & ${GUILD_PERM.joinReview}) <> 0))`,
      ),
    );
  if (rows.length === 0) return;
  // 경계규칙 1 — 길드 서버가 활성(last_server_id)인 수신자에게만(타 서버 접속 중 오알림 억제).
  const targets = await filterByActiveServer(rows.map((r) => r.userId), input.serverId);
  if (targets.length === 0) return;
  await sendPushToUsers(
    targets,
    {
      title: '길드 가입 신청',
      body: `${nickname}님이 가입을 신청했습니다.`,
      url: '/guild/join-requests',
      // 신청이 연달아 오면 최신 1건으로 합친다 — 목록에서 한 번에 처리하면 되므로.
      tag: 'guild-join-request',
      category: 'guild',
    },
  ).catch(() => undefined);
}

/** 승인·거절 → 신청자에게. 거절은 사유를 말하지 않는다(길드 재량이고 분쟁 소재가 된다). */
export async function notifyJoinDecision(input: {
  userId: string;
  serverId: number;
  guildId: bigint;
  approved: boolean;
}): Promise<void> {
  // 경계규칙 1 — 길드 서버가 활성 서버인 신청자에게만.
  const [target] = await filterByActiveServer([input.userId], input.serverId);
  if (!target) return;
  const [g] = await db
    .select({ name: guilds.name })
    .from(guilds)
    .where(eq(guilds.id, input.guildId))
    .limit(1);
  const name = g?.name ?? '길드';
  await sendPushToUsers([input.userId], {
    title: input.approved ? '길드 가입 승인' : '길드 가입 거절',
    body: input.approved
      ? `${name} 길드에 가입했습니다. 길드 화면에서 확인해 보세요.`
      : `${name} 길드 가입이 받아들여지지 않았습니다. 다른 길드에 신청할 수 있습니다.`,
    url: '/guild',
    tag: 'guild-join-decision',
    category: 'guild',
  }).catch(() => undefined);
}
