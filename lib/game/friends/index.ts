import 'server-only';

import { and, or, eq, ne, ilike, inArray, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { friendLinks } from '@/lib/db/schema/friends';
import { profiles } from '@/lib/db/schema/profiles';
import { characters } from '@/lib/db/schema/server';
import { userProfiles } from '@/lib/db/schema/avatar';
import { getGuildBriefsByUsers } from '@/lib/game/guild/badge';
import { parseFaceBox, type FaceBox } from '@/components/faceCrop';

/**
 * 친구 — 검색→요청→수락(친구 선물 없음). 방향 1행 저장(requester→addressee).
 * 친구 = status='accepted' & (requester or addressee = 나). 받은 요청 = pending & addressee=나.
 */
export const FRIEND_CAP = 30;

export class FriendError extends Error {
  constructor(
    public code: 'SELF' | 'NOT_FOUND' | 'ALREADY_FRIEND' | 'ALREADY_REQUESTED' | 'CAP_REACHED' | 'NO_REQUEST',
  ) {
    super(code);
    this.name = 'FriendError';
  }
}

export type FriendRelation = 'none' | 'friend' | 'incoming' | 'outgoing';
export interface FriendUser {
  userId: string;
  nickname: string;
  publicCode: string;
  profileSouth: string | null;
  /** 활성 프로필 얼굴 박스(검수 산출) — 썸네일 정밀 크롭. 없으면 null(폴백). */
  faceBox?: FaceBox | null;
  /** 닉네임 아래 길드(이름+문양) — 미소속/생성중이면 null. page(목록·요청) 또는 searchUsers(찾기)에서 부착. */
  guildEmblemUrl?: string | null;
  guildName?: string | null;
  /** 마지막 접속(ISO) — 접속 상태 표시용. 기록 없으면 null. */
  lastSeenAt?: string | null;
}

const SOUTH = sql<string | null>`${userProfiles.rotations} ->> 'south'`;
const FACEBOX = sql<unknown>`${userProfiles.options} -> 'faceBox'`;

async function profilesByIds(ids: string[], serverId: number): Promise<FriendUser[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select({
      userId: profiles.id,
      nickname: characters.nickname,
      publicCode: profiles.publicCode,
      profileSouth: SOUTH,
      faceBoxRaw: FACEBOX,
      lastSeenAt: characters.lastSeenAt,
    })
    .from(profiles)
    .innerJoin(
      characters,
      and(eq(characters.userId, profiles.id), eq(characters.serverId, serverId)),
    )
    .leftJoin(userProfiles, eq(userProfiles.id, characters.activeProfileId))
    .where(inArray(profiles.id, ids));
  return rows.map(({ faceBoxRaw, ...r }) => ({
    ...r,
    lastSeenAt: r.lastSeenAt ? r.lastSeenAt.toISOString() : null,
    faceBox: parseFaceBox(faceBoxRaw),
  }));
}

/** 닉네임(부분)·공개코드(정확) 검색 — 본인 제외, 관계 라벨 포함. */
export async function searchUsers(
  meId: string,
  serverId: number,
  qRaw: string,
): Promise<Array<FriendUser & { relation: FriendRelation }>> {
  const q = qRaw.trim();
  if (!q) return [];
  const rows = await db
    .select({
      userId: profiles.id,
      nickname: characters.nickname,
      publicCode: profiles.publicCode,
      profileSouth: SOUTH,
      faceBoxRaw: FACEBOX,
      lastSeenAt: characters.lastSeenAt,
    })
    .from(profiles)
    .innerJoin(
      characters,
      and(eq(characters.userId, profiles.id), eq(characters.serverId, serverId)),
    )
    .leftJoin(userProfiles, eq(userProfiles.id, characters.activeProfileId))
    .where(
      and(
        ne(profiles.id, meId),
        or(ilike(characters.nickname, `%${q}%`), eq(profiles.publicCode, q)),
      ),
    )
    .limit(20);
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.userId);
  const links = await db
    .select()
    .from(friendLinks)
    .where(
      or(
        and(
          eq(friendLinks.serverId, serverId),
          eq(friendLinks.requesterId, meId),
          inArray(friendLinks.addresseeId, ids),
        ),
        and(
          eq(friendLinks.serverId, serverId),
          eq(friendLinks.addresseeId, meId),
          inArray(friendLinks.requesterId, ids),
        ),
      ),
    );
  const rel = new Map<string, FriendRelation>();
  for (const l of links) {
    const other = l.requesterId === meId ? l.addresseeId : l.requesterId;
    if (l.status === 'accepted') rel.set(other, 'friend');
    else rel.set(other, l.requesterId === meId ? 'outgoing' : 'incoming');
  }
  // 길드(이름+문양) 일괄 부착 — 찾기 결과도 닉네임 아래 길드 노출. 실패해도 진행.
  const guildMap = await getGuildBriefsByUsers(ids, serverId).catch(
    () => new Map<string, { emblemUrl: string | null; name: string }>(),
  );
  return rows.map(({ faceBoxRaw, ...r }) => ({
    ...r,
    lastSeenAt: r.lastSeenAt ? r.lastSeenAt.toISOString() : null,
    faceBox: parseFaceBox(faceBoxRaw),
    relation: rel.get(r.userId) ?? 'none',
    guildEmblemUrl: guildMap.get(r.userId)?.emblemUrl ?? null,
    guildName: guildMap.get(r.userId)?.name ?? null,
  }));
}

