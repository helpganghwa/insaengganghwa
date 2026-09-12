import 'server-only';

import { and, eq, isNull, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { walletAdd, walletReclaim } from '@/lib/game/wallet';
import { userSupplyBoxes } from '@/lib/db/schema/supply';
import { shopPurchases } from '@/lib/db/schema/shop';
import { mailbox } from '@/lib/db/schema/mailbox';
import { SUPPLY_SLOTS } from '@/lib/game/balance';
import { reclaimBoxesTotal } from '@/lib/game/supply/reclaim';


import { shopGrant, productPeriod, PREMIUM, FIRST_SPECIAL } from './catalog';
import { periodKey } from './period';

/** 즉시 보상 우편 제목 — 지급과 회수가 같은 문자열을 봐야 주문 단위 회수가 정확하다. */
const PREMIUM_INSTANT_TITLE = '성장 프리미엄 — 즉시 보상';

/**
 * 상점 지급 — dev 테스트 즉시구매(dev-purchase)와 실결제(payment) **공용 단일 진실 원천**.
 * 지급 수치·분배·우편 형식이 두 경로에서 어긋나면 결제 정합성이 깨지므로 여기서만 정의.
 */
export type Grant = { diamond: number; boxes: number };

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** 보급 상자 n개를 슬롯(무기/방어구/장신구) 균등 분배 — 나머지는 슬롯 순서대로 1개씩. */
function splitBoxes(n: number): Record<string, number> {
  const base = Math.floor(n / SUPPLY_SLOTS.length);
  const out: Record<string, number> = { weapon: base, armor: base, accessory: base };
  let rem = n - base * SUPPLY_SLOTS.length;
  for (let i = 0; rem > 0; i++, rem--) out[SUPPLY_SLOTS[i % SUPPLY_SLOTS.length]!]! += 1;
  return out;
}

/** 다이아 → 지갑 가산, 상자 → 슬롯별 보유량 가산. 즉시 반영(비-우편). */
async function creditGrant(tx: Tx, userId: string, serverId: number, g: Grant): Promise<void> {
  if (g.diamond > 0) {
    await walletAdd(tx, userId, serverId, g.diamond, 'iap');
  }
  if (g.boxes > 0) {
    const dist = splitBoxes(g.boxes);
    for (const slot of SUPPLY_SLOTS) {
      const n = dist[slot] ?? 0;
      if (n > 0) {
        await tx
          .insert(userSupplyBoxes)
          .values({ userId, serverId, slot, count: BigInt(n) })
          .onConflictDoUpdate({
            target: [userSupplyBoxes.userId, userSupplyBoxes.serverId, userSupplyBoxes.slot],
            set: { count: sql`${userSupplyBoxes.count} + ${BigInt(n)}` },
          });
      }
    }
  }
}

/** 성장 프리미엄 즉시 보상을 우편으로 적재(다이아 + 균등 분배 상자). 수령 시 claimMail이 지갑/상자 가산. */
async function mailPremiumInstant(
  tx: Tx,
  userId: string,
  serverId: number,
  g: Grant,
  meta: { title: string; body: string },
): Promise<void> {
  const dist = splitBoxes(g.boxes);
  await tx.insert(mailbox).values({
    userId,
    serverId,
    type: 'reward',
    title: meta.title,
    body: meta.body,
    senderLabel: '성장 프리미엄',
    payload: {
      diamond: g.diamond,
      boxes: { weapon: dist.weapon ?? 0, armor: dist.armor ?? 0, accessory: dist.accessory ?? 0 },
    },
  });
}

/**
 * 상품 지급 본체(지급 + 주기 마킹) — **결제 검증/주기 사전체크 이후** 호출하는 무조건 지급.
 * 결제가 이미 성사된 시점이라 여기서 차단하지 않는다(미지급 방지). 주기 상품은 periodKey를 현재로 갱신
 * (일일/주간/월간 1회 추적 — UI 비활성화·드립 기준). 프리미엄은 즉시분 우편(일일분은 로그인 드립 별도).
 */
export async function applyProductGrant(
  tx: Tx,
  userId: string,
  serverId: number,
  productId: string,
): Promise<Grant & { skipped?: boolean }> {
  const g = shopGrant(productId);
  if (!g) throw new Error('UNKNOWN_PRODUCT');
  const period = productPeriod(productId);

  // 인생 특가(서버별 1회) — createOrder 사전체크는 비원자(pending 2건 병렬 결제 가능)라
  // 지급 시점에 'once' 행 잠금으로 최종 게이트(dev 지급과 동일 원장). 두 번째 결제 지급은
  // 차단하되 결제는 이미 성사됐으므로 throw 대신(웹훅 재시도 루프 방지) 알림 → 수동 환불.
  if (productId === FIRST_SPECIAL.id) {
    await tx
      .insert(shopPurchases)
      .values({ userId, serverId, productId, periodKey: '' })
      .onConflictDoNothing();
    const [row] = await tx
      .select({ periodKey: shopPurchases.periodKey })
      .from(shopPurchases)
      .where(
        and(
          eq(shopPurchases.userId, userId),
          eq(shopPurchases.serverId, serverId),
          eq(shopPurchases.productId, productId),
        ),
      )
      .for('update');
    if (row?.periodKey === 'once') {
      // 지급 차단 — 알림은 호출자가 tx 커밋 후 발화(외부 HTTP를 잠금 보유 중 수행 금지 +
      // 롤백 시 허위 알림 방지). 호출자는 skipped를 보고 주문에 grant_skipped를 마킹해
      // 환불 시 이 주문이 "타 주문 지급분"을 회수하지 않게 한다.
      return { diamond: 0, boxes: 0, skipped: true };
    }
    await tx
      .update(shopPurchases)
      .set({ periodKey: 'once', updatedAt: new Date() })
      .where(
        and(
          eq(shopPurchases.userId, userId),
          eq(shopPurchases.serverId, serverId),
          eq(shopPurchases.productId, productId),
        ),
      );
  }

  if (productId === PREMIUM.id) {
    await mailPremiumInstant(tx, userId, serverId, g, {
      title: PREMIUM_INSTANT_TITLE,
      body: '성장 프리미엄 구매 감사합니다. 즉시 보상이 도착했어요. 매일 보상도 우편으로 찾아갑니다.',
    });
  } else {
    await creditGrant(tx, userId, serverId, g);
  }

  if (period) {
    const cur = periodKey(period);
    await tx
      .insert(shopPurchases)
      .values({ userId, serverId, productId, periodKey: cur })
      .onConflictDoUpdate({
        target: [shopPurchases.userId, shopPurchases.serverId, shopPurchases.productId],
        set: { periodKey: cur, updatedAt: new Date() },
      });
  }

  return g;
}

/**
 * 상품 지급 회수(환불 시) — applyProductGrant의 역연산. 결제 취소 트랜잭션 안에서 호출.
 *  - 다이아: walletReclaim(0 클램프 회수). **이미 소비한 분은 회수 불가(v1 정책: 손실 처리)**.
 *    음수 잔액은 UI·차감 불변식을 깨므로 의도적으로 만들지 않는다(악용 방지는 추후 정책으로).
 *  - 상자: **슬롯 합계** 기준 회수(reclaimBoxesTotal). 환불 사전판정이 합계로 충분 여부를 보므로
 *    슬롯별 역분배로 회수하면 판정은 통과하고 회수만 조용히 줄어든다(supply/reclaim.ts 참조).
 *  - 프리미엄: **주문 단위**. 남은 주문이 없으면 일일 지급 창을 지우고 미수령 프리미엄 우편을 전부
 *    회수한다. 남은 주문이 있으면 창을 그 주문 시각으로 되돌리고(만료된 시각이면 자연히 닫힌다),
 *    즉시 보상 한 통 + 되돌린 창 바깥의 미수령 일일 보상을 회수한다.
 *    이미 수령(지갑 반영)한 분은 자동 회수하지 않는다(운영 수동) — 중복 회수 방지.
 */
export async function reclaimProductGrant(
  tx: Tx,
  userId: string,
  serverId: number,
  productId: string,
  /** 원장 추적 키 — 어느 주문의 회수인지(`order:<iap_orders.id>`). */
  ref?: string,
): Promise<void> {
  if (productId === PREMIUM.id) {
    // 회수는 **주문 단위**여야 한다(2026-09-12 사용자 확정). 종전엔 ref를 무시하고 프리미엄
    // 권리를 통째로 지웠다 — 두 번 산 유저가 한 건만 환불하면 아직 돈을 낸 쪽의 일일 지급까지
    // 같이 끊기고 미수령 우편도 전부 사라졌다.
    //
    // 프리미엄의 모든 판정(일일 지급 창·"N일 남음" 표시·재구매 차단)은 shop_purchases.updated_at
    // **하나**에서 나오고, 그 값은 구매할 때마다 최신 시각으로 덮어써진다. 그래서 "다른 주문이
    // 존재하는가"로는 부족하다 — 한참 전에 만료된 주문이 남아 있어도 "있다"가 되어, 환불된 주문이
    // 세팅해 둔 창이 그대로 살아버린다(자가 검수 2026-09-12에서 잡은 회귀).
    //
    // 올바른 역연산은 **남은 주문 중 가장 최근 것으로 창을 되돌리는 것**이다. 그 시각이 이미
    // 30일을 넘겼으면 창은 자연히 닫히고, 아직 살아 있으면 그 주문 몫만큼만 남는다.
    // 이 주문은 호출 시점에 이미 refunded로 전이돼 있으므로(refund.ts) 조회에 안 걸린다.
    // grant_skipped 주문은 애초에 지급이 없었으니 권리로 치지 않는다.
    //
    // ⚠ 창 행을 **먼저 잠근다**(7차 검수). 같은 유저의 프리미엄 주문 둘이 동시에 환불되면(웹훅
    // 재전송·연속 환불) 두 트랜잭션은 서로 다른 iap_orders 행을 잠그므로 직렬화되지 않는다.
    // 잠금 없이 읽으면 A는 "B가 아직 paid", B는 "A가 아직 paid"로 보고 각자 상대 시각으로 창을
    // 덮어써, 둘 다 환불됐는데도 최대 29일치 일일 지급이 계속 나간다. 창 행을 먼저 잠그면 두
    // 트랜잭션이 여기서 직렬화되고, 뒤늦은 쪽은 상대의 refunded 전이를 본 뒤 계산한다.
    await tx.execute(sql`
      select 1 from shop_purchases
      where user_id = ${userId}::uuid and server_id = ${serverId} and product_id = ${PREMIUM.id}
      for update
    `);
    const [prev] = (await tx.execute(sql`
      select max(coalesce(paid_at, created_at)) as at from iap_orders
      where user_id = ${userId}::uuid and server_id = ${serverId}
        and product_code = ${PREMIUM.id} and status = 'paid' and grant_skipped = false
    `)) as unknown as { at: string | Date | null }[];
    // raw execute는 timestamptz를 문자열로 줄 수 있다 — drizzle .set()은 Date를 요구한다.
    const alive = prev?.at ? new Date(prev.at) : null;

    if (!alive) {
      // 살아 있는 프리미엄 주문이 없다 — 권리 자체가 사라졌으므로 종전대로 전부 회수.
      await tx
        .delete(shopPurchases)
        .where(
          and(
            eq(shopPurchases.userId, userId),
            eq(shopPurchases.serverId, serverId),
            eq(shopPurchases.productId, PREMIUM.id),
          ),
        );
      await tx
        .delete(mailbox)
        .where(
          and(
            eq(mailbox.userId, userId),
            eq(mailbox.serverId, serverId),
            eq(mailbox.senderLabel, '성장 프리미엄'),
            isNull(mailbox.claimedAt),
          ),
        );
      return;
    }

    // 남은 주문이 있다 — 창을 그 주문 시각으로 되돌린다. 이미 만료된 시각이면 다음 일일 지급부터
    // 자연히 멈추고, 살아 있으면 남은 일수만 이어진다.
    await tx
      .update(shopPurchases)
      .set({ updatedAt: alive })
      .where(
        and(
          eq(shopPurchases.userId, userId),
          eq(shopPurchases.serverId, serverId),
          eq(shopPurchases.productId, PREMIUM.id),
        ),
      );

    // 즉시 보상은 **한 통**만 미수령이면 회수한다. 어느 통이 어느 주문 것인지는 우편에 남지 않지만
    // 값이 같으므로 개수가 맞으면 결과도 맞다(주문 2건·1건 환불 → 1통 남김). 이미 수령한 분은
    // 종전 정책대로 운영 수동.
    await tx.execute(sql`
      delete from mailbox where id in (
        select id from mailbox
        where user_id = ${userId}::uuid and server_id = ${serverId}
          and sender_label = '성장 프리미엄' and claimed_at is null
          and title = ${PREMIUM_INSTANT_TITLE}
        order by id desc limit 1
      )
    `);

    // 환불된 주문의 창에서 이미 나간 **일일 보상**도 미수령이면 회수한다. 되돌린 창의 끝
    // (남은 주문 + 29일)보다 뒤에 적재된 통은 환불된 주문의 창에서만 나올 수 있다. 두 창이
    // 겹치는 방어적 경우엔 끝이 미래라 아무것도 지우지 않는다(남은 주문 몫을 뺏지 않는다).
    await tx.execute(sql`
      delete from mailbox
      where user_id = ${userId}::uuid and server_id = ${serverId}
        and sender_label = '성장 프리미엄' and claimed_at is null
        and title <> ${PREMIUM_INSTANT_TITLE}
        and (created_at at time zone 'Asia/Seoul')::date
            > (${alive.toISOString()}::timestamptz at time zone 'Asia/Seoul')::date + ${PREMIUM.daily.days - 1}::int
    `);
    return;
  }

  const g = shopGrant(productId);
  if (!g) return;

  if (g.diamond > 0) {
    // 지갑 헬퍼 경유(2026-08-11) — 예전엔 여기서 raw UPDATE로 잔액만 깎아 diamond_ledger에
    // 회수 기록이 남지 않았다. 원장이 가장 필요한 순간이 "얼마를 지급했고 얼마를 되찾았나"를
    // 따지는 환불 분쟁인데, 하필 그 구간만 비어 있어 지급(iap +)만 남고 회수(−)는 증발했다.
    // walletReclaim은 0 클램프·캐릭터 행 부재 시 무해한 0 반환까지 기존 동작과 동일하고,
    // 실제 회수액만 원장에 남긴다(명목액을 남기면 못 받은 몫까지 회수된 것으로 보인다).
    await walletReclaim(tx, userId, serverId, g.diamond, 'refund_clawback', ref);
  }
  if (g.boxes > 0) await reclaimBoxesTotal(tx, userId, serverId, g.boxes);

  // 주기 상품(일일/주간/월간)이면 구매 마크 삭제 → 환불 후 같은 주기에 재구매 가능(disabled 해제).
  // ⚠ 인생 특가('once', period 없음)는 의도적으로 마크를 남긴다 — 환불해도 특가 기회는
  // 1회 소진(환불 어뷰징 방지, 사용자 결정 2026-07-07). 재화 회수는 위에서 동일하게 수행.
  if (productPeriod(productId)) {
    await tx
      .delete(shopPurchases)
      .where(
        and(
          eq(shopPurchases.userId, userId),
          eq(shopPurchases.serverId, serverId),
          eq(shopPurchases.productId, productId),
        ),
      );
  }
}
