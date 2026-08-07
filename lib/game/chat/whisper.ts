import 'server-only';

import { and, eq, inArray, or, sql } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { getActiveServerId } from '@/lib/game/servers';
import { actionBlock } from '@/lib/game/action-gate';
import { rateLimited } from '@/lib/ratelimit';
import { db } from '@/lib/db/client';
import { profiles } from '@/lib/db/schema/profiles';
import { characters } from '@/lib/db/schema/server';
import { chatBlocks, whisperMessages, whisperReads } from '@/lib/db/schema/chat';
import { filterByActiveServer, sendPushToUser } from '@/lib/push/send';
import {
  chatBodyErrorMessage,
  checkAndFilterChatBody,
  extractMentionCandidates,
  formatMuteRemaining,
} from '@/lib/game/chat/filter';
import { displayFields, isChatEnabled, normMentions, type ChatMention } from '@/lib/game/chat/service';
import { broadcastWhisper, whisperTopic } from '@/lib/game/chat/realtime';

/**
 * 귓속말(0155) — 1:1 대화. 대화방 테이블 없이 (server_id, 유저쌍)이 곧 대화다.
 *
 * 전체 채팅과 공유하는 것: 킬스위치(system_mode 'chat')·본문 필터·채팅 금지 제재·차단 목록
 * (chat_blocks). 다른 것: 쿨다운 버킷(whisperSend/whisperBurst), 토픽(수신자 1인 1토픽),
 * 푸시 조건(상대를 @멘션했을 때만 — 대화 자체는 알림을 만들지 않는다, 설계 D1).
 *
 * '나가기'는 내 쪽 hidden_before_id만 올린다 — 상대의 기록·어드민 열람은 그대로 유지된다.
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
/** db 또는 트랜잭션 핸들 — 테스트가 롤백 트랜잭션 안에서 같은 로직을 검증할 수 있게. */
export type WhisperDb = typeof db | Tx;

export type WhisperMessageDto = {
  id: string;
  fromUserId: string;
  toUserId: string;
  body: string;
  mentions: ChatMention[] | null;
  createdAt: string; // ISO
};

export type WhisperThread = {
  peerUserId: string;
  nickname: string;
  publicCode: string | null;
  avatar: string | null;
  faceBox: { cx: number; cy: number; h: number } | null;
  guildName: string | null;
  lastBody: string;
  lastFromMe: boolean;
  lastAt: string; // ISO
  unread: number;
};

export type SendWhisperResult =
  | { status: 'ok'; message: WhisperMessageDto }
  | { status: 'error'; message: string };

/** 숨김(모더레이션) 메시지가 목록 미리보기에 노출될 때의 대체 문구. */
export const WHISPER_HIDDEN_BODY = '(숨김 처리된 메시지)';
/** 스레드 한 페이지 — 채팅 도크와 같은 감각의 스크롤 단위. */
export const WHISPER_PAGE_SIZE = 50;
/** 대화 목록 상한 — 무한 누적 방지(오래된 대화는 30일 보존 정리로 자연 소멸). */
export const WHISPER_THREADS_LIMIT = 50;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * userId 형식 검증 — peerUserId는 유저 입력이라 DB에 uuid로 넘기기 전에 걸러낸다
 * (형식 오류가 500 대신 사용자 문구가 되도록). 소문자 정규화 후 검사.
 */
export function isUserIdShape(v: string): boolean {
  return UUID_RE.test(v);
}

/** 목록 미리보기 본문 — 숨김이면 원문 대신 대체 문구(전체 채팅의 숨김 처리와 같은 정책). */
export function whisperPreviewBody(body: string, hidden: boolean): string {
  return hidden ? WHISPER_HIDDEN_BODY : body;
}

/** 쌍 조건 — whisper_pair_idx(server_id, least, greatest, id desc)를 그대로 타는 형태. */
function pairCond(serverId: number, a: string, b: string) {
  return sql`${whisperMessages.serverId} = ${serverId}
    and least(${whisperMessages.fromUserId}, ${whisperMessages.toUserId}) = least(${a}::uuid, ${b}::uuid)
    and greatest(${whisperMessages.fromUserId}, ${whisperMessages.toUserId}) = greatest(${a}::uuid, ${b}::uuid)`;
}

/**
 * timestamptz → ISO 문자열을 **SQL에서** 만든다. 드리즐 raw execute는 timestamptz를 Date가 아닌
 * 문자열('2026-08-07 05:27:49.123+00')로 돌려주므로, JS 파싱에 기대면 포맷 가정이 숨은 함정이 된다.
 * to_char 결과는 Date.toISOString()과 문자 단위로 동일 — 채팅 DTO와 클라 파서를 그대로 쓸 수 있다.
 */