async function countAcceptedTx(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  userId: string,
  serverId: number,
): Promise<number> {
  const [r] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(friendLinks)
    .where(
      and(
        eq(friendLinks.serverId, serverId),
        eq(friendLinks.status, 'accepted'),
        or(eq(friendLinks.requesterId, userId), eq(friendLinks.addresseeId, userId)),
      ),
    );
  return r?.n ?? 0;
}

/** 친구 요청 — 역방향 pending이 있으면 즉시 수락. */
export async function sendRequest(
  meId: string,
  serverId: number,
  targetId: string,
): Promise<{ status: 'requested' | 'accepted' }> {
  if (meId === targetId) throw new FriendError('SELF');
  const [t] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.id, targetId)).limit(1);
  if (!t) throw new FriendError('NOT_FOUND');
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(friendLinks)
      .where(
        and(
          eq(friendLinks.serverId, serverId),
          or(
            and(eq(friendLinks.requesterId, meId), eq(friendLinks.addresseeId, targetId)),
            and(eq(friendLinks.requesterId, targetId), eq(friendLinks.addresseeId, meId)),
          ),
        ),
      )
      .for('update');
    if (existing) {
      if (existing.status === 'accepted') throw new FriendError('ALREADY_FRIEND');
      if (existing.requesterId === meId) throw new FriendError('ALREADY_REQUESTED');
      // 상대가 내게 보낸 요청 → 수락 성립.
      if ((await countAcceptedTx(tx, meId, serverId)) >= FRIEND_CAP) throw new FriendError('CAP_REACHED');
      await tx
        .update(friendLinks)
        .set({ status: 'accepted', updatedAt: new Date() })
        .where(
          and(
            eq(friendLinks.serverId, serverId),
            eq(friendLinks.requesterId, targetId),
            eq(friendLinks.addresseeId, meId),
          ),
        );
      return { status: 'accepted' };
    }
    if ((await countAcceptedTx(tx, meId, serverId)) >= FRIEND_CAP) throw new FriendError('CAP_REACHED');
    await tx
      .insert(friendLinks)
      .values({ requesterId: meId, serverId, addresseeId: targetId, status: 'pending' });
    return { status: 'requested' };
  });
}

/** 받은 요청 응답 — accept(수락)/decline(거절). */
export async function respondRequest(
  meId: string,
  serverId: number,
  requesterId: string,
  action: 'accept' | 'decline',
): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(friendLinks)
      .where(
        and(
          eq(friendLinks.serverId, serverId),
          eq(friendLinks.requesterId, requesterId),
          eq(friendLinks.addresseeId, meId),
          eq(friendLinks.status, 'pending'),
        ),
      )
      .for('update');
    if (!row) throw new FriendError('NO_REQUEST');
    if (action === 'decline') {
      await tx
        .delete(friendLinks)
        .where(
        and(
          eq(friendLinks.serverId, serverId),
          eq(friendLinks.requesterId, requesterId),
          eq(friendLinks.addresseeId, meId),
        ),
      );
      return;
    }
    if ((await countAcceptedTx(tx, meId, serverId)) >= FRIEND_CAP) throw new FriendError('CAP_REACHED');
    await tx
      .update(friendLinks)
      .set({ status: 'accepted', updatedAt: new Date() })
      .where(
        and(
          eq(friendLinks.serverId, serverId),
          eq(friendLinks.requesterId, requesterId),
          eq(friendLinks.addresseeId, meId),
        ),
      );
  });
}

