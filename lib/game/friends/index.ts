import 'server-only';

import { and, or, eq, ne, ilike, inArray, isNull, lte, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { friendLinks } from '@/lib/db/schema/friends';
import { chatBlocks } from '@/lib/db/schema/chat';
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
    public code:
      | 'SELF'
      | 'NOT_FOUND'
      | 'ALREADY_FRIEND'
      | 'ALREADY_REQUESTED'
      | 'CAP_REACHED'
      /** 상대의 친구 목록이 가득 참 — 내 상한과 구분해야 유저가 할 행동이 달라진다. */
      | 'PEER_CAP_REACHED'
      /** 내가 차단한 상대 — 내 행동이므로 그대로 알려준다. */
      | 'BLOCKED_BY_ME'
      /** 차단 관계라 보낼 수 없음(상대가 나를 차단한 경우 포함) — **누가 차단했는지는 밝히지 않는다.** */
      | 'BLOCKED'
      | 'NO_REQUEST',
  ) {
    super(code);
    this.name = 'FriendError';
  }
}

/** 'blocked' = **내가** 차단한 상대. 상대가 나를 차단한 경우는 'none'으로 보여 노출하지 않는다. */
export type FriendRelation = 'none' | 'friend' | 'incoming' | 'outgoing' | 'blocked';
export interface FriendUser {
  userId: string;
  nickname: string;
  publicCode: string;
  profileSouth: string | null;
  /** 활성 프로필 얼굴 박스(검수 산출) — 썸네일 정밀 크롭. 없으면 null(폴백). */
  faceBox?: FaceBox | null;
  /** 닉네임 아래 길드(문양+이름) — 미소속/생성중이면 null. page(목록·요청) 또는 searchUsers(찾기)에서 부착. */
  guildEmblemUrl?: string | null;
  guildName?: string | null;
  /** 마지막 접속(ISO) — 접속 상태 표시용. 기록 없으면 null. */
  lastSeenAt?: string | null;
}

const SOUTH = sql<string | null>`${userProfiles.rotations} ->> 'south'`;
const FACEBOX = sql<unknown>`${userProfiles.options} -> 'faceBox'`;

/** id 목록 → 표시용 프로필(닉·아바타·faceBox·접속). 레이드 초대 후보 등에서 재사용. */
export async function profilesByIds(ids: string[], serverId: number): Promise<FriendUser[]> {
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
  const q = qRaw.trim().slice(0, 30);
  if (!q) return [];
  // LIKE 와일드카드(%, _)·이스케이프 문자를 리터럴로 — 봇이 '%' 등으로 풀스캔 유발하는 것 방지(기본 escape=\).
  const safe = q.replace(/[\\%_]/g, '\\$&');
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
        // **활성** 정지만 제외 — 본인은 actionBlock으로 아무것도 못 하므로 친구가 돼도 무력한데,
        // 검색에 뜨면 상대의 친구 슬롯만 쓰고 목록에 남는다. 탈퇴 계정은 characters가 지워져
        // innerJoin에서 이미 빠진다(별도 필터 불필요).
        // ⚠ banned_at만 보면 안 된다 — 기간 정지는 만료돼도 banned_at이 남고 판정만 동적으로
        // 풀린다(ban.ts). 3일 정지가 끝나 정상 플레이 중인 유저가 검색에서 영영 사라진다.
        // 판정 기준은 리더보드(snapshot.ts)와 동일하게 맞춘다.
        or(isNull(profiles.bannedAt), lte(profiles.banUntil, sql`now()`)),
        or(ilike(characters.nickname, `%${safe}%`), eq(profiles.publicCode, q)),
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
  // 내가 차단한 상대는 'blocked'로 덮어써 추가 버튼 대신 상태를 보여준다 — 눌러 봐야 실패한다.
  // 반대 방향(상대가 나를 차단)은 덮어쓰지 않는다. 표시가 달라지면 차단 사실이 드러난다.
  const myBlocks = await db
    .select({ blocked: chatBlocks.blockedUserId })
    .from(chatBlocks)
    .where(and(eq(chatBlocks.userId, meId), inArray(chatBlocks.blockedUserId, ids)));
  for (const b of myBlocks) rel.set(b.blocked, 'blocked');
  // 길드(문양+이름) 일괄 부착 — 찾기 결과도 닉네임 아래 길드 노출. 실패해도 진행.
  const guildMap = await getGuildBriefsByUsers(ids, serverId).catch(
    () => new Map<string, { emblemUrl: string | null; name: string }>(),
  );
  return rows.map(({ faceBoxRaw, ...r }) => {
    const relation = rel.get(r.userId) ?? 'none';
    return {
      ...r,
      // 마지막 접속은 **친구에게만** 보인다. 닉네임만 알면 누구나 조회할 수 있으면
      // 상대의 생활 패턴이 그대로 드러난다(스토킹 벡터). 친구 목록(getFriends)에서는 그대로 노출.
      lastSeenAt: relation === 'friend' && r.lastSeenAt ? r.lastSeenAt.toISOString() : null,
      faceBox: parseFaceBox(faceBoxRaw),
      relation,
      guildEmblemUrl: guildMap.get(r.userId)?.emblemUrl ?? null,
      guildName: guildMap.get(r.userId)?.name ?? null,
    };
  });
}

