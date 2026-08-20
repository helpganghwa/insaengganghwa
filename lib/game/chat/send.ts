import 'server-only';

import { and, eq, inArray } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { getActiveServerId } from '@/lib/game/servers';
import { actionBlock } from '@/lib/game/action-gate';
import { dualWindowLimited } from '@/lib/ratelimit';
import { db } from '@/lib/db/client';
import { profiles } from '@/lib/db/schema/profiles';
import { characters } from '@/lib/db/schema/server';
import { guildMembers } from '@/lib/db/schema/guild';
import { chatBlocks } from '@/lib/db/schema/chat';
import { filterByActiveServer, sendPushToUser } from '@/lib/push/send';
import { markChallengeEvent } from '@/lib/game/challenges/events';
import {
  chatBodyErrorMessage,
  checkAndFilterChatBody,
  extractMentionCandidates,
  formatMuteRemaining,
} from '@/lib/game/chat/filter';
import {
  getMyGuildChannel,
  isChatEnabled,
  isDuplicateOfLast,
  persistAndBroadcast,
  type ChatMessageDto,
} from '@/lib/game/chat/service';

/**
 * 채팅 전송 코어(2026-08-06) — 서버 액션(components/chat/actions.ts)에서 이전.
 * 서버 액션은 응답에 현재 라우트(layout 포함) 재렌더를 동봉해, 최고 빈도 쓰기인 채팅 전송마다
 * loadLayoutData(프로필·우편·친구요청 등 5쿼리)+칭호 재검증이 따라붙었다(전수조사 지적).
 * 채팅 UI는 낙관 렌더+브로드캐스트로 갱신되므로 revalidate가 불필요 — 순수 JSON 경로로 분리.
 * 호출: POST /api/chat/send (route.ts).
 */

export type SendChatResult =
  | { status: 'ok'; message: ChatMessageDto }
  | { status: 'error'; message: string };

