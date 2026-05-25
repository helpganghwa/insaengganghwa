import Link from 'next/link';
import { desc } from 'drizzle-orm';
import type { Metadata } from 'next';

import { db } from '@/lib/db/client';
import { worldHistory } from '@/lib/db/schema/world';

export const metadata: Metadata = {
  title: '세계 역사 — 인생강화',
  description: '모든 모험가의 특별한 순간을 모은 판타지 역사서.',
};

const PAGE_SIZE = 50;

function timeAgo(d: Date): string {
  const sec = Math.max(1, Math.floor((Date.now() - d.getTime()) / 1000));
  if (sec < 60) return `${sec}초 전`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  return `${day}일 전`;
}

function renderInline(text: string): React.ReactNode[] {
  const tokens = text.split(/(\*\*[^*]+\*\*|_[^_]+_)/g);
  return tokens.map((t, i) => {
    if (t.startsWith('**') && t.endsWith('**')) {
      return (
        <strong key={i} className="font-semibold text-amber-100">
          {t.slice(2, -2)}
        </strong>
      );
    }
    if (t.startsWith('_') && t.endsWith('_')) {
      return (
        <em key={i} className="font-medium text-amber-200/90 not-italic">
          {t.slice(1, -1)}
        </em>
      );
    }
    return <span key={i}>{t}</span>;
  });
}

const ICON_BY_TYPE: Record<string, string> = {
  enhance_99: '⚒️',
  transcend_max: '✦',
  codex_complete: '📖',
  champion_new: '🏆',
  operator_notice: '📜',
  genesis: '⏳',
};

/** /history MVP — 최근 50건 단순 리스트. 페이지네이션은 P1 후속. */
export default async function HistoryPage() {
  const rows = await db
    .select({
      id: worldHistory.id,
      eventType: worldHistory.eventType,
      message: worldHistory.message,
      createdAt: worldHistory.createdAt,
    })
    .from(worldHistory)
    .orderBy(desc(worldHistory.createdAt))
    .limit(PAGE_SIZE);

  return (
    <main className="space-y-4 px-4 py-4">
      <header className="flex items-baseline justify-between">
        <h1 className="flex items-center gap-1.5 text-lg font-semibold">
          <span aria-hidden>📜</span>
          <span>세계 역사</span>
        </h1>
        <Link href="/" className="text-xs text-zinc-500">
          ← 홈
        </Link>
      </header>

      <p className="text-[11px] leading-relaxed text-zinc-500">
        모든 모험가의 특별한 순간을 모은 판타지 역사서. 강화 +99·초월 10·운영 공지를 기록합니다.
      </p>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-700 p-6 text-center text-[12px] text-zinc-500">
          아직 기록된 역사가 없어요. 곧 첫 모험가의 발자취가 새겨질 거예요.
        </p>
      ) : (
        <section className="overflow-hidden rounded-xl border border-amber-900/40 bg-gradient-to-b from-stone-900 to-stone-950">
          <ul className="divide-y divide-amber-900/20">
            {rows.map((r) => (
              <li key={String(r.id)} className="flex gap-2.5 px-3.5 py-3">
                <span aria-hidden className="shrink-0 text-base leading-snug text-amber-300/80">
                  {ICON_BY_TYPE[r.eventType] ?? '•'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] leading-relaxed text-amber-50/95">
                    {renderInline(r.message)}
                  </p>
                  <p className="mt-0.5 text-[10px] text-amber-300/50 tabular-nums">
                    {timeAgo(r.createdAt)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-[10px] text-zinc-500">최근 {PAGE_SIZE}건 · 페이지네이션 후속 예정</p>
    </main>
  );
}
