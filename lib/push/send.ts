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
  /**
   * guild = 길드 운영 알림(가입 신청 접수 · 승인/거절, 2026-07-30). 토글 컬럼 없음 = 상시 발송 —
   * 신청을 처리할 수 있는 사람에게만 보내고 건수도 적어 소음이 되지 않는다.
   */
  category:
    | 'enhance'
    | 'raid'
    | 'supply'
    | 'profile'
    | 'referral'
    | 'melee'
    | 'chat_mention'
    | 'guild'
    | 'admin';
  /**
   * 같은 tag 알림 교체 시 재알림(소리/진동) 여부. 기본 true — 미지정 시 SW가
   * 무음 교체해 "알림이 안 온다"고 느껴지던 문제 방지(2026-06-01). tag가 항상
   * 설정되므로(category fallback) renotify:true는 스펙상 안전.
   */
  renotify?: boolean;
};

export type SendResult = { ok: number; gone: number; failed: number };

/**
 * SERVER.md 경계규칙 1 헬퍼 — 발송 라이브러리는 serverId를 받지 않으므로(범용 유지),
 * 서버 귀속 이벤트의 호출부가 이 필터를 거친 뒤 send를 부른다.
 * 유저 노출 텍스트에 서버 표기는 하지 않는다(운영자 화면에서만 서버 구분 — 2026-08-07 결정).
 *
 * 이벤트 서버가 활성 서버(last_server_id)인 유저만 남긴다 — 타 서버 접속 중 오알림 억제.
 */
export async function filterByActiveServer(
  userIds: string[],
  serverId: number,
): Promise<string[]> {
  if (userIds.length === 0) return [];
  const rows = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(and(inArray(profiles.id, userIds), eq(profiles.lastServerId, serverId)));
  return rows.map((r) => r.id);
}

/**
 * 카테고리별 토글 컬럼 매핑. supply(일일 보급)·melee(대난투)·guild(길드 운영)는 상시 발송이라 미포함 —
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
 *
 * skipToggleCheck: 호출부가 **같은 요청 안에서 방금** 토글을 검증한 경우에만 true —
 * 강화 준비 cron의 클레임 SQL이 push_enhance=true를 조인 조건으로 이미 확인한 경로.
 * 검증과 발송 사이에 시간 간격이 있는 경로(push-flush의 묶음 윈도 등)에서는 쓰면 안 된다.
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
  opts?: { skipToggleCheck?: boolean },
): Promise<SendResult> {
  configure();
  // 토글 체크 (1 query) — 토글 컬럼 있는 카테고리만.
  const togglesCol = TOGGLE_COLUMN[payload.category];
  if (togglesCol && !opts?.skipToggleCheck) {
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

  // ⚠ 대상 조회는 **1000개씩 청크**한다 — 대난투/일일보급처럼 서버 전원에게 보내는 경로에서
  // userIds가 곧 바인드 파라미터 수가 되어, Postgres 상한(65,535)에서 하드 실패하고 그 전에도
  // 만 단위부터 급격히 느려진다. 발송 자체는 아래 dispatch가 이미 150개씩 청크 병렬로 처리한다.
  const IN_CHUNK = 1000;

  // 토글 컬럼 있는 카테고리는 ON 유저만 추림. 없는 카테고리(supply/melee)는 전체 대상.
  let targetIds = userIds;
  if (togglesCol) {
    const enabled: string[] = [];
    for (let i = 0; i < userIds.length; i += IN_CHUNK) {
      const rows = await db
        .select({ id: profiles.id })
        .from(profiles)
        .where(and(inArray(profiles.id, userIds.slice(i, i + IN_CHUNK)), eq(togglesCol, true)));
      for (const r of rows) enabled.push(r.id);
    }
    if (enabled.length === 0) return { ok: 0, gone: 0, failed: 0 };
    targetIds = enabled;
  }

  const subs: SubRow[] = [];
  for (let i = 0; i < targetIds.length; i += IN_CHUNK) {
    const rows = await db
      .select({
        id: pushSubscriptions.id,
        endpoint: pushSubscriptions.endpoint,
        p256dh: pushSubscriptions.p256dh,
        auth: pushSubscriptions.auth,
      })
      .from(pushSubscriptions)
      .where(inArray(pushSubscriptions.userId, targetIds.slice(i, i + IN_CHUNK)));
    for (const r of rows) subs.push(r);
  }
  return await dispatch(subs, payload);
}

type SubRow = { id: bigint; endpoint: string; p256dh: string; auth: string };
export type PushSubscriptionRow = SubRow;

/**
 * 토글 ON 유저의 구독을 일괄 선조회 — push-flush처럼 유저별 본문이 달라 broadcast
 * (sendPushToUsers)를 못 쓰는 경로용. 유저당 2쿼리(토글+구독) N+1을 배치당 2쿼리로 줄인다.
 * 토글 OFF·무구독 유저는 맵에서 빠진다(호출부는 get() ?? []로 no-op 처리).
 */
export async function getEnabledPushSubscriptions(
  userIds: string[],
  category: PushPayload['category'],
): Promise<Map<string, SubRow[]>> {
  const byUser = new Map<string, SubRow[]>();
  if (userIds.length === 0) return byUser;
  const IN_CHUNK = 1000; // 바인드 파라미터 상한 보호(sendPushToUsers와 동일 규칙)

  const togglesCol = TOGGLE_COLUMN[category];
  let targetIds = userIds;
  if (togglesCol) {
    const enabled: string[] = [];
    for (let i = 0; i < userIds.length; i += IN_CHUNK) {
      const rows = await db
        .select({ id: profiles.id })
        .from(profiles)
        .where(and(inArray(profiles.id, userIds.slice(i, i + IN_CHUNK)), eq(togglesCol, true)));
      for (const r of rows) enabled.push(r.id);
    }
    if (enabled.length === 0) return byUser;
    targetIds = enabled;
  }

  for (let i = 0; i < targetIds.length; i += IN_CHUNK) {
    const rows = await db
      .select({
        userId: pushSubscriptions.userId,
        id: pushSubscriptions.id,
        endpoint: pushSubscriptions.endpoint,
        p256dh: pushSubscriptions.p256dh,
        auth: pushSubscriptions.auth,
      })
      .from(pushSubscriptions)
      .where(inArray(pushSubscriptions.userId, targetIds.slice(i, i + IN_CHUNK)));
    for (const { userId, ...sub } of rows) {
      if (!userId) continue; // 스키마상 nullable(비로그인 구독)이나 IN 필터상 도달 불가 — 타입 가드
      const list = byUser.get(userId);
      if (list) list.push(sub);
      else byUser.set(userId, [sub]);
    }
  }
  return byUser;
}

/**
 * 사전 조회된 구독으로 발송만 수행 — getEnabledPushSubscriptions와 짝. 토글 검증은
 * 선조회가 끝냈다는 전제이므로 다른 경로에서 단독으로 쓰면 안 된다(게이팅 우회).
 */
export async function sendPushToSubscriptions(
  subs: SubRow[],
  payload: PushPayload,
): Promise<SendResult> {
  configure();
  return dispatch(subs, payload);
}

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
