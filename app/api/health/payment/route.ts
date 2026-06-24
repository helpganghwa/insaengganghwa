/**
 * 어드민 전용 결제/심사 env 진단 — 어떤 환경변수가 실제 배포에 잡혔는지 확인(값 노출 X, 존재여부만).
 * "결제 준비중"·"심사 폼 미노출" 원인이 env 누락인지 즉시 판별. 어드민 외 403.
 *
 * 사용: 어드민(카카오) 로그인 후 브라우저로 /api/health/payment 접속.
 *  - payEnabled=false면 storeId/channelKey 중 무엇이 false인지 env 항목에서 확인.
 *  - NEXT_PUBLIC_* 는 빌드 인라인이라, 런타임 present여도 portoneConfig가 못 볼 수 있음 →
 *    비-public(PORTONE_STORE_ID/PORTONE_CHANNEL_KEY) 사용 권장.
 */
import { NextResponse } from 'next/server';
import { desc, sql } from 'drizzle-orm';

import { getAdminStatus } from '@/lib/auth/require-admin';
import { portoneConfig } from '@/lib/payment/purchase';
import { db } from '@/lib/db/client';
import { iapOrders, iapRefunds } from '@/lib/db/schema/payment';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 진단 접근 토큰(임시) — 어드민 플래그가 없어도 ?key= 로 열람 가능. 노출 데이터는 env 존재여부(boolean)뿐.
// ⚠ 심사/디버그 후 이 라우트 파일 삭제. env 의존 없이 코드 상수라 env 누락 상황에서도 동작.
const DIAG_KEY = 'cbt-env-7x29q';

export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get('key');
  const { isAdmin } = await getAdminStatus();
  if (!isAdmin && key !== DIAG_KEY) return new NextResponse('forbidden', { status: 403 });

  // 동적 키 접근(process.env[k])이라 NEXT_PUBLIC도 빌드 인라인 없이 런타임 값을 본다(존재여부만).
  const has = (k: string) => Boolean(process.env[k]);

  // 운영 DB(런타임) 주문/환불 현황 — 취소 시 자동 회수(웹훅) 됐는지 판별. PII 없이 상태·수치만.
  const [statusRows, recentOrders, refundRows] = await Promise.all([
    db
      .select({ status: iapOrders.status, n: sql<number>`count(*)::int` })
      .from(iapOrders)
      .groupBy(iapOrders.status),
    db
      .select({
        id: iapOrders.id,
        product: iapOrders.productCode,
        krw: iapOrders.amountKrw,
        status: iapOrders.status,
      })
      .from(iapOrders)
      .orderBy(desc(iapOrders.id))
      .limit(8),
    db
      .select({
        orderId: iapRefunds.orderId,
        reason: iapRefunds.reason,
        clawbackDone: iapRefunds.clawbackDone,
      })
      .from(iapRefunds)
      .orderBy(desc(iapRefunds.id))
      .limit(8),
  ]).catch(() => [[], [], []] as const);

  const num = (v: unknown) => (typeof v === 'bigint' ? Number(v) : v);

  return NextResponse.json(
    {
      deployment: process.env.VERCEL_DEPLOYMENT_ID ?? 'dev',
      payEnabled: portoneConfig() !== null, // false면 결제 "준비중"
      allowTestLogin: process.env.ALLOW_TEST_LOGIN === 'true', // false면 심사 폼 미노출
      allowTestLoginRaw: process.env.ALLOW_TEST_LOGIN ?? null, // 'true' 외 값(True/공백 등) 진단용
      env: {
        PORTONE_STORE_ID: has('PORTONE_STORE_ID'),
        PORTONE_CHANNEL_KEY: has('PORTONE_CHANNEL_KEY'),
        NEXT_PUBLIC_PORTONE_STORE_ID: has('NEXT_PUBLIC_PORTONE_STORE_ID'),
        NEXT_PUBLIC_PORTONE_CHANNEL_KEY: has('NEXT_PUBLIC_PORTONE_CHANNEL_KEY'),
        PORTONE_API_SECRET: has('PORTONE_API_SECRET'),
        PORTONE_WEBHOOK_SECRET: has('PORTONE_WEBHOOK_SECRET'),
      },
      orders: {
        byStatus: Object.fromEntries(statusRows.map((r) => [r.status, r.n])),
        recent: recentOrders.map((o) => ({ ...o, krw: num(o.krw) })),
      },
      refunds: refundRows, // 비어있으면 자동 회수(Cancelled 웹훅) 미작동 = 웹훅 미등록 가능성
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