/**
 * 두 사람 사이의 차단 상태 — 채팅에서 만든 chat_blocks를 친구에도 적용한다(2026-08-12).
 *
 * 차단은 원래 채팅·귓속말 전용이었다. 그래서 채팅에서 차단한 상대가 친구 요청을 계속 보내
 * 받은 요청 탭에 닉네임·아바타로 올라왔고, 거절하면 행이 지워져 즉시 재요청할 수 있었다.
 * 푸시는 없어 피해가 크진 않지만, 유저가 "차단"에 기대하는 것은 연락 차단이다.
 *
 * 방향을 구분해 돌려준다 — 내가 건 차단은 알려도 되지만, **상대가 나를 차단한 사실은
 * 알려주면 안 된다**(차단 사실 자체가 노출되면 차단의 의미가 반감된다).
 * chat_blocks는 계정 단위(server_id 없음)라 서버와 무관하게 적용된다.
 */
async function blockState(meId: string, otherId: string): Promise<{ byMe: boolean; byPeer: boolean }> {
  const rows = await db
    .select({ owner: chatBlocks.userId })
    .from(chatBlocks)
    .where(
      or(
        and(eq(chatBlocks.userId, meId), eq(chatBlocks.blockedUserId, otherId)),
        and(eq(chatBlocks.userId, otherId), eq(chatBlocks.blockedUserId, meId)),
      ),
    );
  return { byMe: rows.some((r) => r.owner === meId), byPeer: rows.some((r) => r.owner === otherId) };
}

type FriendTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * 링크가 accepted로 바뀌기 직전 **양쪽** 상한을 본다.
 *
 * 예전엔 호출자(meId) 쪽만 봤다. 그런데 상한은 요청 시점이 아니라 **수락 시점**에 소모되므로,
 * 29명일 때 요청 5건을 뿌려 두고 전부 수락받으면 34명이 된다 — 악의도 필요 없는 자연 경로다
 * (CBT 실측 최대 28명으로 이미 상한에 근접했다). 자동수락(sendRequest)·수락(respondRequest)
 * 두 경로 모두 상대 쪽이 검사에서 빠져 있었다.
 *
 * 호출자에게는 CAP_REACHED, 상대가 가득 찬 경우엔 PEER_CAP_REACHED로 구분해 돌려준다 —
 * "내가 정리해야 하는가 / 상대가 정리해야 하는가"가 유저에게 완전히 다른 행동이다.
 */
async function assertBothUnderCap(
  tx: FriendTx,
  meId: string,
  peerId: string,
  serverId: number,
): Promise<void> {
  if ((await countAcceptedTx(tx, meId, serverId)) >= FRIEND_CAP) throw new FriendError('CAP_REACHED');
  if ((await countAcceptedTx(tx, peerId, serverId)) >= FRIEND_CAP) throw new FriendError('PEER_CAP_REACHED');
}

/**
 * 상한 검사를 직렬화하는 유저별 advisory 락 — **정렬 순**으로 잡아 교착을 만들지 않는다.
 * 쌍 락만으로는 부족하다: 그건 같은 쌍의 중복 행만 막고, 서로 **다른 쌍**의 동시 수락이
 * 같은 유저의 카운트를 함께 읽어 둘 다 통과하는 것은 못 막는다.
 */
