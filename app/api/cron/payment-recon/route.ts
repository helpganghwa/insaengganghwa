/**
 * 결제 정합성 cron — PAYMENT-SAFETY.md §4. 10분 주기.
 *
 * 우리 DB ↔ PortOne 진실을 대조해 인라인(웹훅)이 놓친 사고를 그물질하고 자동 치유한다.
 *  A. 고아 pending  : 15분+ pending → PG가 PAID면 재지급(자동 치유), 실패면 PAID_NOT_GRANTED
 *  B. 환불 미회수    : 최근 3일 paid → PG가 CANCELLED면 회수 재시도, 실패면 REFUND_RECLAIM_FAILED
 *  D. 미성년 한도    : 본인인증 미성년 × 월 7만원 초과 → MINOR_LIMIT_EXCEEDED
 * heartbeat(S8)는 외부 uptime 모니터가 본 엔드포인트를 감시(자기 죽음은 자가감지 불가).
 *
 * 인증: isCronAuthorized(CRON_SECRET Bearer 또는 x-vercel-cron). 각 주문 PortOne 조회는
 *  개별 try로 격리 — 1건 실패가 전체 run을 막지 않게.
 */
import { and, asc, eq, gt, lt, sql } from 'drizzle-orm';

import { isCronAuthorized } from '@/lib/auth/cron-auth';
import { db } from '@/lib/db/client';
import { iapOrders, monthlyPurchaseLimits, identityVerifications } from '@/lib/db/schema/payment';
import { getPortonePayment } from '@/lib/payment/portone';
import { completePurchase } from '@/lib/payment/purchase';
import { refundPurchase } from '@/lib/payment/refund';
import { raisePaymentAlert } from '@/lib/payment/alert';
import { kstMonthString } from '@/lib/kst';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ORPHAN_PENDING_LIMIT = 50;
const REFUND_SCAN_LIMIT = 50;

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return new Response('forbidden', { status: 403 });

  const out: Record<string, unknown> = {};

  // ── A. 고아 pending 복구 ────────────────────────────────────────────────
  const pending = await db
    .select({ id: iapOrders.id, pid: iapOrders.portoneOrderId })
    .from(iapOrders)
    .where(and(eq(iapOrders.status, 'pending'), lt(iapOrders.createdAt, sql`now() - interval '15 minutes'`)))
    // 오래된 것 우선(asc) — 최신순이면 백로그가 limit을 넘는 동안 가장 오래된(가장 위험한)
    // 주문이 영원히 스캔 밖에 남는 기아 발생(감사 M-4).
    .orderBy(asc(iapOrders.createdAt))
    .limit(ORPHAN_PENDING_LIMIT);
  let healed = 0;
  let stillPending = 0;
  for (const o of pending) {
    try {
      const pay = await getPortonePayment(o.pid);
      if (pay.status === 'PAID') {
        const r = await completePurchase(o.pid);
        if (r.ok) healed++;
        else
          await raisePaymentAlert('PAID_NOT_GRANTED', {
            paymentId: o.pid,
            orderId: o.id,
            detail: `PG는 PAID인데 재지급 실패(code=${r.code}). 즉시 수동 확인 필요.`,
          });
      } else {
        stillPending++; // PG도 미결제 — 이탈한 주문(정상). 기록만.
      }
    } catch (e) {
      console.error('[payment-recon] A pending check failed', o.pid, e);
    }
  }
  out.orphanPending = { scanned: pending.length, healed, stillPending, capped: pending.length === ORPHAN_PENDING_LIMIT };

  // ── B. 환불 미회수 백스톱(최근 3일 paid) ──────────────────────────────────
  const recentPaid = await db
    .select({ id: iapOrders.id, pid: iapOrders.portoneOrderId })
    .from(iapOrders)
    .where(and(eq(iapOrders.status, 'paid'), gt(iapOrders.paidAt, sql`now() - interval '3 days'`)))
    // 오래된 것 우선(asc) — 환불 미회수가 가장 오래 방치된 주문부터(기아 방지, 감사 M-4).
    .orderBy(asc(iapOrders.paidAt))
    .limit(REFUND_SCAN_LIMIT);
  let reclaimed = 0;
  for (const o of recentPaid) {
    try {
      const pay = await getPortonePayment(o.pid);
      if (pay.status === 'CANCELLED') {
        const r = await refundPurchase(o.pid);
        if (r.ok) reclaimed++;
        else
          await raisePaymentAlert('REFUND_RECLAIM_FAILED', {
            paymentId: o.pid,
            orderId: o.id,
            detail: `PG는 CANCELLED인데 회수 실패(code=${r.code}). 환불받고 재화 유지 위험 — 수동 회수 필요.`,
          });
      }
    } catch (e) {
      console.error('[payment-recon] B refund check failed', o.pid, e);
    }
  }
  out.refundBackstop = { scanned: recentPaid.length, reclaimed, capped: recentPaid.length === REFUND_SCAN_LIMIT };
  // 캡 도달 = 미스캔 주문이 존재할 수 있는 상태 — 응답 JSON에만 남기지 않고 알림(중복은 미해결 1회 게이트).
  if (pending.length === ORPHAN_PENDING_LIMIT || recentPaid.length === REFUND_SCAN_LIMIT) {
    await raisePaymentAlert('RECON_SCAN_CAPPED', {
      paymentId: 'recon:scan-capped',
      detail: `recon 스캔 캡 도달(pending ${pending.length}/${ORPHAN_PENDING_LIMIT}, paid ${recentPaid.length}/${REFUND_SCAN_LIMIT}) — 백로그가 limit을 넘음. asc 정렬이라 다음 주기에 이어지지만 규모 확인 필요.`,
    });
  }

  // ── D. 미성년 월 한도 초과(본인인증 연동 후 실효) ──────────────────────────
  const month = kstMonthString();
  const minorOver = await db
    .select({ userId: monthlyPurchaseLimits.userId, total: monthlyPurchaseLimits.totalKrw })
    .from(monthlyPurchaseLimits)
    .innerJoin(identityVerifications, eq(identityVerifications.userId, monthlyPurchaseLimits.userId))
    .where(
      and(
        eq(monthlyPurchaseLimits.kstMonth, month),
        eq(identityVerifications.isAdult, false),
        gt(monthlyPurchaseLimits.totalKrw, sql`70000`),
      ),
    );
  for (const m of minorOver) {
    await raisePaymentAlert('MINOR_LIMIT_EXCEEDED', {
      paymentId: `minor:${m.userId}:${month}`,
      detail: `미성년 계정 월 결제 ₩${Number(m.total).toLocaleString('ko-KR')} (한도 7만원 초과). 초과분 환불 검토.`,
    });
  }
  out.minorLimit = { over: minorOver.length };

  return Response.json({ ok: true, ...out });
}
