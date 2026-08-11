import 'server-only';

import { eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { profiles } from '@/lib/db/schema/profiles';
import { sendPushToUsers } from '@/lib/push/send';
import { isTestRun, postAlertWebhook } from '@/lib/ops/alert-webhook';

/**
 * 운영 알림 — 결제 외 운영 사고(크론 정지 등)를 어드민에게 즉시 통지.
 * 채널: 어드민 앱푸시(category 'admin'=토글 무관) + 선택 웹훅(PAYMENT_ALERT_WEBHOOK_URL 재사용).
 * 둘 다 best-effort. raisePaymentAlert의 결제 전용 스키마(payment_alerts)와 달리 DB 기록 없이
 * 즉시 채널만 — 크론 정지는 상태(cron_heartbeats)로 이미 영속되므로 별도 알림 로그 불필요.
 */
export async function raiseOpsAlert(title: string, detail: string): Promise<void> {
  // 테스트 실행은 채널로 내보내지 않는다(2026-08-11) — 결제 경보와 같은 이유(isTestRun 주석 참조).
  if (isTestRun()) return;
  await Promise.allSettled([notifyAdmins(title, detail), notifyWebhook(title, detail)]);
}

async function notifyAdmins(title: string, detail: string): Promise<void> {
  try {
    const admins = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.isAdmin, true));
    if (admins.length === 0) return;
    await sendPushToUsers(
      admins.map((a) => a.id),
      { title: `🛠 ${title}`, body: detail, url: '/admin', tag: 'ops-alert', category: 'admin' },
    );
  } catch (e) {
    console.error('[ops-alert] admin push failed', e);
  }
}

async function notifyWebhook(title: string, detail: string): Promise<void> {
  // 운영 경보는 심각도 구분이 없다 — 현재 유일한 발화가 크론 정지이고, 그건 항상 조치 대상이다
  // (payment-recon이 멈추면 결제 백스톱 자체가 죽는다). 그래서 언제나 멘션한다.
  await postAlertWebhook(`🛠 **운영 알림** ${title}\n${detail}`, { mention: true });
}
