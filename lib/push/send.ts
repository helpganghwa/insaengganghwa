import 'server-only';

import webpush from 'web-push';
import { and, eq, inArray } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';

import { db } from '@/lib/db/client';
import { pushSubscriptions } from '@/lib/db/schema/push';
import { profiles } from '@/lib/db/schema/profiles';

/**
 * 서버 측 PWA Push 발송 — VAPID 서명 후 푸시 서비스(FCM/APNS)에 전송.
 *
 * 멱등·정리:
 *  - 410(Gone) / 404 응답 = 구독 무효 → push_subscriptions row 자동 삭제
 *  - 같은 endpoint에 동시 발송 race는 푸시 서비스 측이 흡수
 *  - 카테고리 토글 OFF는 발송 시점에서 필터(profiles 컬럼)
 *
 * 페이로드:
 *  - title, body, url(클릭 시 라우트), tag(SW에서 알림 replace 키), category
 */

let configured = false;
function configure() {
  if (configured) return;
  // 공개키는 클라(구독)와 **반드시 동일**해야 한다 — 단일 출처로 일치 보장: VAPID_PUBLIC_KEY가 없으면
  // 클라가 쓰는 NEXT_PUBLIC_VAPID_PUBLIC_KEY를 그대로 사용(둘이 어긋나 VapidPkHashMismatch 나던 사고 방지).
  const publicKey = process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? 'mailto:help@ganghwa.app';
  if (!publicKey || !privateKey) {
    throw new Error('VAPID keys missing — set NEXT_PUBLIC_VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY');
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  category: 'enhance' | 'raid' | 'supply' | 'profile' | 'referral' | 'melee' | 'chat_mention' | 'admin';
  /**
   * 같은 tag 알림 교체 시 재알림(소리/진동) 여부. 기본 true — 미지정 시 SW가
   * 무음 교체해 "알림이 안 온다"고 느껴지던 문제 방지(2026-06-01). tag가 항상
   * 설정되므로(category fallback) renotify:true는 스펙상 안전.
   */
  renotify?: boolean;
};

export type SendResult = { ok: number; gone: number; failed: number };

/**
 * 카테고리별 토글 컬럼 매핑. supply(일일 보급)·melee(대난투)는 상시 발송이라 미포함 —
 * 토글 컬럼이 없는 카테고리는 게이팅 없이 항상 발송(설정에서도 제외, 2026-06-04).
 */
const TOGGLE_COLUMN: Partial<Record<PushPayload['category'], PgColumn>> = {
  enhance: profiles.pushEnhance,
  raid: profiles.pushRaid,
  profile: profiles.pushProfile,
  referral: profiles.pushReferral,
  chat_mention: profiles.pushChatMention,
};

/**
 * 1유저에게 push 발송. 디바이스 N개 구독 시 전부 발송.
 * 카테고리 토글 OFF면 no-op(0/0/0 반환). 토글 없는 카테고리(supply/melee)는 항상 발송.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<SendResult> {
  configure();
  // 토글 체크 (1 query) — 토글 컬럼 있는 카테고리만.
  const togglesCol = TOGGLE_COLUMN[payload.category];
  if (togglesCol) {
    const [p] = await db
      .select({ enabled: togglesCol })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1);
    if (!p?.enabled) return { ok: 0, gone: 0, failed: 0 };
  }

  const subs = await db
    .select({
      id: pushSubscriptions.id,
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
    })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));

  return await dispatch(subs, payload);
}

/** 여러 유저에게 동시 발송(일일 보급 등). 토글 OFF 유저는 자동 스킵. */
export async function sendPushToUsers(
  userIds: string[],
  payload: PushPayload,
): Promise<SendResult> {
  configure();
  if (userIds.length === 0) return { ok: 0, gone: 0, failed: 0 };
  const togglesCol = TOGGLE_COLUMN[payload.category];

  // 토글 컬럼 있는 카테고리는 ON 유저만 추림. 없는 카테고리(supply/melee)는 전체 대상.
  let targetIds = userIds;
  if (togglesCol) {
    const enabled = await db
      .select({ id: profiles.id })
      .from(profiles)
      .where(and(inArray(profiles.id, userIds), eq(togglesCol, true)));
    if (enabled.length === 0) return { ok: 0, gone: 0, failed: 0 };
    targetIds = enabled.map((e) => e.id);
  }

  const subs = await db
    .select({
      id: pushSubscriptions.id,
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
    })
    .from(pushSubscriptions)
    .where(inArray(pushSubscriptions.userId, targetIds));
  return await dispatch(subs, payload);
}

type SubRow = { id: bigint; endpoint: string; p256dh: string; auth: string };

async function dispatch(subs: SubRow[], payload: PushPayload): Promise<SendResult> {
  if (subs.length === 0) return { ok: 0, gone: 0, failed: 0 };
  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url ?? '/',
    tag: payload.tag ?? payload.category,
    category: payload.category,
    // 기본 재알림 ON — 같은 tag 묶음/연속 이벤트도 무음 교체 대신 실제 알림.
    renotify: payload.renotify ?? true,
  });

  let ok = 0;
  let gone = 0;
  let failed = 0;
  const dead: bigint[] = [];

  // 청크 병렬 발송 — 대난투/레이드 등 대규모 broadcast(수천~1만+ 구독)에 동시 소켓·메모리 폭증과
  // provider rate-limit(429)을 막기 위해 한 번에 CHUNK개씩만 병렬, 청크 간 순차(이벤트루프·FD 보호).
  const CHUNK = 150;
  const sendOne = async (s: (typeof subs)[number]) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        body,
      );
      ok++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      const reason = String((e as { body?: string }).body ?? '');
      // VAPID 키 불일치(403, 또는 Apple 400 VapidPkHashMismatch)는 영구 실패 — 구독을 다른 공개키로
      // 만들었다는 뜻이라 현재 키로는 절대 안 간다. 죽은 것으로 보고 삭제 → 다음 방문 시 재구독해 자가복구.
      const vapidMismatch = status === 403 || (status === 400 && reason.includes('VapidPkHashMismatch'));
      if (status === 404 || status === 410 || vapidMismatch) {
        gone++;
        dead.push(s.id);
        if (vapidMismatch) {
          console.warn('[push] VAPID 키 불일치 — 구독 삭제(재구독 필요)', s.endpoint.slice(0, 40));
        }
      } else {
        failed++;
        console.warn('[push] send failed', s.endpoint.slice(0, 40), status);
      }
    }
  };
  for (let i = 0; i < subs.length; i += CHUNK) {
    await Promise.all(subs.slice(i, i + CHUNK).map(sendOne));
  }

  // 만료/Gone 구독 cleanup
  if (dead.length > 0) {
    await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, dead));
  }

  return { ok, gone, failed };
}