async function lockPairUsers(tx: FriendTx, a: string, b: string, serverId: number): Promise<void> {
  const [lo, hi] = a < b ? [a, b] : [b, a];
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('friend_user:' || ${lo} || ':' || ${String(serverId)}, 0))`);
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('friend_user:' || ${hi} || ':' || ${String(serverId)}, 0))`);
}

async function countAcceptedTx(
  tx: FriendTx,
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
  // 대상 검증은 캐릭터(서버 스코프) 기준 — 친구는 서버별인데 profiles만 보면 그 서버에
  // 캐릭터가 없는 유저(타서버 프로필 링크 등)에게 유령 요청이 걸린다(2026-07-07 전수감사).
  const [t] = await db
    .select({ id: characters.userId })
    .from(characters)
    .where(and(eq(characters.userId, targetId), eq(characters.serverId, serverId)))
    .limit(1);
  if (!t) throw new FriendError('NOT_FOUND');
  // 차단 검사는 트랜잭션 밖 — 읽기 한 번이고, 막히면 어차피 아무것도 안 쓴다.
  const blocked = await blockState(meId, targetId);
  if (blocked.byMe) throw new FriendError('BLOCKED_BY_ME');
  if (blocked.byPeer) throw new FriendError('BLOCKED');
  return db.transaction(async (tx) => {
    // 상호 동시 요청 레이스 방지 — PK가 방향성(requester,addressee)이라 A→B·B→A가 서로 다른
    // 행이 되어 아직 없는 역방향을 FOR UPDATE로 못 잠근다. 정렬된 쌍으로 트랜잭션 advisory 락을
    // 먼저 잡아 두 tx를 직렬화 → 나중 tx가 먼저 tx의 pending을 보고 '수락'으로 성립(중복 행 방지).
    const lo = meId < targetId ? meId : targetId;
    const hi = meId < targetId ? targetId : meId;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lo} || ${hi} || ${String(serverId)}, 0))`);
    // 쌍 락은 같은 쌍의 중복만 막는다 — 상한은 **다른 쌍**의 동시 수락과도 경합하므로 유저 락도 잡는다.
    await lockPairUsers(tx, meId, targetId, serverId);
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
      // 상대가 내게 보낸 요청 → 수락 성립. 링크가 accepted가 되므로 **양쪽** 상한을 본다.
      await assertBothUnderCap(tx, meId, targetId, serverId);
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
    // 상대가 가득 찼으면 요청 자체를 막는다(2026-09-03) — 종전엔 수락 시점에만 봐서 가득 찬 유저의
    // 요청 탭에 수락 불가능한 요청이 쌓였다. 상대가 정리하기 전엔 어차피 성립할 수 없는 요청이다.
    if ((await countAcceptedTx(tx, targetId, serverId)) >= FRIEND_CAP) throw new FriendError('PEER_CAP_REACHED');
    // 발신 pending 상한(전수 감사 2026-08-21) — 종전엔 무제한이라 한 계정이 요청을 대량
    // 살포해 타 유저의 요청 탭을 매몰시킬 수 있었다(수락 상한만 있었음).
    const [pend] = (await tx.execute(sql`
      select count(*)::int as n from friend_links
      where server_id = ${serverId} and requester_id = ${meId}::uuid and status = 'pending'
    `)) as unknown as { n: number }[];
    if (Number(pend?.n ?? 0) >= FRIEND_CAP) throw new FriendError('CAP_REACHED');
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
  // 차단 검사 — 요청(sendRequest)만 막고 여기를 비우면 "요청 → 차단 → 상대가 수락"으로
  // 차단 관계인 채 친구가 성립한다(2026-08-12 독립 검증에서 발견된 형제 경로).
  if (action === 'accept') {
    const blocked = await blockState(meId, requesterId);
    // 내가 차단한 상대의 요청 — 내 행동이므로 그대로 알려준다(받은 목록에서도 걸러지지만,
    // 목록 캐시·직접 호출 대비 서버에서 한 번 더 막는다).
    if (blocked.byMe) throw new FriendError('BLOCKED_BY_ME');
    // 요청을 보낸 뒤 나를 차단한 상대 — 그 요청은 사실상 철회된 것이다. 조용히 지우고
    // "요청이 없어요"로 답해 차단 사실을 드러내지 않는다(BLOCKED 같은 전용 코드는 그 자체가
    // 시그널이 된다). 삭제는 멱등이라 레이스에도 무해하다.
    if (blocked.byPeer) {
      await db
        .delete(friendLinks)
        .where(
          and(
            eq(friendLinks.serverId, serverId),
            eq(friendLinks.requesterId, requesterId),
            eq(friendLinks.addresseeId, meId),
            eq(friendLinks.status, 'pending'),
          ),
        );
      throw new FriendError('NO_REQUEST');
    }
  }
  await db.transaction(async (tx) => {
    // 수락이 상한을 소모하므로 sendRequest와 같은 유저 락을 잡는다(정렬 순 — 교착 없음).
    await lockPairUsers(tx, meId, requesterId, serverId);
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
    await assertBothUnderCap(tx, meId, requesterId, serverId);
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
    )
    // 수신함 폭주 방어(전수 감사 2026-08-21) — 무제한 조회는 요청 살포 어뷰징의 증폭기였다.
    .limit(100);
  const incomingIds = rows.filter((r) => r.addresseeId === meId).map((r) => r.requesterId);
  const outgoingIds = rows.filter((r) => r.requesterId === meId).map((r) => r.addresseeId);
  // 차단 관계의 pending은 목록에서 뺀다 — 방향 무관. 내가 차단한 상대의 요청은 보일 이유가
  // 없고, 나를 차단한 상대와의 요청은 어차피 성립 불가다(수락 시 위 가드가 정리한다).
  // 요청은 취소로도 사라지는 것이라 목록 부재가 차단 시그널이 되지는 않는다.
  const others = [...new Set([...incomingIds, ...outgoingIds])];
  const blockedWith = new Set<string>();
  if (others.length > 0) {
    const rows2 = await db
      .select({ a: chatBlocks.userId, b: chatBlocks.blockedUserId })
      .from(chatBlocks)
      .where(
        or(
          and(eq(chatBlocks.userId, meId), inArray(chatBlocks.blockedUserId, others)),
          and(inArray(chatBlocks.userId, others), eq(chatBlocks.blockedUserId, meId)),
        ),
      );
    for (const r of rows2) blockedWith.add(r.a === meId ? r.b : r.a);
  }
  const [incoming, outgoing] = await Promise.all([
    profilesByIds(incomingIds.filter((i) => !blockedWith.has(i)), serverId),
    profilesByIds(outgoingIds.filter((i) => !blockedWith.has(i)), serverId),
  ]);
  // 요청 목록의 상대는 **아직 친구가 아니다** — 검색에서 마지막 접속을 가려 놓고 여기서 그대로
  // 내보내면 "요청 보내고 보낸 탭 읽기"로 우회된다(2026-08-12 재검증). 같은 기준을 적용한다.
  const hideSeen = (u: FriendUser): FriendUser => ({ ...u, lastSeenAt: null });
  return { incoming: incoming.map(hideSeen), outgoing: outgoing.map(hideSeen) };
}

/**
 * 나와 상대의 친구 관계 1건 — 프로필 페이지 '친구 추가' 버튼 초기 상태.
 * serverId는 요청 액션(sendRequestAction=조회자 활성 서버)과 반드시 일치시켜야 상태가 어긋나지 않는다.
 */
export async function getFriendRelation(
  meId: string,
  serverId: number,
  otherId: string,
): Promise<FriendRelation> {
  if (meId === otherId) return 'none';
  // 내가 차단한 상대면 친구 관계보다 앞선다 — 추가 버튼 대신 상태를 보여야 눌러 봐야 실패하는
  // 일이 없다. 반대 방향(상대가 나를 차단)은 'none'으로 남겨 차단 사실을 드러내지 않는다.
  if ((await blockState(meId, otherId)).byMe) return 'blocked';
  const [l] = await db
    .select({ requesterId: friendLinks.requesterId, status: friendLinks.status })
    .from(friendLinks)
    .where(
      and(
        eq(friendLinks.serverId, serverId),
        or(
          and(eq(friendLinks.requesterId, meId), eq(friendLinks.addresseeId, otherId)),
          and(eq(friendLinks.requesterId, otherId), eq(friendLinks.addresseeId, meId)),
        ),
      ),
    )
    .limit(1);
  if (!l) return 'none';
  if (l.status === 'accepted') return 'friend';
  return l.requesterId === meId ? 'outgoing' : 'incoming';
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