/** 보낸 요청 취소. */
export async function cancelRequest(meId: string, serverId: number, targetId: string): Promise<void> {
  await db
    .delete(friendLinks)
    .where(
      and(
        eq(friendLinks.serverId, serverId),
        eq(friendLinks.requesterId, meId),
        eq(friendLinks.addresseeId, targetId),
        eq(friendLinks.status, 'pending'),
      ),
    );
}

/** 친구 삭제(방향 무관). */
export async function removeFriend(meId: string, serverId: number, otherId: string): Promise<void> {
  await db
    .delete(friendLinks)
    .where(
      and(
        eq(friendLinks.serverId, serverId),
        eq(friendLinks.status, 'accepted'),
        or(
          and(eq(friendLinks.requesterId, meId), eq(friendLinks.addresseeId, otherId)),
          and(eq(friendLinks.requesterId, otherId), eq(friendLinks.addresseeId, meId)),
        ),
      ),
    );
}

export async function getFriends(meId: string, serverId: number): Promise<FriendUser[]> {
  const rows = await db
    .select({ requesterId: friendLinks.requesterId, addresseeId: friendLinks.addresseeId })
    .from(friendLinks)
    .where(
      and(
        eq(friendLinks.serverId, serverId),
        eq(friendLinks.status, 'accepted'),
        or(eq(friendLinks.requesterId, meId), eq(friendLinks.addresseeId, meId)),
      ),
    );
  return profilesByIds(
    rows.map((r) => (r.requesterId === meId ? r.addresseeId : r.requesterId)),
    serverId,
  );
}

export async function getRequests(
  meId: string,
  serverId: number,
): Promise<{ incoming: FriendUser[]; outgoing: FriendUser[] }> {
  const rows = await db
    .select({ requesterId: friendLinks.requesterId, addresseeId: friendLinks.addresseeId })
    .from(friendLinks)
    .where(
      and(
        eq(friendLinks.serverId, serverId),
        eq(friendLinks.status, 'pending'),
        or(eq(friendLinks.requesterId, meId), eq(friendLinks.addresseeId, meId)),
      ),
    );
  const incomingIds = rows.filter((r) => r.addresseeId === meId).map((r) => r.requesterId);
  const outgoingIds = rows.filter((r) => r.requesterId === meId).map((r) => r.addresseeId);
  const [incoming, outgoing] = await Promise.all([
    profilesByIds(incomingIds, serverId),
    profilesByIds(outgoingIds, serverId),
  ]);
  return { incoming, outgoing };
}

/** 받은 요청 수(알림 배지용). */
export async function getIncomingRequestCount(meId: string, serverId: number): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(friendLinks)
    .where(
      and(
        eq(friendLinks.serverId, serverId),
        eq(friendLinks.status, 'pending'),
        eq(friendLinks.addresseeId, meId),
      ),
    );
  return r?.n ?? 0;
}

/** 내 친구 id 목록 — 레이드 친구 공개 등 재사용. */
export async function getFriendIds(meId: string, serverId: number): Promise<string[]> {
  const rows = await db
    .select({ requesterId: friendLinks.requesterId, addresseeId: friendLinks.addresseeId })
    .from(friendLinks)
    .where(
      and(
        eq(friendLinks.serverId, serverId),
        eq(friendLinks.status, 'accepted'),
        or(eq(friendLinks.requesterId, meId), eq(friendLinks.addresseeId, meId)),
      ),
    );
  return rows.map((r) => (r.requesterId === meId ? r.addresseeId : r.requesterId));
}
