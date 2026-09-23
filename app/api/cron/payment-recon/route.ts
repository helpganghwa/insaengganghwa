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
import { and, asc, eq, gt, inArray, lt, sql } from 'drizzle-orm';

import { isCronAuthorized } from '@/lib/auth/cron-auth';
import { db } from '@/lib/db/client';
import { iapOrders, monthlyPurchaseLimits, identityVerifications } from '@/lib/db/schema/payment';
import { cancelPortonePayment, getPortonePayment, PortonePaymentNotFoundError } from '@/lib/payment/portone';
import { completePurchase } from '@/lib/payment/purchase';
import { refundPurchase } from '@/lib/payment/refund';
import { retryGrantSkippedRefund } from '@/lib/payment/grant-skipped-refund';
import { raisePaymentAlert } from '@/lib/payment/alert';
import { kstMonthString } from '@/lib/kst';
import { beatCron } from '@/lib/cron/heartbeat';

/** 지급 보류 자동 환불(C단계)의 적용 시작. 이 시각 전 30일간 프로덕션 지급 보류 주문은 0건이었다(2026-09-24 조회) —
 *  배포보다 앞서 두어 배포 직후 빈 구간이 없게 한다(늦게 두면 그 사이 함수가 죽은 지급 보류 결제가 경보 없이 남는다).
 *  ⚠ 이 시각부터 배포까지는 옛 코드(중복=운영자 수동 처리)가 돈다 — 배포 직전 이 시각 이후 지급 보류 주문이 0건인지
 *  다시 조회하고, 있으면 운영자 처리 방식을 확인해 이 값을 배포 시각으로 올린다(docs/PLAYSTORE.md 배포 순서). */
const GRANT_SKIPPED_AUTO_REFUND_SINCE = '2026-09-24T00:00:00+09:00';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// B 스캔 최대 200건 × 포트원 순차 조회(평시 수백 ms, 건당 타임아웃 8s)라 60s로는 부족할 수 있다.
export const maxDuration = 300;

const ORPHAN_PENDING_LIMIT = 50;
/** 한 주기에 이만큼 만료되면 **경보 후보**. 확정은 아래 '성공 대조'까지 통과해야 한다(평시엔 0~1건). */
const ORPHAN_PENDING_ALERT = 5;
/**
 * 성공 대조 창(2026-09-13) — 이 시간 안에 **성사된 결제가 하나라도 있으면 경로는 살아 있다**.
 *
 * 왜 사유 조회로 못 가르는가: 이 경보가 잡으려던 09-11~12 장애(16시간·19건)에서도 포트원 조회는
 * 404였다 — 앱으로 잘못 라우팅돼 PG에 결제 시도 자체가 없었기 때문이다. 그러니 404·취소 사유를
 * 이탈로 치면 **정작 잡아야 할 사고를 놓친다**. 반대로 한 유저가 결제창을 스무 번 여닫아도
 * 만료는 쌓인다(09-11~12 대장장이wo2y expired 20여 건). 두 경우를 가르는 것은 사유가 아니라
 * **"그동안 아무도 결제에 성공하지 못했는가"**다 — 장애 기간의 결제 성공은 0건이었고,
 * 반복 이탈 유저가 있던 날에는 다른 유저들이 정상 결제했다(실측).
 */
const ORPHAN_SUCCESS_WINDOW_MS = 6 * 60 * 60 * 1000;

