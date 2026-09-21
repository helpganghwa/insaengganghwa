import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { and, eq, or, sql } from 'drizzle-orm';
import { preload } from 'react-dom';

import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { raidTierOf } from '@/lib/game/balance';
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
  searchParams,
}: {
  params: Promise<{ shareCode: string }>;
  searchParams: Promise<{ v?: string }>;
}) {
  const { shareCode } = await params;

  const [raid] = await db
    .select({
      id: raids.id,
      bossCode: raids.bossCode,
      tier: raids.tier,
      status: raids.status,
      expireAt: raids.expireAt,
      hostShareCode: raids.hostShareCode,
      serverId: raids.serverId,
    })
    .from(raids)
    // 일반 공유 코드 또는 개설자 전용 코드(0195) — 전용 코드로 들어오면 수락 없이 참여(s=host).
    .where(or(eq(raids.shareCode, shareCode), eq(raids.hostShareCode, shareCode)))
    .limit(1);
  if (!raid) notFound();
  const viaHost = raid.hostShareCode != null && raid.hostShareCode === shareCode;

  // LCP — 보스 배경/스프라이트 preload.
  const bg = getBossBg(raid.bossCode);
  if (bg) preload(assetUrl(bg), { as: 'image', fetchPriority: 'high' });
  const sprite = getBossSprite(raid.bossCode);
  if (sprite) preload(assetUrl(sprite.apng ?? sprite.static), { as: 'image', fetchPriority: 'high' });

  const userId = await getSessionUserId();
  // 이 주소로 **직접** 들어온 비로그인 방문자는 서버가 기록되지 않는다(2026-09-21 F7) — 공유 버튼이
  // 만드는 `/s/<코드>`만 `pending_server`를 심기 때문에, 주소창 주소를 복사해 보내면 받은 신규가
  // 다른 서버에 배정되고 이 레이드에 못 들어온다. 페이지는 쿠키를 못 쓰니 `/s`를 한 번 거쳐 오게 한다.
  // `v=1`은 `/s`가 붙여 주는 표식 — 쿠키가 막힌 브라우저에서 무한 왕복하지 않게 한 번만 보낸다.
  if (!userId && (await searchParams).v !== '1') {
    const pending = Number((await cookies()).get('pending_server')?.value);
    if (pending !== raid.serverId) redirect(`/s/${encodeURIComponent(shareCode)}`);
  }
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
      viaHost={viaHost}
      raidId={raid.id.toString()}
      bossCode={raid.bossCode}
      tier={raidTierOf(raid.tier)}
      status={raid.status}
      expireAtIso={raid.expireAt.toISOString()}
      participantCount={n}
      loggedIn={!!userId}
      isParticipant={isParticipant}
      nowIso={new Date().toISOString()}
    />
  );
}
