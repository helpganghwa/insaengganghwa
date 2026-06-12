import { desc, eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { characters } from '@/lib/db/schema/server';
import { adminMailLogs } from '@/lib/db/schema/mailbox';

import { AdminMailClient } from './AdminMailClient';

/** payload(jsonb) → 짧은 첨부 요약. */
function payloadSummary(payload: unknown): string {
  const p = (payload ?? {}) as {
    diamond?: number | string;
    boxes?: { weapon?: number; armor?: number; accessory?: number };
  };
  const parts: string[] = [];
  if (Number(p.diamond ?? 0) > 0) parts.push(`💎${Number(p.diamond).toLocaleString()}`);
  const b = p.boxes ?? {};
  const boxes: string[] = [];
  if (Number(b.weapon ?? 0) > 0) boxes.push(`무${b.weapon}`);
  if (Number(b.armor ?? 0) > 0) boxes.push(`방${b.armor}`);
  if (Number(b.accessory ?? 0) > 0) boxes.push(`장${b.accessory}`);
  if (boxes.length) parts.push(boxes.join(' '));
  return parts.length ? parts.join(' · ') : '첨부 없음';
}

const kstFmt = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** 어드민 우편 발송 — 단건 + broadcast. 진입 가드는 (admin)/layout.tsx 일원화. */
export default async function AdminMailPage() {
  const logs = await db
    .select({
      id: adminMailLogs.id,
      createdAt: adminMailLogs.createdAt,
      mode: adminMailLogs.mode,
      recipientCount: adminMailLogs.recipientCount,
      targetLabel: adminMailLogs.targetLabel,
      title: adminMailLogs.title,
      payload: adminMailLogs.payload,
      adminNickname: characters.nickname,
    })
    .from(adminMailLogs)
    .leftJoin(characters, eq(characters.userId, adminMailLogs.adminId))
    .orderBy(desc(adminMailLogs.createdAt))
    .limit(30);

  return (
    <>
      <AdminMailClient />

      <section className="mx-auto max-w-md px-4 pb-12 text-sm">
        <h2 className="mb-2 mt-1 text-xs font-bold text-zinc-500">최근 발송 ({logs.length})</h2>
        {logs.length === 0 ? (
          <p className="py-6 text-center text-[12px] text-zinc-500">발송 기록이 없습니다.</p>
        ) : (
          <ul className="space-y-1.5">
            {logs.map((l) => (
              <li
                key={String(l.id)}
                className="rounded-lg border border-zinc-200 px-2.5 py-2 dark:border-zinc-800"
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                      l.mode === 'broadcast'
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300'
                        : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                    }`}
                  >
                    {l.mode === 'broadcast' ? '전체' : '단건'}
                  </span>
                  <span className="truncate text-[12px] font-medium">{l.title || '(제목 없음)'}</span>
                  <span className="ml-auto shrink-0 text-[10px] tabular-nums text-zinc-400">
                    {kstFmt.format(new Date(l.createdAt))}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-zinc-500">
                  <span>→ {l.targetLabel || '?'}</span>
                  <span className="tabular-nums">{l.recipientCount.toLocaleString()}명</span>
                  <span>· {payloadSummary(l.payload)}</span>
                  <span className="text-zinc-400">· {l.adminNickname ?? '(탈퇴)'}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