/** 경보 dedup 키용 KST 시간 버킷 — 건별 경보는 소음이라 시간당 1회로 묶는다. */
function kstHourKey(): string {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 13);
}
// 50 → 200(2026-08-24) → 600(2026-08-26): 3일 paid가 200을 넘어 캡 상시 도달 — 캡에 걸리면
// 최신 결제의 환불 백스톱이 밀린다(asc 기아 방지 정렬의 대가). 600 = 하루 200건 × 3일,
// 건당 ~0.3s 순차 조회라 캡까지 가도 ~3분(maxDuration 300s 안).
const REFUND_SCAN_LIMIT = 600;
/** 장기 환불 스윕 1회 분량 — 04시대 6회 × 300 = 1,800건(30일 포트원 paid 규모 1,100건대). */
const LONG_SWEEP_BATCH = 300;
// 이탈 pending 종결 기준 — 카드 단독 구성(가상계좌 미사용)이라 결제창 세션은 길어야 수십 분.
// 6h면 충분히 보수적이면서 어드민 결제내역에 죽은 '대기'가 하루 종일 쌓이지 않는다(2026-07-31).
const PENDING_EXPIRE_MS = 6 * 60 * 60 * 1000;

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return new Response('forbidden', { status: 403 });

  const out: Record<string, unknown> = {};
  // 마감 시각 — 포트원 조회가 느려도(건당 최대 8초) maxDuration 300초 안에 D·하트비트까지 끝내도록 루프를 끊는다.
  const deadline = Date.now() + 240_000;
  const timeUp = () => Date.now() > deadline;

  // ── A0. Play 이탈 pending 일괄 만료 ────────────────────────────────────
  // Play 주문은 PG 조회가 없어 만료만 하면 된다. 건별 스캔(limit 50)에 태우면 결제 시트가 바로 닫히는
  // 환경의 반복 탭(2026-09-22: 유저 3명 47건, 전부 6h 내)이 스캔을 점유해 포트원 주문이 기아·캡 경보가
  // 울린다. 만료 뒤 늦은 검증은 completePurchase가 expired→paid를 허용해 지급 유실 없음.
  const playExpired = await db
    .update(iapOrders)
    .set({ status: 'expired' })
    .where(
      // 기준은 마지막 결제 시도 시각(0215, 없으면 생성 시각) — 재사용 주문은 생성이 6시간 전이어도 방금 결제창을 열었을 수 있다.
      and(
        eq(iapOrders.status, 'pending'),
        eq(iapOrders.provider, 'play'),
        // ⚠ sql 식과 비교할 땐 Date를 그대로 넘기면 드라이버가 인코딩하지 못한다(테스트에서 발각) — ISO 문자열 + 캐스트.
        lt(sql`coalesce(${iapOrders.playCheckoutAt}, ${iapOrders.createdAt})`, sql`${new Date(Date.now() - PENDING_EXPIRE_MS).toISOString()}::timestamptz`),
      ),
    )
    .returning({ userId: iapOrders.userId });
  out.playExpired = playExpired.length;

  // ── A. 고아 pending 복구(포트원) ────────────────────────────────────────
  const pending = await db
    .select({
      id: iapOrders.id,
      pid: iapOrders.portoneOrderId,
      createdAt: iapOrders.createdAt,
      provider: iapOrders.provider,
      userId: iapOrders.userId,
    })
    .from(iapOrders)
    .where(and(eq(iapOrders.status, 'pending'), eq(iapOrders.provider, 'portone'), lt(iapOrders.createdAt, sql`now() - interval '15 minutes'`)))
    // 오래된 것 우선(asc) — 최신순이면 백로그가 limit을 넘는 동안 가장 오래된(가장 위험한)
    // 주문이 영원히 스캔 밖에 남는 기아 발생(감사 M-4).
    .orderBy(asc(iapOrders.createdAt))
    .limit(ORPHAN_PENDING_LIMIT);
  let healed = 0;
  let stillPending = 0;
  let expired = playExpired.length; // Play 일괄 만료분 포함 — 경로 장애 판정(아래)은 결제 성공 대조가 가른다.
  /** 만료된 주문의 주인들 — 한 사람의 반복 이탈인지, 여러 사람이 겪는 일인지 가른다. */
  const expiredUsers = new Set<string>(playExpired.map((r) => r.userId));
  /** A단계에서 포트원 조회가 실패한 건수 — 전건 실패면 beat를 찍지 않는다. */
  let aErrors = 0;
  // 이탈 pending 종결(0108) — 종결 없이는 죽은 주문이 이 스캔(limit 50)을 영구 점유해 진짜
  // 유실 주문이 기아. 방금 PG 미결제를 확인한 주문만, 조건부(pending)로 전이해 웹훅과 경합해도
  // 안전. 만료 후 늦은 결제는 completePurchase가 expired→paid를 허용해 지급 유실 없음.
  const expireIfStale = async (o: (typeof pending)[number]) => {
    if (o.createdAt.getTime() >= Date.now() - PENDING_EXPIRE_MS) {
      stillPending++; // PG도 미결제 — 이탈한 주문(6h 내, 정상). 기록만.
      return;
    }
    await db
      .update(iapOrders)
      .set({ status: 'expired' })
      .where(and(eq(iapOrders.id, o.id), eq(iapOrders.status, 'pending')));
    expired++;
    expiredUsers.add(o.userId);
  };
  for (const o of pending) {
    if (timeUp()) break;
    let paidAtPg = false;
    try {
      const pay = await getPortonePayment(o.pid);
      if (pay.status === 'PAID') {
        paidAtPg = true;
        const r = await completePurchase(o.pid);
        if (r.ok) healed++;
        // 환불 확정·지급 보류(중복·미성년, 각자 자동 환불·경보)는 지급 실패가 아니다(경합에서 진 경우 포함).
        else if (r.code === 'REFUNDED' || r.code === 'DUPLICATE' || r.code === 'NOT_GRANTED' || r.code === 'MINOR_LIMIT') continue;
        else
          await raisePaymentAlert('PAID_NOT_GRANTED', {
            paymentId: o.pid,
            orderId: o.id,
            detail: `PG는 PAID인데 재지급 실패(code=${r.code}). 즉시 수동 확인 필요.`,
          });
      } else {
        await expireIfStale(o);
      }
    } catch (e) {
      // 404 = 결제창만 열고 PG 결제 시도가 없던 주문 — "미결제 확정"이라 만료 대상.
      // (2026-08-26 발견: 일반 throw로 묶여 있어 이런 pending이 영구 잔류했다.)
      if (e instanceof PortonePaymentNotFoundError) {
        await expireIfStale(o).catch((e2) => console.error('[payment-recon] A expire failed', o.pid, e2));
        continue;
      }
      console.error('[payment-recon] A pending check failed', o.pid, e);
      aErrors += 1;
      // PG는 PAID인데 지급 처리가 예외로 끝났다 — 콘솔 로그만으론 아무도 모른다(2026-09-24 감사).
      if (paidAtPg) {
        await raisePaymentAlert('PAID_NOT_GRANTED', {
          paymentId: o.pid,
          orderId: o.id,
          detail: `PG는 PAID인데 지급 처리 중 예외 — ${(e as Error)?.message ?? e}. 즉시 수동 확인 필요.`,
        }).catch(() => undefined);
      }
    }
  }
  out.orphanPending = {
    scanned: pending.length,
    healed,
    stillPending,
    expired,
    users: expiredUsers.size,
    capped: pending.length === ORPHAN_PENDING_LIMIT,
  };

  // 결제가 통째로 실패하고 있어도 아무도 모르던 문제(2026-09-11~12, 16시간·19건)의 감지선.
  // 만료로 정리된 고아 pending이 한 주기에 몰리면 결제 경로 자체가 깨진 신호다. 건별로 울리면
  // 소음이라 KST 시간 버킷으로 묶어 시간당 1회만 울린다.
  if (expired >= ORPHAN_PENDING_ALERT) {
    // 성공 대조 — 최근에 성사된 결제가 하나라도 있으면 경로는 살아 있다(위 상수 주석 참조).
    const [ok] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(iapOrders)
      .where(and(eq(iapOrders.status, 'paid'), gt(iapOrders.paidAt, new Date(Date.now() - ORPHAN_SUCCESS_WINDOW_MS))));
    const paidRecently = Number(ok?.n ?? 0);
    out.orphanPendingAlert = { expired, users: expiredUsers.size, paidRecently };
    if (paidRecently > 0) {
      // 누군가는 결제에 성공하고 있다 — 경로 장애가 아니라 이탈이 몰린 것. 기록도 남기지 않는다
      // (어드민 경보 목록은 '진짜 결제 오류'만 담는다, 사용자 확정 2026-09-13).
      console.info(
        `[payment-recon] 고아 pending ${expired}건 만료(유저 ${expiredUsers.size}명) — 최근 ${
          ORPHAN_SUCCESS_WINDOW_MS / 3_600_000
        }시간 결제 성공 ${paidRecently}건이라 경로 정상, 경보 없음`,
      );
    } else {
      await raisePaymentAlert('ORPHAN_PENDING', {
        paymentId: `orphan:${kstHourKey()}`,
        detail: `고아 pending ${expired}건 만료(유저 ${expiredUsers.size}명, 스캔 ${pending.length}건)인데 최근 ${
          ORPHAN_SUCCESS_WINDOW_MS / 3_600_000
        }시간 **결제 성공 0건**. 결제 경로가 끊겼을 가능성 — 결제창이 열리지 않거나 결제 후 검증이 도달하지 못하는 상태일 수 있다.`,
      });
    }
  }

  // ── B. 환불 미회수 백스톱(최근 3일 paid) ──────────────────────────────────
  const recentPaid = await db
    .select({ id: iapOrders.id, pid: iapOrders.portoneOrderId })
    .from(iapOrders)
    // Play 주문(provider='play')은 포트원에 없어 getPortonePayment가 404를 내며 10분마다 오류 로그를 남겼다(2026-09-22~23,
    // 3건 반복). Play 환불 회수는 play-sync의 voidedpurchases 경로가 맡는다.
    .where(and(eq(iapOrders.status, 'paid'), eq(iapOrders.provider, 'portone'), gt(iapOrders.paidAt, sql`now() - interval '3 days'`)))
    // 오래된 것 우선(asc) — 환불 미회수가 가장 오래 방치된 주문부터(기아 방지, 감사 M-4).
    .orderBy(asc(iapOrders.paidAt))
    .limit(REFUND_SCAN_LIMIT);
  let reclaimed = 0;
  for (const o of recentPaid) {
    if (timeUp()) break;
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

  // ── B2. 장기 환불 스윕(3~30일 전 paid, 매일 KST 04시대) ─────────────────────────
  // 결제 3일 뒤 콘솔·카드사 취소에서 웹훅 재시도가 모두 실패하면 B(3일 창)가 못 잡아 영구 미회수였다(2026-09-24 감사).
  // 04:00~04:59의 6회 실행이 300건씩 나눠 본다(오프셋 = 그 시간 안의 실행 순번). 건당 ~0.3s라 한 회 ~90초.
  const nowUtc = new Date();
  const longSweep = { scanned: 0, reclaimed: 0 };
  if (nowUtc.getUTCHours() === (4 + 24 - 9) % 24) {
    const slot = Math.floor(nowUtc.getUTCMinutes() / 10);
    const older = await db
      .select({ id: iapOrders.id, pid: iapOrders.portoneOrderId })
      .from(iapOrders)
      .where(
        and(
          eq(iapOrders.status, 'paid'),
          eq(iapOrders.provider, 'portone'),
          gt(iapOrders.paidAt, sql`now() - interval '30 days'`),
          lt(iapOrders.paidAt, sql`now() - interval '3 days'`),
        ),
      )
      .orderBy(asc(iapOrders.paidAt))
      .offset(slot * LONG_SWEEP_BATCH)
      .limit(LONG_SWEEP_BATCH);
    for (const o of older) {
      if (timeUp()) break;
      longSweep.scanned++;
      try {
        const pay = await getPortonePayment(o.pid);
        if (pay.status === 'CANCELLED') {
          const r = await refundPurchase(o.pid);
          if (r.ok) longSweep.reclaimed++;
          else
            await raisePaymentAlert('REFUND_RECLAIM_FAILED', {
              paymentId: o.pid,
              orderId: o.id,
              detail: `PG는 CANCELLED인데 회수 실패(code=${r.code}, 장기 스윕). 수동 회수 필요.`,
            });
        }
      } catch (e) {
        console.error('[payment-recon] B2 long sweep failed', o.pid, e);
      }
    }
  }
  out.refundLongSweep = longSweep;

  // ── C. 지급 보류(중복·미성년) 결제 환불 마감 ─────────────────────────────
  // 지급 보류로 paid가 된 뒤 자동 환불 전에 함수가 죽으면(타임아웃·인스턴스 종료) 청구·미지급·미환불로 남는다.
  // 포트원은 다른 안전망이 없고, Play도 '미확인 구매는 3일 뒤 구글 자동 환불'이 TWA 흐름에서 실측되지 않았다.
  // 그래서 둘 다 30분 지난 건을 다시 환불한다(Play는 구글 환불 API 성공 직후 환불 확정으로 마감).
  // ⚠ 하한(GRANT_SKIPPED_AUTO_REFUND_SINCE): 그 전 코드는 중복 결제를 운영자가 수동 처리했다 — 이미 다른 보상으로
  // 처리한 옛 주문을 배포 직후 자동 취소하면 보상과 환불을 둘 다 받는다. 옛 건은 경보·수동 처리로 남긴다.
  const skipped = await db
    .select({ id: iapOrders.id, pid: iapOrders.portoneOrderId, provider: iapOrders.provider, playOrderId: iapOrders.playOrderId })
    .from(iapOrders)
    .where(
      and(
        eq(iapOrders.status, 'paid'),
        // 제공자를 명시 — 다른 결제 수단(예: Apple)이 합쳐져도 포트원 경로로 흘러가지 않게.
        inArray(iapOrders.provider, ['portone', 'play']),
        eq(iapOrders.grantSkipped, true),
        lt(iapOrders.paidAt, sql`now() - interval '30 minutes'`),
        gt(iapOrders.paidAt, sql`now() - interval '30 days'`),
        gt(iapOrders.paidAt, sql`${GRANT_SKIPPED_AUTO_REFUND_SINCE}::timestamptz`),
      ),
    )
    .orderBy(asc(iapOrders.paidAt))
    .limit(20);
  const skippedOut = { scanned: 0, refunded: 0 };
  for (const o of skipped) {
    if (timeUp()) break;
    skippedOut.scanned++;
    if (await retryGrantSkippedRefund(o)) skippedOut.refunded++;
  }
  out.grantSkippedRefund = skippedOut;
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

  // ⚠ beat는 **성공했을 때만**. 종전엔 무조건 찍어, 포트원 조회가 전건 실패해도(키 만료·장애)
  // dead-man이 초록으로 남았다 — 하필 '결제 백스톱(최중요)'에서(2026-09-12 검수).
  const aAllFailed = pending.length > 0 && aErrors === pending.length;
  if (!aAllFailed) await beatCron('payment-recon');
  return Response.json({ ok: true, ...out, aErrors });
}
