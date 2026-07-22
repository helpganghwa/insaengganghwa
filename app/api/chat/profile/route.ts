import { NextResponse } from 'next/server';
import { and, eq, inArray, sql } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { getActiveServerId } from '@/lib/game/servers';
import { db } from '@/lib/db/client';
import { profiles } from '@/lib/db/schema/profiles';
import { characters } from '@/lib/db/schema/server';
import { userProfiles } from '@/lib/db/schema/avatar';
import { userEquipment } from '@/lib/db/schema/equipment';
import { friendLinks } from '@/lib/db/schema/friends';
import { leaderboardRanks } from '@/lib/db/schema/leaderboard';
import { pieceCombatPower } from '@/lib/game/balance';
import { currentMeleeChampion } from '@/lib/game/chat/service';
import { getGuildBriefsByUsers } from '@/lib/game/guild/badge';
import { parseFaceBox } from '@/components/faceCrop';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 채팅 유저 미니 프로필(0125) — 닉네임/아바타 탭 팝업용 공개 요약.
 * GET /api/chat/profile?uid=<userId> — 세션 필수, 서버는 세션 활성 서버 기준.
 * 전부 공개 정보(공개 프로필과 동일 범위) + 나와의 친구 상태.
 */
export async function GET(req: Request) {
  const me = await getSessionUserId();
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const uid = new URL(req.url).searchParams.get('uid');
  if (!uid || !/^[0-9a-f-]{36}$/i.test(uid)) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const serverId = await getActiveServerId();

  const [[row], equip, guilds, [fr], champion, metrics] = await Promise.all([
    db
      .select({
        nickname: characters.nickname,
        publicCode: profiles.publicCode,
        rotations: userProfiles.rotations,
        options: userProfiles.options,
      })
      .from(characters)
      .innerJoin(profiles, eq(profiles.id, characters.userId))
      .leftJoin(userProfiles, eq(userProfiles.id, characters.activeProfileId))
      .where(and(eq(characters.userId, uid), eq(characters.serverId, serverId)))
      .limit(1),
    db
      .select({ e: userEquipment.enhanceLevel, t: userEquipment.transcendLevel, mx: userEquipment.maxEnhanceLevel })
      .from(userEquipment)
      .where(and(eq(userEquipment.userId, uid), eq(userEquipment.serverId, serverId))),
    getGuildBriefsByUsers([uid], serverId).catch(() => new Map()),
    db
      .select({ status: friendLinks.status })
      .from(friendLinks)
      .where(
        and(
          eq(friendLinks.serverId, serverId),
          sql`((${friendLinks.requesterId} = ${me} and ${friendLinks.addresseeId} = ${uid}) or (${friendLinks.requesterId} = ${uid} and ${friendLinks.addresseeId} = ${me}))`,
        ),
      )
      .limit(1),
    currentMeleeChampion(serverId).catch(() => null),
    // 레이드 처치·대난투 우승 누계 — 리더보드 카운터(v2) 재사용(PK 2행 조회).
    db
      .select({ metric: leaderboardRanks.metric, value: leaderboardRanks.value })
      .from(leaderboardRanks)
      .where(
        and(
          eq(leaderboardRanks.serverId, serverId),
          eq(leaderboardRanks.userId, uid),
          inArray(leaderboardRanks.metric, ['raid', 'melee']),
        ),
      ),
  ]);
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const rot = (row.rotations ?? {}) as Record<string, string>;
  const g = guilds.get(uid) as
    | { name?: string; emblemUrl?: string | null; executorZone?: string | null; executorZoneRegion?: string | null }
    | undefined;
  const combat = equip.reduce((acc, r) => acc + pieceCombatPower(r.e, r.t), 0);
  const maxEnhance = equip.reduce((acc, r) => Math.max(acc, r.mx), 0);
  const sumEnhance = equip.reduce((acc, r) => acc + r.e, 0);

  return NextResponse.json({
    userId: uid,
    nickname: row.nickname,
    publicCode: row.publicCode,
    avatar: rot.south ?? Object.values(rot)[0] ?? null,
    faceBox: parseFaceBox((row.options as Record<string, unknown> | null)?.faceBox),
    guildName: g?.name ?? null,
    guildEmblemUrl: g?.emblemUrl ?? null,
    executorZone: g?.executorZone ?? null,
    executorZoneRegion: g?.executorZoneRegion ?? null,
    isMeleeChampion: uid === champion,
    raidKills: metrics.find((m) => m.metric === 'raid')?.value ?? 0,
    meleeWins: metrics.find((m) => m.metric === 'melee')?.value ?? 0,
    combat,
    maxEnhance,
    sumEnhance,
    friendStatus: fr?.status ?? null, // null=관계 없음 | pending | accepted
    isMe: uid === me,
  });
}
