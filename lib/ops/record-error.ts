import 'server-only';

import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { clientErrors } from '@/lib/db/schema/ops';

const OPEN_ROW_CAP = 1000; // 미해결 distinct fingerprint 상한(폭주·남용 방어).

export interface RecordErrorInput {
  kind: string;
  message: string;
  url?: string | null;
  ua?: string | null;
  stack?: string | null;
}

/**
 * client_errors 그룹 적재 — 클라 리포트(/api/client-error)와 서버 throw(instrumentation
 * onRequestError) 공용 단일 경로. 동일 미해결 fingerprint(kind:message)면 count 증가,
 * 없으면(상한 내) 신규 적재. 어드민 /admin/client-errors에서 조회.
 * best-effort: 관측 실패가 요청/렌더를 막지 않도록 호출측에서 감쌀 것.
 */
export async function recordError(input: RecordErrorInput): Promise<void> {
  const kind = input.kind.slice(0, 40);
  const message = input.message.slice(0, 500);
  if (!message) return;
  const fingerprint = `${kind}:${message}`.slice(0, 200);
  const url = input.url?.slice(0, 300) ?? null;
  const ua = input.ua?.slice(0, 200) ?? null;
  const stack = input.stack?.slice(0, 1500) ?? null;

  // 동일 미해결 fingerprint면 count 증가, 없으면(상한 내) 새로 적재.
  const upd = await db
    .update(clientErrors)
    .set({ count: sql`${clientErrors.count} + 1`, lastSeen: new Date(), url, stack })
    .where(and(eq(clientErrors.fingerprint, fingerprint), eq(clientErrors.resolved, false)))
    .returning({ id: clientErrors.id });
  if (upd.length === 0) {
    const [{ n }] = (await db
      .select({ n: sql<number>`count(*)::int` })
      .from(clientErrors)
      .where(eq(clientErrors.resolved, false))) as [{ n: number }];
    if (n < OPEN_ROW_CAP) {
      await db
        .insert(clientErrors)
        .values({ fingerprint, kind, message, url, ua, stack })
        .onConflictDoNothing();
    }
  }
}
