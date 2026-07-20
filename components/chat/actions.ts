'use server';

import { eq } from 'drizzle-orm';

import { and, inArray } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { getActiveServerId } from '@/lib/game/servers';
import { actionBlock } from '@/lib/game/action-gate';
import { rateLimited } from '@/lib/ratelimit';
import { db } from '@/lib/db/client';
import { profiles } from '@/lib/db/schema/profiles';
import { characters } from '@/lib/db/schema/server';
import { catalogItems, userEquipment } from '@/lib/db/schema/equipment';
import { pieceCombatPower } from '@/lib/game/balance';
import { sendPushToUser } from '@/lib/push/send';
import { CHAT_MAX_LEN, checkAndFilterChatBody } from '@/lib/game/chat/filter';
import {
  isChatEnabled,
  isDuplicateOfLast,
  persistAndBroadcast,
  reportChatMessage,
  setChatBlock,
  type ChatItemSnap,
  type ChatMessageDto,
} from '@/lib/game/chat/service';

/** 월드 채팅 액션(0125) — 전송·신고. 전송은 서버 검증 단일 경로. */

export type SendChatResult =
  | { status: 'ok'; message: ChatMessageDto }
  | { status: 'error'; message: string };

export async function sendChat(raw: string, itemEquipId?: string): Promise<SendChatResult> {
  const userId = await getSessionUserId();
  if (!userId) return { status: 'error', message: '로그인이 필요합니다.' };
  const __b = await actionBlock(); // 밴·점검 캐시 — 저비용.
  if (__b) return { status: 'error', message: __b === 'BANNED' ? '이용이 제한된 계정입니다.' : '서버 점검 중입니다.' };

  // 본문 필터 먼저(동기·무비용) — 필터 탈락 입력이 쿨다운 토큰을 소모하지 않게.
  // 장비 태그만 보내는 경우(0127)는 빈 본문 허용.
  let body = '';
  if (raw.trim() || !itemEquipId) {
    const check = checkAndFilterChatBody(raw);
    if (!check.ok) {
      const msg =
        check.reason === 'URL'
          ? '링크는 보낼 수 없어요.'
          : check.reason === 'TOO_LONG'
            ? `${CHAT_MAX_LEN}자까지 보낼 수 있어요.`
            : '내용을 입력해 주세요.';
      return { status: 'error', message: msg };
    }
    body = check.body;
  }

  const serverId = await getActiveServerId(); // 쿠키 — 왕복 없음.
  // 독립 검증 병렬화 — 순차 5왕복 → 1왕복 시간. 킬스위치/뮤트 탈락 시 레이트 토큰이
  // 소모되는 부작용은 무해(어차피 전송 불가 상태)로 수용.
  const [enabled, [p], cooldownHit, burstHit, duplicate] = await Promise.all([
    isChatEnabled(),
    db
      .select({ mutedUntil: profiles.chatMutedUntil })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1),
    rateLimited(userId, 'chatSend'),
    rateLimited(userId, 'chatBurst'),
    body ? isDuplicateOfLast(userId, serverId, body) : Promise.resolve(false),
  ]);
  if (!enabled) return { status: 'error', message: '채팅이 잠시 닫혀 있습니다.' };
  // 채팅 금지(운영 제재) — 만료 지나면 자동 해제 간주. 남은 기간 안내(피드백 2026-07-21).
  if (p?.mutedUntil && p.mutedUntil > new Date()) {
    const ms = p.mutedUntil.getTime() - Date.now();
    const left =
      ms >= 86_400_000
        ? `${Math.ceil(ms / 86_400_000)}일`
        : ms >= 3_600_000
          ? `${Math.ceil(ms / 3_600_000)}시간`
          : `${Math.max(1, Math.ceil(ms / 60_000))}분`;
    return { status: 'error', message: `채팅 이용이 제한된 상태입니다. (해제까지 약 ${left})` };
  }
  if (cooldownHit) return { status: 'error', message: '잠시 후 다시 보낼 수 있어요. (5초)' };
  if (burstHit) return { status: 'error', message: '메시지를 너무 자주 보내고 있어요. 잠시 쉬어주세요.' };
  if (duplicate) return { status: 'error', message: '같은 내용을 연속으로 보낼 수 없어요.' };

  // 장비 자랑 태그(0127) — 소유 검증 후 전송 시점 스냅샷.
  let item: ChatItemSnap | null = null;
  if (itemEquipId) {
    let eid: bigint;
    try {
      eid = BigInt(itemEquipId);
    } catch {
      return { status: 'error', message: '잘못된 요청입니다.' };
    }
    const [r] = await db
      .select({
        name: catalogItems.name,
        code: catalogItems.code,
        slot: catalogItems.slot,
        e: userEquipment.enhanceLevel,
        t: userEquipment.transcendLevel,
      })
      .from(userEquipment)
      .innerJoin(catalogItems, eq(catalogItems.id, userEquipment.catalogItemId))
      .where(and(eq(userEquipment.id, eid), eq(userEquipment.userId, userId), eq(userEquipment.serverId, serverId)))
      .limit(1);
    if (!r) return { status: 'error', message: '장비를 찾을 수 없습니다.' };
    item = { n: r.name, c: r.code, s: r.slot, e: r.e, t: r.t, cp: pieceCombatPower(r.e, r.t) };
  }

  const message = await persistAndBroadcast(userId, serverId, body, item);

  // @멘션 푸시(0127) — 서버 닉네임과 일치하는 대상만, 최대 3명, 옵트아웃(push_chat_mention) 존중.
  if (body.includes('@')) {
    const cands = [...new Set([...body.matchAll(/@([^\s@]{1,12})/g)].map((m) => m[1]!))].slice(0, 5);
    if (cands.length > 0) {
      try {
        const rows = await db
          .select({ uid: characters.userId, nickname: characters.nickname })
          .from(characters)
          .where(and(eq(characters.serverId, serverId), inArray(characters.nickname, cands)));
        const targets = rows.filter((r) => r.uid !== userId).slice(0, 3);
        await Promise.all(
          targets.map((t) =>
            sendPushToUser(t.uid, {
              title: `💬 ${message.nickname}님이 채팅에서 언급했어요`,
              body: body.slice(0, 60),
              url: '/',
              tag: 'chat-mention',
              category: 'chat_mention',
            }).catch(() => null),
          ),
        );
      } catch {
        // 멘션 푸시 실패는 전송 성공에 영향 없음.
      }
    }
  }
  return { status: 'ok', message };
}

/** 차단 설정/해제(0126, 계정 귀속) — 멱등. */
export async function setChatBlockAction(
  blockedUserId: string,
  on: boolean,
): Promise<{ status: 'ok' | 'error'; message?: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { status: 'error', message: '로그인이 필요합니다.' };
  if (!/^[0-9a-f-]{36}$/i.test(blockedUserId) || blockedUserId === userId)
    return { status: 'error', message: '잘못된 요청입니다.' };
  const r = await setChatBlock(userId, blockedUserId, on);
  if (r === 'CAP') return { status: 'error', message: '차단은 최대 100명까지 가능합니다.' };
  return { status: 'ok' };
}

export async function reportChat(messageId: string): Promise<{ status: 'ok' | 'error'; message?: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { status: 'error', message: '로그인이 필요합니다.' };
  if (await rateLimited(userId, 'report')) return { status: 'error', message: '잠시 후 다시 시도해 주세요.' };
  let id: bigint;
  try {
    id = BigInt(messageId);
  } catch {
    return { status: 'error', message: '잘못된 요청입니다.' };
  }
  const r = await reportChatMessage(userId, id);
  if (r === 'not_found') return { status: 'error', message: '메시지를 찾을 수 없습니다.' };
  return { status: 'ok' };
}
