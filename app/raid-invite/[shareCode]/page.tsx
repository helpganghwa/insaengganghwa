import { notFound } from 'next/navigation';
import { and, eq, sql } from 'drizzle-orm';
import { preload } from 'react-dom';

import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { raids, raidParticipants } from '@/lib/db/schema/raid';
import { getBossBg, getBossSprite } from '@/lib/game/raid/boss-sprites';
import { assetUrl } from '@/lib/asset-versions';

import { RaidInviteLanding } from './RaidInviteLanding';

/**
 * 레이드 초대 랜딩 — (game) 밖 공개 풀페이지(헤더/바텀네비 없음).
 * 공유 링크(/s/<shareCode>)·직접 진입 모두 이 화면으로. 보스·스토리·남은시간·참여 버튼만.
 * 참여 성공 시 /raid/<raidId> 세션으로 이동. 비로그인/꽉참/종료 모두 클라에서 분기.
 */
export default async function RaidInvitePage({
  params,
}: {
  params: Promise<{ shareCode: string }>;
}) {
  const { shareCode } = await params;

  const [raid] = await db
    .select({
      id: raids.id,
      bossCode: raids.bossCode,
      status: raids.status,
      expireAt: raids.expireAt,
    })
    .from(raids)
    .where(eq(raids.shareCode, shareCode))
    .limit(1);
  if (!raid) notFound();

  // LCP — 보스 배경/스프라이트 preload.
  const bg = getBossBg(raid.bossCode);
  if (bg) preload(assetUrl(bg), { as: 'image', fetchPriority: 'high' });
  const sprite = getBossSprite(raid.bossCode);
  if (sprite) preload(assetUrl(sprite.apng ?? sprite.static), { as: 'image', fetchPriority: 'high' });

  const userId = await getSessionUserId();
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(raidParticipants)
    .where(eq(raidParticipants.raidId, raid.id));

  let isParticipant = false;
  if (userId) {
    const [p] = await db
      .select({ id: raidParticipants.id })
      .from(raidParticipants)
      .where(and(eq(raidParticipants.raidId, raid.id), eq(raidParticipants.userId, userId)))
      .limit(1);
    isParticipant = !!p;
  }

  return (
    <RaidInviteLanding
      shareCode={shareCode}
      raidId={raid.id.toString()}
      bossCode={raid.bossCode}
      status={raid.status}
      expireAtIso={raid.expireAt.toISOString()}
      participantCount={n}
      loggedIn={!!userId}
      isParticipant={isParticipant}
    />
  );
}