export async function sendChatCore(raw: string, channel: 'all' | 'guild' = 'all'): Promise<SendChatResult> {
  const userId = await getSessionUserId();
  if (!userId) return { status: 'error', message: '로그인이 필요합니다.' };
  const __b = await actionBlock(); // 밴·점검 캐시 — 저비용.
  if (__b) return { status: 'error', message: __b === 'BANNED' ? '이용이 제한된 계정입니다.' : '서버 점검 중입니다.' };

  // 본문 필터 먼저(동기·무비용) — 필터 탈락 입력이 쿨다운 토큰을 소모하지 않게.
  const check = checkAndFilterChatBody(raw);
  if (!check.ok) return { status: 'error', message: chatBodyErrorMessage(check.reason) };
  const body = check.body;

  const serverId = await getActiveServerId(); // 쿠키 — 왕복 없음.
  // 길드 채널 — 소속 검증(미가입이면 전송 불가). 전체 채널은 guildId null.
  let guildId: bigint | null = null;
  if (channel === 'guild') {
    const g = await getMyGuildChannel(userId, serverId);
    if (!g) return { status: 'error', message: '길드에 가입해야 이용할 수 있어요.' };
    guildId = BigInt(g.guildId);
  }
  // 독립 검증 병렬화 — 순차 5왕복 → 1왕복 시간. 킬스위치/뮤트 탈락 시 레이트 토큰이
  // 소모되는 부작용은 무해(어차피 전송 불가 상태)로 수용.
  const [enabled, [p], sendGate, duplicate, myChar] = await Promise.all([
    isChatEnabled(),
    db
      .select({ mutedUntil: profiles.chatMutedUntil })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1),
    // 쿨다운(5s)+도배(60s) 이중 창을 EVAL 1회로(감사 C: Upstash 커맨드 2→1). 한도 동일.
    dualWindowLimited(userId, 'chatSend', 'chatBurst'),
    isDuplicateOfLast(userId, serverId, body, guildId),
    // 내 캐릭터 존재 확인 — 같은 왕복에 묶어 지연을 늘리지 않는다.
    db
      .select({ userId: characters.userId })
      .from(characters)
      .where(and(eq(characters.userId, userId), eq(characters.serverId, serverId)))
      .limit(1),
  ]);
  // 서버 경계(SERVER.md §1) — 활성 서버는 클라가 통제하는 쿠키고 chat_messages.server_id엔 FK도
  // 없어서, 귓속말·길드는 이미 소속을 보는데 전체 채널만 뚫려 있었다(쿠키만 바꾸면 소속 아닌
  // 서버의 월드 채팅에 글이 써졌다). createCharacter가 open 아닌 서버를 거부하므로 캐릭터 존재가
  // '실재하고 개방된 서버'를 전이적으로 보장한다 — servers 조회 없이 이 검사 하나면 충분.
  if (myChar.length === 0) return { status: 'error', message: '이 서버에서는 채팅할 수 없어요.' };
  if (!enabled) return { status: 'error', message: '채팅이 잠시 닫혀 있습니다.' };
  // 채팅 금지(운영 제재) — 만료 지나면 자동 해제 간주. 남은 기간 안내(피드백 2026-07-21).
  if (p?.mutedUntil && p.mutedUntil > new Date()) {
    const left = formatMuteRemaining(p.mutedUntil.getTime() - Date.now());
    return { status: 'error', message: `채팅 이용이 제한된 상태입니다. (해제까지 약 ${left})` };
  }
  if (sendGate === 'cooldown') return { status: 'error', message: '잠시 후 다시 보낼 수 있어요. (5초)' };
  if (sendGate === 'burst') return { status: 'error', message: '메시지를 너무 자주 보내고 있어요. 잠시 쉬어주세요.' };
  if (duplicate) return { status: 'error', message: '같은 내용을 연속으로 보낼 수 없어요.' };

  // @멘션(0128) — 실제 유저 닉과 일치하는 것만 유효. 저장(표시 시 @ 제거·강조) + 푸시(최대 3명).
  let mentionTargets: { uid: string; nickname: string; code: string | null }[] = [];
  {
    const cands = extractMentionCandidates(body);
    if (cands.length > 0) {
      try {
        const rows = await db
          .select({ uid: characters.userId, nickname: characters.nickname, code: profiles.publicCode })
          .from(characters)
          .innerJoin(profiles, eq(profiles.id, characters.userId))
          .where(and(eq(characters.serverId, serverId), inArray(characters.nickname, cands)));
        mentionTargets = rows.filter((r) => r.uid !== userId);
        // 길드 채널 — 멘션 유효 대상을 같은 길드원으로 한정(외부 유저에게 볼 수 없는
        // 메시지의 알림·강조가 가지 않게).
        if (guildId && mentionTargets.length > 0) {
          const members = await db
            .select({ uid: guildMembers.userId })
            .from(guildMembers)
            .where(
              and(
                eq(guildMembers.serverId, serverId),
                eq(guildMembers.guildId, guildId),
                inArray(guildMembers.userId, mentionTargets.map((t) => t.uid)),
              ),
            );
          const memberSet = new Set(members.map((m) => m.uid));
          mentionTargets = mentionTargets.filter((t) => memberSet.has(t.uid));
        }
      } catch {
        // 멘션 해석 실패 — 일반 텍스트로 전송.
      }
    }
  }

  const message = await persistAndBroadcast(
    userId,
    serverId,
    body,
    mentionTargets.map((t) => ({ n: t.nickname, c: t.code })),
    guildId,
  );

  // 도전 과제 '채팅 메시지 보내기'(2026-07-21) — 메시지는 7일 보존이라 영구 마킹으로 기록.
  await markChallengeEvent(db, userId, serverId, 'chat_send');

  if (mentionTargets.length > 0) {
    // 나를 차단한 유저에게는 멘션 푸시 미발송 — 차단 우회 알림 채널 방지(2026-07-22).
    try {
      const blockers = await db
        .select({ uid: chatBlocks.userId })
        .from(chatBlocks)
        .where(and(eq(chatBlocks.blockedUserId, userId), inArray(chatBlocks.userId, mentionTargets.map((t) => t.uid))));
      const blockerSet = new Set(blockers.map((b) => b.uid));
      mentionTargets = mentionTargets.filter((t) => !blockerSet.has(t.uid));
    } catch {
      // 차단 조회 실패 — 푸시 스킵보다 발송이 낫다고 보고 진행.
    }
  }
  if (mentionTargets.length > 0) {
    // 경계규칙 1 — 이 채널의 서버가 활성(last_server_id)인 유저에게만. 다른 서버에서 플레이
    // 중인 유저에게 타 서버 채팅 멘션 푸시는 오알림이다(조회 실패 시엔 발송이 낫다고 보고 진행).
    try {
      const active = new Set(
        await filterByActiveServer(mentionTargets.map((t) => t.uid), serverId),
      );
      mentionTargets = mentionTargets.filter((t) => active.has(t.uid));
    } catch {
      /* keep unfiltered */
    }
  }
  if (mentionTargets.length > 0) {
    await Promise.all(
      mentionTargets.slice(0, 3).map((t) =>
        sendPushToUser(t.uid, {
          title: `💬 ${message.nickname}님이 ${channel === 'guild' ? '길드 ' : ''}채팅에서 언급했어요`,
          body: body.slice(0, 60),
          url: `/?chat=${channel}`,
          tag: 'chat-mention',
          category: 'chat_mention',
        }).catch(() => null),
      ),
    );
  }
  return { status: 'ok', message };
}
