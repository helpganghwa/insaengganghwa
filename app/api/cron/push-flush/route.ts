/**
 * 푸시 그룹화 flush — push_pending에 first_at + 30min 도달한 행을 묶어 발송.
 *
 * 매 5분 cron으로 호출(vercel.json). 그룹화 윈도가 30분이므로 평균 지연 ~17분.
 *
 * 트랜잭션 안전성:
 *  - DELETE … RETURNING으로 행을 빼낸 다음 발송 — 발송 후 실패해도 row는 이미 사라짐
 *    (재시도하면 새 누적분으로 다음 윈도 발송). 비동기 best-effort 알림이라 허용.
 *  - 발송 race: cron 1회만 호출되도록 vercel.json 단일 path. 동시 호출 가정해도 RETURNING이
 *    잡은 유저별 행은 1쪽에서만 빠짐.
 *
 * 카테고리: v1은 'enhance'만 그룹화. raid/supply는 별도 즉시/일일 발송.
 */
import { sql } from 'drizzle-orm';

import { isCronAuthorized } from '@/lib/auth/cron-auth';
import { db } from '@/lib/db/client';
import { sendPushToUser } from '@/lib/push/send';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// 모드별 묶음 윈도(batched=30분 / batched_1h=60분)는 아래 SQL에 인라인.
// instant 모드는 push_pending을 거치지 않음.

// 배치 상한(감사 P1) — 무제한 DELETE…RETURNING + 유저 수만큼 Promise.all은 아침 윈도에
// 수천 건이 몰리면 동시 수천 소켓/쿼리(풀 max 8 큐잉 폭주). 500행씩 빼내 200명 단위로
// 순차 발송, 시간 예산 내 루프 — 잔여는 다음 틱(5분)이 이어받는다.
const CLAIM_BATCH = 500;
const SEND_CHUNK = 200;
const TIME_BUDGET_MS = 90_000;

type FlushRow = { user_id: string; items: unknown[] };

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return new Response('forbidden', { status: 403 });

  const startedAt = Date.now();
  let candidates = 0;
  let sent = 0;
  let failed = 0;

  for (;;) {
    // DELETE … RETURNING — row를 먼저 빼낸 뒤 발송. 누적 버그(2026-05-30) 방지:
    // 이전엔 SELECT 후 발송 + 성공 시 DELETE였는데, 윈도 직전 신규 적재가 ON CONFLICT로
    // 같은 row에 누적되어 다음 윈도에 또 발송되는 케이스가 있었음. 모드별 윈도(30/60분)는
    // profiles.push_enhance_mode와 JOIN해 사용자별로 적용.
    const rows = (await db.execute(sql`
      delete from push_pending pp
      using profiles p
      where p.id = pp.user_id
        and pp.category = 'enhance'::push_category
        and (pp.user_id, pp.category) in (
          select pp2.user_id, pp2.category
          from push_pending pp2
          join profiles p2 on p2.id = pp2.user_id
          where pp2.category = 'enhance'::push_category
            and (
              (p2.push_enhance_mode = 'batched'    and pp2.first_at + interval '30 minutes' <= now())
              or
              (p2.push_enhance_mode = 'batched_1h' and pp2.first_at + interval '60 minutes' <= now())
            )
          order by pp2.first_at
          limit ${CLAIM_BATCH}
        )
      returning pp.user_id::text user_id, pp.items
    `)) as unknown as FlushRow[];

    candidates += rows.length;

    for (let i = 0; i < rows.length; i += SEND_CHUNK) {
      await Promise.all(
        rows.slice(i, i + SEND_CHUNK).map(async (r) => {
          const items = Array.isArray(r.items) ? r.items : [];
          const n = items.length;
          if (n === 0) return;
          const title = n === 1 ? '강화 준비 완료' : `강화 ${n}건 준비 완료`;
          const body = describeBatch(items);
          try {
            const res = await sendPushToUser(r.user_id, {
              title,
              body,
              url: '/enhance',
              tag: 'enhance',
              category: 'enhance',
            });
            if (res.ok > 0) sent++;
            else failed++;
          } catch (e) {
            failed++;
            console.warn('[push-flush] send failed', r.user_id, e);
          }
        }),
      );
    }

    if (rows.length < CLAIM_BATCH) break;
    // 예산 체크는 다음 클레임 **전** — 초과 후 새 배치를 DELETE(클레임)하면 발송 중
    // maxDuration 킬에 그 배치가 통째로 유실된다(클레임=삭제라 재전송 없음).
    if (Date.now() - startedAt > TIME_BUDGET_MS) break; // 잔여는 다음 틱(5분)
  }

  return Response.json({
    ok: true,
    candidates,
    sent,
    failed,
    kind: 'push-flush',
  });
}

function describeBatch(items: unknown[]): string {
  // 'ready' 메시지 — 최대확률 도달한 잡 요약. 최대 2개까지 아이템명 + 레벨 표시.
  const parsed = items
    .map((it) => {
      if (!it || typeof it !== 'object') return null;
      const o = it as { fromLevel?: number; targetLevel?: number; itemKo?: string };
      if (typeof o.targetLevel !== 'number' || typeof o.fromLevel !== 'number') return null;
      return { fromLevel: o.fromLevel, targetLevel: o.targetLevel, itemKo: o.itemKo ?? '장비' };
    })
    .filter((v): v is { fromLevel: number; targetLevel: number; itemKo: string } => v !== null);
  if (parsed.length === 0) return '강화 가능한 장비가 있어요';
  if (parsed.length === 1) {
    const p = parsed[0]!;
    return `${p.itemKo} +${p.fromLevel} → +${p.targetLevel} 최대 확률 도달`;
  }
  const first = parsed[0]!;
  return `${first.itemKo} 외 ${parsed.length - 1}건 최대 확률 도달`;
}