function isoCol(col: ReturnType<typeof sql.raw>) {
  return sql`to_char(${col} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
}

/** 내가 그 대화를 나간 지점(없으면 0) — 스칼라 서브셀렉트로 왕복을 늘리지 않는다. */
function hiddenBeforeSub(userId: string, serverId: number, peerUserId: string) {
  return sql`coalesce((select hidden_before_id from whisper_reads
    where user_id = ${userId}::uuid and server_id = ${serverId} and peer_user_id = ${peerUserId}::uuid), 0)`;
}

/**
 * 전송 — sendChatCore와 같은 순서(필터 → 서버/상대 검증 → 병렬 게이트 → 저장 → 브로드캐스트 → 푸시).
 * 호출: POST /api/chat/whisper/send.
 */
export async function sendWhisperCore(peerUserId: string, raw: string): Promise<SendWhisperResult> {
  const userId = await getSessionUserId();
  if (!userId) return { status: 'error', message: '로그인이 필요합니다.' };
  const blocked = await actionBlock(); // 밴·점검 캐시 — 저비용.
  if (blocked) {
    return {
      status: 'error',
      message: blocked === 'BANNED' ? '이용이 제한된 계정입니다.' : '서버 점검 중입니다.',
    };
  }

  // 본문 필터 먼저(동기·무비용) — 필터 탈락 입력이 쿨다운 토큰을 소모하지 않게.
  const check = checkAndFilterChatBody(raw);
  if (!check.ok) return { status: 'error', message: chatBodyErrorMessage(check.reason) };
  const body = check.body;

  const me = userId.toLowerCase();
  const peer = peerUserId.trim().toLowerCase();
  if (!isUserIdShape(peer)) return { status: 'error', message: '잘못된 요청입니다.' };
  if (peer === me) return { status: 'error', message: '자기 자신에게는 보낼 수 없어요.' };

  const serverId = await getActiveServerId(); // 쿠키 — 왕복 없음.

  // 독립 검증 병렬화(CLAUDE §11.4) — 상대 존재 확인까지 같은 왕복에 묶는다. 게이트 탈락 시
  // 레이트 토큰이 소모되는 부작용은 무해(어차피 전송 불가 상태)로 수용 — 전체 채팅과 동일.
  const [enabled, [p], cooldownHit, burstHit, blockRows, [peerChar]] = await Promise.all([
    isChatEnabled(),
    db
      .select({ mutedUntil: profiles.chatMutedUntil })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1),
    rateLimited(userId, 'whisperSend'),
    rateLimited(userId, 'whisperBurst'),
    db
      .select({ owner: chatBlocks.userId })
      .from(chatBlocks)
      .where(
        or(
          and(eq(chatBlocks.userId, userId), eq(chatBlocks.blockedUserId, peer)),
          and(eq(chatBlocks.userId, peer), eq(chatBlocks.blockedUserId, userId)),
        ),
      ),
    db
      .select({ userId: characters.userId })
      .from(characters)
      .where(and(eq(characters.userId, peer), eq(characters.serverId, serverId)))
      .limit(1),
  ]);

  // 서버 경계(SERVER.md §1) — 귓속말은 같은 논리 서버 안에서만.
  if (!peerChar) return { status: 'error', message: '이 서버에 없는 유저예요.' };
  if (!enabled) return { status: 'error', message: '채팅이 잠시 닫혀 있습니다.' };
  // 채팅 금지(운영 제재)는 귓속말에도 그대로 적용 — 제재 우회 통로가 되지 않게.
  if (p?.mutedUntil && p.mutedUntil > new Date()) {
    const left = formatMuteRemaining(p.mutedUntil.getTime() - Date.now());
    return { status: 'error', message: `채팅 이용이 제한된 상태입니다. (해제까지 약 ${left})` };
  }
  if (cooldownHit) return { status: 'error', message: '잠시 후 다시 보낼 수 있어요. (2초)' };
  if (burstHit) return { status: 'error', message: '메시지를 너무 자주 보내고 있어요. 잠시 쉬어주세요.' };

  const iBlocked = blockRows.some((r) => r.owner.toLowerCase() === me);
  const blockedByPeer = blockRows.some((r) => r.owner.toLowerCase() === peer);
  if (iBlocked) return { status: 'error', message: '차단한 상대에게는 보낼 수 없어요.' };

  // @멘션 — 전체 채팅과 동일 규칙(같은 서버 실유저만·본인 제외). 1:1이라 길드 한정 같은 추가 필터 없음.
  let mentions: ChatMention[] = [];
  let mentionedPeer = false;
  const cands = extractMentionCandidates(body);
  if (cands.length > 0) {
    try {
      const rows = await db
        .select({ uid: characters.userId, nickname: characters.nickname, code: profiles.publicCode })
        .from(characters)
        .innerJoin(profiles, eq(profiles.id, characters.userId))
        .where(and(eq(characters.serverId, serverId), inArray(characters.nickname, cands)));
      const targets = rows.filter((r) => r.uid !== userId);
      mentions = targets.map((t) => ({ n: t.nickname, c: t.code }));
      mentionedPeer = targets.some((t) => t.uid.toLowerCase() === peer);
    } catch {
      // 멘션 해석 실패 — 일반 텍스트로 전송.
    }
  }

  const [row] = await db
    .insert(whisperMessages)
    .values({
      serverId,
      fromUserId: userId,
      toUserId: peer,
      body,
      mentions: mentions.length ? mentions : null,
    })
    .returning({ id: whisperMessages.id, createdAt: whisperMessages.createdAt });
  const messageId = row!.id;

  // 내가 보낸 메시지는 나에게 읽음. hidden_before_id는 유지한다 — '나가기'로 정리한 과거가
  // 재발신 한 번에 통째로 되살아나면 나가기의 의미가 없다. 새 메시지(id > hidden_before)부터
  // 스레드가 다시 시작된다(상대가 먼저 보내는 경우와 동일한 '신규분부터 재등장' 규칙).
  await db
    .insert(whisperReads)
    .values({ userId, serverId, peerUserId: peer, lastReadId: messageId })
    .onConflictDoUpdate({
      target: [whisperReads.userId, whisperReads.serverId, whisperReads.peerUserId],
      set: { lastReadId: messageId, updatedAt: new Date() },
    });

  const dto: WhisperMessageDto = {
    id: String(messageId),
    fromUserId: userId,
    toUserId: peer,
    body,
    mentions: mentions.length ? mentions : null,
    createdAt: row!.createdAt.toISOString(),
  };

  // 나를 차단한 상대에게는 실시간을 보내지 않는다(차단 우회 채널 방지). 내 토픽은 항상 —
  // 같은 계정의 다른 기기가 즉시 동기화되도록. 수신자는 DTO의 from/to로 스스로 방향을 판별한다.
  await broadcastWhisper(
    blockedByPeer
      ? [whisperTopic(serverId, userId)]
      : [whisperTopic(serverId, peer), whisperTopic(serverId, userId)],
    dto,
  );

  // 푸시(설계 D1) — 귓속말 도착 자체로는 알리지 않고, 상대를 명시로 @멘션했을 때만.
  if (mentionedPeer && !blockedByPeer) {
    try {
      // 경계규칙 1 — 이 서버가 활성(last_server_id)인 유저에게만(타 서버 플레이 중 오알림 억제).
      const active = await filterByActiveServer([peer], serverId);
      if (active.length > 0) {
        const [sender] = await db
          .select({ nickname: characters.nickname, code: profiles.publicCode })
          .from(characters)
          .innerJoin(profiles, eq(profiles.id, characters.userId))
          .where(and(eq(characters.userId, userId), eq(characters.serverId, serverId)))
          .limit(1);
        await sendPushToUser(peer, {
          category: 'chat_mention',
          title: `💬 ${sender?.nickname ?? '대장장이'}님이 귓속말에서 언급했어요`,
          body: body.slice(0, 60),
          // 발신자별 tag — 여러 상대의 알림이 서로를 덮어쓰지 않게.
          tag: `whisper-${userId}`,
          url: sender?.code ? `/?chat=whisper&peer=${sender.code}` : '/?chat=whisper',
        });
      }
    } catch {
      // best-effort — 푸시 실패로 전송을 되돌리지 않는다.
    }
  }

  return { status: 'ok', message: dto };
}

type ThreadRow = {
  last_id: string;
  peer: string;
  body: string;
  hidden: boolean;
  from_me: boolean;
  created_at: string; // ISO(SQL에서 생성 — isoCol)
  unread: number;
};

/**
 * 대화 목록 — 쌍별 최신 1건(distinct on) + 미읽음 수. 내가 나간 지점 이하의 대화는 제외한다.
 * 최신 메시지가 숨김이어도 대화는 남기고 미리보기 문구만 바꾼다(대화가 통째로 증발하지 않게).
 */
export async function listWhisperThreads(
  userId: string,
  serverId: number,
  dbx: WhisperDb = db,
): Promise<WhisperThread[]> {
  const rows = (await dbx.execute(sql`
    with pairs as (
      select distinct on (least(from_user_id, to_user_id), greatest(from_user_id, to_user_id))
             id, body, hidden_at, created_at,
             (from_user_id = ${userId}::uuid) as from_me,
             (case when from_user_id = ${userId}::uuid then to_user_id else from_user_id end) as peer
      from whisper_messages
      where server_id = ${serverId}
        and (from_user_id = ${userId}::uuid or to_user_id = ${userId}::uuid)
      order by least(from_user_id, to_user_id), greatest(from_user_id, to_user_id), id desc
    )
    select p.id::text        as last_id,
           p.peer::text      as peer,
           p.body            as body,
           (p.hidden_at is not null) as hidden,
           p.from_me         as from_me,
           ${isoCol(sql.raw('p.created_at'))} as created_at,
           (select count(*)::int from whisper_messages m
             where m.server_id = ${serverId}
               and m.to_user_id = ${userId}::uuid
               and m.from_user_id = p.peer
               and m.hidden_at is null
               and m.id > coalesce(r.last_read_id, 0)
               and m.id > coalesce(r.hidden_before_id, 0)) as unread
    from pairs p
    left join whisper_reads r
      on r.user_id = ${userId}::uuid and r.server_id = ${serverId} and r.peer_user_id = p.peer
    where p.id > coalesce(r.hidden_before_id, 0)
    order by p.id desc
    limit ${WHISPER_THREADS_LIMIT}
  `)) as unknown as ThreadRow[];
  if (rows.length === 0) return [];

  const fields = await displayFields(rows.map((r) => r.peer), serverId);
  return rows.map((r) => {
    const f = fields.get(r.peer);
    return {
      peerUserId: r.peer,
      // 상대가 이 서버에 캐릭터가 없는 경우(서버 이전·탈퇴) — 대화는 남기고 닉만 폴백.
      nickname: f?.nickname ?? '유저',
      publicCode: f?.publicCode ?? null,
      avatar: f?.avatar ?? null,
      faceBox: f?.faceBox ?? null,
      guildName: f?.guildName ?? null,
      lastBody: whisperPreviewBody(r.body, r.hidden),
      lastFromMe: r.from_me,
      lastAt: r.created_at,
      unread: r.unread,
    } satisfies WhisperThread;
  });
}

type MessageRow = {
  id: string;
  from_user_id: string;
  to_user_id: string;
  body: string;
  mentions: unknown;
  created_at: string; // ISO(SQL에서 생성 — isoCol)
};

/** 한 대화의 메시지 — beforeId 미만 최신 50건을 오래된 → 최신 순으로. */
export async function listWhisperMessages(
  userId: string,
  serverId: number,
  peerUserId: string,
  beforeId?: bigint,
  dbx: WhisperDb = db,
): Promise<WhisperMessageDto[]> {
  const rows = (await dbx.execute(sql`
    select id::text as id, from_user_id::text as from_user_id, to_user_id::text as to_user_id,
           body, mentions, ${isoCol(sql.raw('created_at'))} as created_at
    from whisper_messages
    where ${pairCond(serverId, userId, peerUserId)}
      and hidden_at is null
      and id > ${hiddenBeforeSub(userId, serverId, peerUserId)}
      ${beforeId === undefined ? sql`` : sql`and id < ${beforeId}::bigint`}
    order by id desc
    limit ${WHISPER_PAGE_SIZE}
  `)) as unknown as MessageRow[];
  return rows.reverse().map((r) => ({
    id: r.id,
    fromUserId: r.from_user_id,
    toUserId: r.to_user_id,
    body: r.body,
    mentions: normMentions(r.mentions),
    createdAt: r.created_at,
  }));
}

/**
 * 읽음 포인터 전진 — 역행 금지(greatest). 클라가 보낸 id는 그 대화의 실제 최신 id로 상한을
 * 두어, 임의의 큰 값으로 미래 메시지까지 미리 읽음 처리되는 것을 막는다.
 */
export async function markWhisperRead(
  userId: string,
  serverId: number,
  peerUserId: string,
  lastReadId: bigint,
  dbx: WhisperDb = db,
): Promise<void> {
  await dbx.execute(sql`
    insert into whisper_reads (user_id, server_id, peer_user_id, last_read_id)
    select ${userId}::uuid, ${serverId}::smallint, ${peerUserId}::uuid,
           least(${lastReadId}::bigint,
                 coalesce((select max(id) from whisper_messages where ${pairCond(serverId, userId, peerUserId)}), 0))
    on conflict (user_id, server_id, peer_user_id) do update
      set last_read_id = greatest(whisper_reads.last_read_id, excluded.last_read_id),
          updated_at = now()
  `);
}

/**
 * 대화 나가기 — 현재 최신 id를 hidden_before_id·last_read_id에 찍는다. 내 목록·스레드에서만
 * 사라지고 상대의 기록과 어드민 열람은 유지된다(신고 대응에 필요).
 */
export async function leaveWhisper(
  userId: string,
  serverId: number,
  peerUserId: string,
  dbx: WhisperDb = db,
): Promise<void> {
  await dbx.execute(sql`
    insert into whisper_reads (user_id, server_id, peer_user_id, last_read_id, hidden_before_id)
    select ${userId}::uuid, ${serverId}::smallint, ${peerUserId}::uuid, t.mid, t.mid
    from (select coalesce(max(id), 0)::bigint as mid from whisper_messages
          where ${pairCond(serverId, userId, peerUserId)}) t
    on conflict (user_id, server_id, peer_user_id) do update
      set hidden_before_id = greatest(whisper_reads.hidden_before_id, excluded.hidden_before_id),
          last_read_id = greatest(whisper_reads.last_read_id, excluded.last_read_id),
          updated_at = now()
  `);
}

/** 보존 — 30일. 오래된 대화는 목록에서도 자연히 사라진다. */
const WHISPER_RETENTION_DAYS = 30;
/** 대화(서버·쌍)당 보존 건수 — 이보다 오래된 메시지는 잘라낸다. */
const WHISPER_KEEP_PER_PAIR = 500;

/**
 * 보존 정리(크론) — cleanupChat과 같은 배치+시간예산 방어. 단일 window DELETE는 테이블이 커지면
 * statement_timeout에 걸리고, 실패가 조용해 다음 날 더 확실히 실패하는 루프가 된다.
 */
export async function cleanupWhispers(): Promise<number> {
  const BATCH = 5000;
  const TIME_BUDGET_MS = 30_000;
  const t0 = Date.now();
  let total = 0;
  try {
    // 1) 대화별 보존 컷오프(500번째 최신 id) — 쌍 인덱스만 훑는 소량 결과.
    const cuts = (await db.execute(sql`
      select server_id, a::text as a, b::text as b, min(id) as keep_min from (
        select server_id, id,
               least(from_user_id, to_user_id) as a,
               greatest(from_user_id, to_user_id) as b,
               row_number() over (
                 partition by server_id, least(from_user_id, to_user_id), greatest(from_user_id, to_user_id)
                 order by id desc) rn
        from whisper_messages
      ) t where rn <= ${WHISPER_KEEP_PER_PAIR} group by 1, 2, 3
    `)) as unknown as { server_id: number; a: string; b: string; keep_min: string }[];

    // 2) 30일 초과분 — 5,000개씩, 예산 안에서(whisper_created_idx).
    while (Date.now() - t0 < TIME_BUDGET_MS) {
      const r = (await db.execute(sql`
        delete from whisper_messages where id in (
          select id from whisper_messages
          where created_at < now() - (${WHISPER_RETENTION_DAYS} || ' days')::interval
          limit ${BATCH}
        )
      `)) as unknown as { count?: number };
      const aged = r.count ?? 0;
      total += aged;
      if (aged < BATCH) break;
    }

    for (const c of cuts) {
      if (Date.now() - t0 >= TIME_BUDGET_MS) {
        console.warn(`[whisper.cleanup] 시간 예산 소진 — 다음 실행에서 계속 (지금까지 ${total}건)`);
        break;
      }
      for (;;) {
        const r = (await db.execute(sql`
          delete from whisper_messages where id in (
            select id from whisper_messages
            where server_id = ${c.server_id}
              and least(from_user_id, to_user_id) = ${c.a}::uuid
              and greatest(from_user_id, to_user_id) = ${c.b}::uuid
              and id < ${BigInt(c.keep_min)}
            limit ${BATCH}
          )
        `)) as unknown as { count?: number };
        const n = r.count ?? 0;
        total += n;
        if (n < BATCH || Date.now() - t0 >= TIME_BUDGET_MS) break;
      }
    }
    return total;
  } catch (e) {
    // 실패를 조용히 삼키지 않는다 — 크론 응답은 정상이어도 로그로 드러나게.
    console.error('[whisper.cleanup] 실패', (e as Error).message);
    return -1;
  }
}
