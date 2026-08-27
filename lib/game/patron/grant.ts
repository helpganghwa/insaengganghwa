import 'server-only';

import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { mailbox } from '@/lib/db/schema/mailbox';
import { iapOrders, patronMilestoneGrants } from '@/lib/db/schema/payment';
import {
  patronMailBody,
  patronMailTitle,
  reachedMilestones,
  splitBoxesEven,
  type PatronMilestone,
} from './milestones';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// 발신 '인생강화' + type 'admin' — 카드가 "인생강화 ✓"로 표시되는 특별 우편(milestone-mail.ts와 동일 규약).
const SENDER = '인생강화';

/**
 * 후원 구간 보상 지급 — 누적 paid 합(환불 제외)으로 도달한 구간 중 미지급분을 전부 우편으로.
 * 결제 완료 tx 안에서 호출(purchase.ts) — 같은 tx라 상품 지급과 함께 커밋/롤백. 소급 스크립트도 동일 함수.
 *  - 멱등: patron_milestone_grants PK. 삽입 성공(returning 행)한 구간만 우편을 만든다.
 *  - 한 결제로 여러 구간을 넘으면 구간마다 우편이 따로 온다(체감 극대화 — 설계 확정).
 *  - 우편은 결제한 캐릭터의 서버(serverId)로 — 재화 지갑이 서버별이라 수령 서버가 곧 지급 서버.
 */
export async function grantPatronMilestones(
  tx: Tx,
  userId: string,
  serverId: number,
): Promise<PatronMilestone[]> {
  const [sum] = await tx
    .select({ paid: sql<string>`coalesce(sum(${iapOrders.amountKrw}), 0)::bigint` })
    .from(iapOrders)
    .where(and(eq(iapOrders.userId, userId), eq(iapOrders.status, 'paid')));
  const paidKrw = Number(sum?.paid ?? 0);
  const reached = reachedMilestones(paidKrw);
  if (reached.length === 0) return [];

  const granted: PatronMilestone[] = [];
  for (const m of reached) {
    const inserted = await tx
      .insert(patronMilestoneGrants)
      .values({ userId, milestoneKrw: m.krw })
      .onConflictDoNothing()
      .returning({ krw: patronMilestoneGrants.milestoneKrw });
    if (inserted.length === 0) continue; // 이미 지급
    const boxes = splitBoxesEven(m.boxes);
    await tx.insert(mailbox).values({
      userId,
      serverId,
      type: 'admin',
      title: patronMailTitle(m),
      body: patronMailBody(m),
      senderLabel: SENDER,
      payload: { diamond: m.diamond, boxes },
    });
    granted.push(m);
  }
  return granted;
}
