import { afterAll, describe, expect, it } from 'vitest';

import {
  CHAT_MAX_LEN,
  chatBodyErrorMessage,
  checkAndFilterChatBody,
  extractMentionCandidates,
  formatMuteRemaining,
} from '@/lib/game/chat/filter';
import {
  WHISPER_HIDDEN_BODY,
  isUserIdShape,
  leaveWhisper,
  listWhisperMessages,
  listWhisperThreads,
  markWhisperRead,
  reportWhisperMessage,
  whisperPreviewBody,
  type WhisperDb,
} from '@/lib/game/chat/whisper';

import { endTestDb, sql, testDb } from '../db';

/**
 * 귓속말(0155) — 순수 규칙 + 대화 가시성(읽음/나가기/숨김) DB 회귀.
 *
 * DB 케이스는 공유 DB를 쓰므로 **트랜잭션 안에서 실행 후 강제 롤백**한다(wallet 테스트와 동일).
 * 코어 조회/갱신 4함수가 db 핸들을 인자로 받는 이유가 이것 — 실제 대화 데이터를 만들지 않는다.
 */

const TEST_USER_ID = process.env.TEST_USER_ID ?? '';
const skip = !TEST_USER_ID;
const SERVER_ID = 1; // 테스트 계정이 캐릭터를 보유한 서버(다른 DB 테스트와 동일 가정).

describe('귓속말 — 전송 규칙(순수)', () => {
  it('본문 규칙은 전체 채팅과 동일(길이·URL·금칙어)', () => {
    expect(checkAndFilterChatBody('안녕하세요')).toEqual({ ok: true, body: '안녕하세요' });
    expect(checkAndFilterChatBody('가'.repeat(CHAT_MAX_LEN + 1))).toEqual({
      ok: false,
      reason: 'TOO_LONG',
    });
    expect(checkAndFilterChatBody('https://example.com 봐봐')).toEqual({ ok: false, reason: 'URL' });
    expect(checkAndFilterChatBody('   ')).toEqual({ ok: false, reason: 'EMPTY' });
  });

  it('탈락 문구는 채널과 무관하게 한 곳에서 나온다', () => {
    expect(chatBodyErrorMessage('URL')).toBe('링크는 보낼 수 없어요.');
    expect(chatBodyErrorMessage('TOO_LONG')).toBe(`${CHAT_MAX_LEN}자까지 보낼 수 있어요.`);
    expect(chatBodyErrorMessage('EMPTY')).toBe('내용을 입력해 주세요.');
  });

  it('제재 잔여 기간은 가장 큰 단위 하나로 표기(0분 없음)', () => {
    expect(formatMuteRemaining(3 * 86_400_000)).toBe('3일');
    expect(formatMuteRemaining(2 * 3_600_000)).toBe('2시간');
    expect(formatMuteRemaining(90_000)).toBe('2분');
    expect(formatMuteRemaining(1_000)).toBe('1분');
  });

  it('@멘션 후보: 중복 제거 + 최대 5개, @ 없으면 조회 자체를 안 한다', () => {
    expect(extractMentionCandidates('안녕')).toEqual([]);
    expect(extractMentionCandidates('@가 @나 @가')).toEqual(['가', '나']);
    expect(extractMentionCandidates('@a @b @c @d @e @f')).toHaveLength(5);
    // 13자 이상은 닉네임 상한을 넘어 후보가 아니다(닉 정책과 동일 상한).
    expect(extractMentionCandidates(`@${'가'.repeat(13)}`)).toEqual([`${'가'.repeat(12)}`]);
  });

  it('peerUserId 형식 검증 — uuid만 통과(SQL 캐스트 전 차단)', () => {
    expect(isUserIdShape('7a799f6e-0000-4000-8000-000000000000')).toBe(true);
    expect(isUserIdShape('not-a-uuid')).toBe(false);
    expect(isUserIdShape('')).toBe(false);
    // 대문자는 호출부에서 소문자로 정규화한 뒤 검사한다.
    expect(isUserIdShape('7A799F6E-0000-4000-8000-000000000000')).toBe(false);
  });

  it('숨김 메시지는 목록 미리보기에서 대체 문구로 바뀐다', () => {
    expect(whisperPreviewBody('원문', false)).toBe('원문');
    expect(whisperPreviewBody('원문', true)).toBe(WHISPER_HIDDEN_BODY);
  });
});

