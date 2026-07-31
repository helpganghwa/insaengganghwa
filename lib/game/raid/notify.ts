import 'server-only';

import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { characters } from '@/lib/db/schema/server';
import { sendPushToUser } from '@/lib/push/send';

import { RAID_BOSSES, type RaidBoss } from './bosses';

/**
 * 레이드 지목 초대 알림(0146) — 초대받은 사람에게 푸시.
 *
 * best-effort: 실패해도 초대는 유효하다(레이드 화면 '초대받은 레이드' 섹션에 남는다).
 * 호출은 트랜잭션 밖 `after()`에서 — 발송 지연이 초대 응답을 붙잡지 않게.
 */
export async function notifyRaidInvite(input: {
  inviteeUserId: string;
  hostUserId: string;
  serverId: number;
  raidId: string;
  bossCode: string;
}): Promise<void> {
  const [host] = await db
    .select({ nickname: characters.nickname })
    .from(characters)
    .where(
      and(eq(characters.userId, input.hostUserId), eq(characters.serverId, input.serverId)),
    )
    .limit(1);
  const hostName = host?.nickname ?? '동료';
  const bossName = RAID_BOSSES[input.bossCode as RaidBoss]?.name ?? '보스';

  await sendPushToUser(input.inviteeUserId, {
    title: '레이드 초대',
    body: `${hostName}님이 ${bossName} 레이드에 초대했습니다.`,
    url: `/raid/${input.raidId}`,
    // 같은 레이드 초대가 겹치면 최신 1건만 — 초대는 레이드당 1회지만 재발송 방어.
    tag: `raid-invite-${input.raidId}`,
    category: 'raid',
  });
}
