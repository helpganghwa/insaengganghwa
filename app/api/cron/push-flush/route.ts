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

const WINDOW_MIN = 30;

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

  // DELETE … RETURNING으로 묶인 행 회수(원자적). enhance 카테고리만.
  const rows = (await db.execute(sql`
    delete from push_pending
    where category = 'enhance'::push_category
      and first_at + interval '${sql.raw(String(WINDOW_MIN))} minutes' <= now()
    returning user_id::text user_id, items
  `)) as unknown as FlushRow[];

  if (rows.length === 0) {
    return Response.json({ ok: true, flushed: 0, kind: 'push-flush' });
  }

  // 유저별 발송 — 묶음 메시지 생성.
  let sent = 0;
  let failed = 0;
  await Promise.all(
    rows.map(async (r) => {
      const items = Array.isArray(r.items) ? r.items : [];
      const n = items.length;
      if (n === 0) return;
      const title =
        n === 1 ? '강화 결과 확인' : `강화 ${n}건 완료`;
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

  return Response.json({ ok: true, flushed: rows.length, sent, failed, kind: 'push-flush' });
}

function describeBatch(items: unknown[]): string {
  // 결과 한 줄 요약. 최대 3개까지 노출, 그 이상은 "외 N건"으로.
  const parsed = items
    .map((it) => {
      if (!it || typeof it !== 'object') return null;
      const o = it as { fromLevel?: number; toLevel?: number; outcome?: string };
      if (typeof o.toLevel !== 'number' || typeof o.outcome !== 'string') return null;
      return o as { fromLevel: number; toLevel: number; outcome: string };
    })
    .filter((v): v is { fromLevel: number; toLevel: number; outcome: string } => v !== null);
  if (parsed.length === 0) return '강화 결과를 확인하세요';
  const counts = { success: 0, hold: 0, down: 0 };
  for (const p of parsed) counts[p.outcome as keyof typeof counts]++;
  const parts: string[] = [];
  if (counts.success > 0) parts.push(`성공 ${counts.success}`);
  if (counts.hold > 0) parts.push(`유지 ${counts.hold}`);
  if (counts.down > 0) parts.push(`하락 ${counts.down}`);
  // 마지막 결과 1건 강조
  const last = parsed[parsed.length - 1]!;
  const arrow = last.outcome === 'success' ? '→' : last.outcome === 'down' ? '↓' : '·';
  return `${parts.join(' / ')} (최근 +${last.fromLevel} ${arrow} +${last.toLevel})`;
}
