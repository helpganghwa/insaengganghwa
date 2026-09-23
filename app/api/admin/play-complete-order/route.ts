import { eq } from 'drizzle-orm';

import { getAdminStatus } from '@/lib/auth/require-admin';
import { db } from '@/lib/db/client';
import { iapOrders } from '@/lib/db/schema/payment';
import { adminActions } from '@/lib/db/schema/ops';
import { getPlayOrder, PlayApiError } from '@/lib/payment/play-api';
import { completePurchase } from '@/lib/payment/purchase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Play 주문 수동 마무리(2026-09-24) — 구글은 청구했는데 결제창 결과가 화면에 돌아오지 못해 서버에 토큰이 없는
 * 주문을 끝낸다. 구글 주문번호(GPA.…)로 orders.get → 구매 토큰 → completePurchase(구글 재검증·지급·소모).
 * 소모가 곧 확인이라 3일 자동 환불도 막힌다. 멱등: 이미 paid면 already.
 *
 * 사용(어드민으로 로그인한 탭의 콘솔):
 *   await fetch('/api/admin/play-complete-order',{method:'POST',headers:{'content-type':'application/json'},
 *     body:JSON.stringify({orderId:'GPA.…',paymentId:'gp-…',dryRun:true})}).then(r=>r.json())
 * dryRun이면 구글 주문과 우리 주문을 대조만 한다. 상품이 다르거나 토큰이 다른 주문에 묶여 있으면 거부.
 */
export async function POST(req: Request) {
  const { isAdmin, userId: adminId } = await getAdminStatus().catch(() => ({ isAdmin: false, userId: null }));
  if (!isAdmin || !adminId) return new Response('forbidden', { status: 403 });

  const body = (await req.json().catch(() => null)) as { orderId?: string; paymentId?: string; dryRun?: boolean } | null;
  const orderId = body?.orderId?.trim() ?? '';
  const paymentId = body?.paymentId?.trim() ?? '';
  if (!/^GPA\.[\d-]+$/.test(orderId) || !paymentId) return Response.json({ ok: false, error: 'BAD_INPUT' }, { status: 400 });

  const [order] = await db
    .select({ userId: iapOrders.userId, status: iapOrders.status, provider: iapOrders.provider, playSku: iapOrders.playSku, amountKrw: iapOrders.amountKrw, token: iapOrders.playPurchaseToken })
    .from(iapOrders)
    .where(eq(iapOrders.portoneOrderId, paymentId))
    .limit(1);
  if (!order || order.provider !== 'play') return Response.json({ ok: false, error: 'ORDER_NOT_FOUND' }, { status: 404 });

  let g;
  try {
    g = await getPlayOrder(orderId);
  } catch (e) {
    const status = e instanceof PlayApiError ? e.status : 500;
    return Response.json({ ok: false, error: 'PLAY_ORDER_LOOKUP_FAILED', status, detail: (e as Error).message.slice(0, 300) }, { status: 502 });
  }
  const token = g.purchaseToken ?? '';
  const googleProduct = g.lineItems?.[0]?.productId ?? null;
  const summary = { googleState: g.state ?? null, googleProduct, ourSku: order.playSku, ourStatus: order.status, amountKrw: String(order.amountKrw), hasToken: !!token };
  if (!token) return Response.json({ ok: false, error: 'NO_TOKEN', ...summary }, { status: 409 });
  if (googleProduct && googleProduct !== order.playSku) return Response.json({ ok: false, error: 'SKU_MISMATCH', ...summary }, { status: 409 });
  if (order.token && order.token !== token) return Response.json({ ok: false, error: 'TOKEN_MISMATCH', ...summary }, { status: 409 });
  const [bound] = await db.select({ paymentId: iapOrders.portoneOrderId }).from(iapOrders).where(eq(iapOrders.playPurchaseToken, token)).limit(1);
  if (bound && bound.paymentId !== paymentId) return Response.json({ ok: false, error: 'TOKEN_BOUND_ELSEWHERE', boundTo: bound.paymentId, ...summary }, { status: 409 });
  if (body?.dryRun) return Response.json({ ok: true, dryRun: true, ...summary });

  const r = await completePurchase(paymentId, order.userId, { playPurchaseToken: token });
  await db.insert(adminActions).values({
    adminUserId: adminId,
    action: 'play_order_complete',
    targetType: 'iap_order',
    targetId: paymentId,
    payload: { orderId, result: r, ...summary },
  }).catch(() => undefined);
  return Response.json({ ...r, ...summary });
}
