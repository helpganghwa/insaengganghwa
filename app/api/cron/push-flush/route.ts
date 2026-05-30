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

import { db } from '@/lib/db/client';
import { sendPushToUser } from '@/lib/push/send';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 모드별 묶음 윈도(batched=30분 / batched_1h=60분)는 아래 SQL에 인라인.
// instant 모드는 push_pending을 거치지 않음.

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization');
    if (auth === `Bearer ${secret}`) return true;
  }
  if (req.headers.get('x-vercel-cron')) return true;
  const ua = req.headers.get('user-agent') ?? '';
  if (ua.startsWith('vercel-cron/')) return true;
  return false;
}

type FlushRow = { user_id: string; items: unknown[] };

export async function GET(req: Request) {
  if (!isAuthorized(req)) return new Response('forbidden', { status: 403 });

  // DELETE … RETURNING — row를 먼저 빼낸 뒤 발송. 누적 버그(2026-05-30) 방지:
  // 이전엔 SELECT 후 발송 + 성공 시 DELETE였는데, 윈도 직전 신규 적재가 ON CONFLICT로
  // 같은 row에 누적되어 다음 윈도에 또 발송되는 케이스가 있었음. 모드별 윈도(30/60분)는
  // profiles.push_enhance_mode와 JOIN해 사용자별로 적용.
  const rows = (await db.execute(sql`
    delete from push_pending pp
    using profiles p
    where p.id = pp.user_id
      and pp.category = 'enhance'::push_category
      and (
        (p.push_enhance_mode = 'batched'    and pp.first_at + interval '30 minutes' <= now())
        or
        (p.push_enhance_mode = 'batched_1h' and pp.first_at + interval '60 minutes' <= now())
      )
    returning pp.user_id::text user_id, pp.items
  `)) as unknown as FlushRow[];

  if (rows.length === 0) {
    return Response.json({ ok: true, flushed: 0, kind: 'push-flush' });
  }

  let sent = 0;
  let failed = 0;
  await Promise.all(
    rows.map(async (r) => {
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

  return Response.json({
    ok: true,
    candidates: rows.length,
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