class Rollback extends Error {}
/** fn을 트랜잭션에서 실행하고 항상 롤백 — 커밋되는 변경 0. */
async function inRollback(fn: (tx: WhisperDb) => Promise<void>): Promise<void> {
  try {
    await testDb.transaction(async (tx) => {
      await fn(tx as WhisperDb);
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
}

/** 같은 서버의 다른 캐릭터 하나 — 귓속말 상대. 없으면 null(케이스 스킵). */
async function pickPeer(tx: WhisperDb): Promise<string | null> {
  const rows = (await tx.execute(sql`
    select user_id::text uid from characters
    where server_id = ${SERVER_ID} and user_id <> ${TEST_USER_ID}::uuid
    order by user_id limit 1
  `)) as unknown as { uid: string }[];
  return rows[0]?.uid ?? null;
}

/** 대화와 무관한 제3자 하나 — 신고 참가자 검증용. 없으면 null(케이스 스킵). */
async function pickThird(tx: WhisperDb, peer: string): Promise<string | null> {
  const rows = (await tx.execute(sql`
    select user_id::text uid from characters
    where server_id = ${SERVER_ID} and user_id not in (${TEST_USER_ID}::uuid, ${peer}::uuid)
    order by user_id limit 1
  `)) as unknown as { uid: string }[];
  return rows[0]?.uid ?? null;
}

async function insertWhisper(
  tx: WhisperDb,
  from: string,
  to: string,
  body: string,
  hidden = false,
  mentions: { n: string; c: string | null }[] | null = null,
): Promise<bigint> {
  const rows = (await tx.execute(sql`
    insert into whisper_messages (server_id, from_user_id, to_user_id, body, hidden_at, mentions)
    values (${SERVER_ID}, ${from}::uuid, ${to}::uuid, ${body},
            ${hidden ? sql`now()` : sql`null`},
            ${mentions === null ? sql`null` : sql`${JSON.stringify(mentions)}::jsonb`})
    returning id::text id
  `)) as unknown as { id: string }[];
  return BigInt(rows[0]!.id);
}

/** 이 테스트가 만든 대화만 보도록 기존 이력을 나가기로 덮는다(공유 DB 격리). */
async function isolatePair(tx: WhisperDb, peer: string): Promise<void> {
  await leaveWhisper(TEST_USER_ID, SERVER_ID, peer, tx);
}

afterAll(async () => {
  await endTestDb();
});

describe.skipIf(skip)('귓속말 — 대화 가시성 DB 회귀', () => {
  it('스레드 조회: 양방향 메시지를 오래된 → 최신 순으로, 숨김은 제외', async () => {
    await inRollback(async (tx) => {
      const peer = await pickPeer(tx);
      if (!peer) return;
      await isolatePair(tx, peer);

      const a = await insertWhisper(tx, TEST_USER_ID, peer, '내가 보냄');
      const b = await insertWhisper(tx, peer, TEST_USER_ID, '@나 상대가 보냄', false, [
        { n: '나', c: 'ABC123' },
      ]);
      await insertWhisper(tx, peer, TEST_USER_ID, '숨김 처리됨', true);

      const msgs = await listWhisperMessages(TEST_USER_ID, SERVER_ID, peer, undefined, tx);
      expect(msgs.map((m) => m.id)).toEqual([String(a), String(b)]);
      expect(msgs[0]!.fromUserId).toBe(TEST_USER_ID);
      expect(msgs[1]!.toUserId).toBe(TEST_USER_ID);
      // createdAt은 SQL이 만든 ISO 문자열 — 클라 파서가 그대로 쓸 수 있어야 한다.
      expect(msgs[0]!.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      // mentions(jsonb)는 [{n,c}] 구조로 되돌아온다(채팅 DTO와 동일).
      expect(msgs[0]!.mentions).toBeNull();
      expect(msgs[1]!.mentions).toEqual([{ n: '나', c: 'ABC123' }]);
    });
  });

  it('before 커서: 지정 id 미만만 돌려준다', async () => {
    await inRollback(async (tx) => {
      const peer = await pickPeer(tx);
      if (!peer) return;
      await isolatePair(tx, peer);

      const a = await insertWhisper(tx, peer, TEST_USER_ID, '1번');
      const b = await insertWhisper(tx, peer, TEST_USER_ID, '2번');

      const older = await listWhisperMessages(TEST_USER_ID, SERVER_ID, peer, b, tx);
      expect(older.map((m) => m.id)).toEqual([String(a)]);
    });
  });

  it('목록: 미읽음은 내가 받은 것만 세고, 읽음 처리 후 0이 된다', async () => {
    await inRollback(async (tx) => {
      const peer = await pickPeer(tx);
      if (!peer) return;
      await isolatePair(tx, peer);

      await insertWhisper(tx, TEST_USER_ID, peer, '내 메시지는 미읽음이 아니다');
      await insertWhisper(tx, peer, TEST_USER_ID, '받은 1');
      const last = await insertWhisper(tx, peer, TEST_USER_ID, '받은 2');

      const before = await listWhisperThreads(TEST_USER_ID, SERVER_ID, tx);
      const t = before.find((x) => x.peerUserId === peer);
      expect(t?.unread).toBe(2);
      expect(t?.lastFromMe).toBe(false);
      expect(t?.lastBody).toBe('받은 2');

      await markWhisperRead(TEST_USER_ID, SERVER_ID, peer, last, tx);
      const after = await listWhisperThreads(TEST_USER_ID, SERVER_ID, tx);
      expect(after.find((x) => x.peerUserId === peer)?.unread).toBe(0);
    });
  });

  it('읽음 포인터: 역행 금지 + 대화 최신 id로 상한(임의 큰 값 무효)', async () => {
    await inRollback(async (tx) => {
      const peer = await pickPeer(tx);
      if (!peer) return;
      await isolatePair(tx, peer);

      const first = await insertWhisper(tx, peer, TEST_USER_ID, '1번');
      const last = await insertWhisper(tx, peer, TEST_USER_ID, '2번');

      // 실제 최신 id를 훨씬 넘는 값 → 최신 id로 잘린다(미래 메시지 선읽음 방지).
      await markWhisperRead(TEST_USER_ID, SERVER_ID, peer, 9_000_000_000_000_000_000n, tx);
      const read = async () => {
        const rows = (await tx.execute(sql`
          select last_read_id::text v from whisper_reads
          where user_id = ${TEST_USER_ID}::uuid and server_id = ${SERVER_ID} and peer_user_id = ${peer}::uuid
        `)) as unknown as { v: string }[];
        return rows[0]!.v;
      };
      expect(await read()).toBe(String(last));

      // 더 작은 값으로 되돌리려 해도 유지(greatest).
      await markWhisperRead(TEST_USER_ID, SERVER_ID, peer, first, tx);
      expect(await read()).toBe(String(last));
    });
  });

  it('나가기: 내 목록에서만 사라지고, 이후 새 메시지로 대화가 되살아난다', async () => {
    await inRollback(async (tx) => {
      const peer = await pickPeer(tx);
      if (!peer) return;
      await isolatePair(tx, peer);

      await insertWhisper(tx, peer, TEST_USER_ID, '나가기 전');
      await leaveWhisper(TEST_USER_ID, SERVER_ID, peer, tx);

      const gone = await listWhisperThreads(TEST_USER_ID, SERVER_ID, tx);
      expect(gone.find((x) => x.peerUserId === peer)).toBeUndefined();
      expect(await listWhisperMessages(TEST_USER_ID, SERVER_ID, peer, undefined, tx)).toEqual([]);

      const fresh = await insertWhisper(tx, peer, TEST_USER_ID, '나가기 후');
      const back = await listWhisperThreads(TEST_USER_ID, SERVER_ID, tx);
      const t = back.find((x) => x.peerUserId === peer);
      expect(t?.unread).toBe(1);
      expect(t?.lastBody).toBe('나가기 후');
      // 나간 지점 이전은 되살아나지 않는다(상대 기록·어드민 열람만 유지).
      const msgs = await listWhisperMessages(TEST_USER_ID, SERVER_ID, peer, undefined, tx);
      expect(msgs.map((m) => m.id)).toEqual([String(fresh)]);
    });
  });

  it('신고: 그 대화의 참가자만 — 제3자·내 메시지·없는 id는 전부 not_found', async () => {
    await inRollback(async (tx) => {
      const peer = await pickPeer(tx);
      if (!peer) return;
      await isolatePair(tx, peer);

      const fromPeer = await insertWhisper(tx, peer, TEST_USER_ID, '상대가 보낸 메시지');
      const fromMe = await insertWhisper(tx, TEST_USER_ID, peer, '내가 보낸 메시지');

      expect(await reportWhisperMessage(TEST_USER_ID, fromPeer, tx)).toBe('ok');
      // 같은 사람의 재신고는 멱등(onConflictDoNothing) — 건수가 늘지 않는다.
      expect(await reportWhisperMessage(TEST_USER_ID, fromPeer, tx)).toBe('ok');
      const rows = (await tx.execute(sql`
        select count(*)::int as n from whisper_reports where message_id = ${fromPeer}
      `)) as unknown as { n: number }[];
      expect(rows[0]!.n).toBe(1);

      // 내 메시지는 신고 경로 자체가 없다(전체 채팅과 동일).
      expect(await reportWhisperMessage(TEST_USER_ID, fromMe, tx)).toBe('not_found');
      // 존재하지 않는 id — 열거해도 아무것도 알 수 없다.
      expect(await reportWhisperMessage(TEST_USER_ID, 9_000_000_000_000_000_000n, tx)).toBe(
        'not_found',
      );
      // 제3자는 '없음'과 같은 응답 — 남의 1:1 대화 존재 여부가 새지 않게.
      const third = await pickThird(tx, peer);
      if (third) expect(await reportWhisperMessage(third, fromPeer, tx)).toBe('not_found');
    });
  });

  it('목록: 최신 메시지가 숨김이어도 대화는 남고 미리보기만 대체된다', async () => {
    await inRollback(async (tx) => {
      const peer = await pickPeer(tx);
      if (!peer) return;
      await isolatePair(tx, peer);

      await insertWhisper(tx, peer, TEST_USER_ID, '보이는 메시지');
      await insertWhisper(tx, peer, TEST_USER_ID, '신고로 숨김', true);

      const rows = await listWhisperThreads(TEST_USER_ID, SERVER_ID, tx);
      const t = rows.find((x) => x.peerUserId === peer);
      expect(t?.lastBody).toBe(WHISPER_HIDDEN_BODY);
      // 숨김은 미읽음에 세지 않는다.
      expect(t?.unread).toBe(1);
    });
  });
});
