import Link from 'next/link';
import { desc } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { worldHistory } from '@/lib/db/schema/world';

/**
 * 홈 §1 — 세계역사 카드 (SCREEN-ANALYSIS §4). 최근 5건 + /history 더 보기.
 *
 * 톤: 판타지 역사서 두루마리. message는 적재 시점 템플릿으로 생성되어 있음 — 본 컴포넌트는
 * 단순 노출 + 시간 ago 변환만. **마크다운 강조(**...**·_..._)**는 가벼운 inline 파싱.
 */

const LIMIT = 5;

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

/**
 * 매우 가벼운 inline 파서: **strong** + _em_ 만 처리. 그 외 텍스트 그대로.
 * record helpers가 생성하는 message 포맷에 한정 — 일반 사용자 입력은 거치지 않음(XSS 안전).
 */
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

export async function WorldHistoryCard() {
  const rows = await db
    .select({
      id: worldHistory.id,
      eventType: worldHistory.eventType,
      message: worldHistory.message,
      createdAt: worldHistory.createdAt,
    })
    .from(worldHistory)
    .orderBy(desc(worldHistory.createdAt))
    .limit(LIMIT);

  if (rows.length === 0) return null;

  return (
    <section
      aria-label="세계역사"
      className="overflow-hidden rounded-xl border border-amber-900/40 bg-gradient-to-b from-stone-900 to-stone-950"
    >
      <header className="flex items-baseline justify-between border-b border-amber-900/30 px-3.5 py-2">
        <h2 className="flex items-center gap-1.5 text-[12px] font-bold text-amber-200">
          <span aria-hidden>📜</span>
          <span>세계 역사</span>
        </h2>
        <Link
          href="/history"
          className="text-[10px] font-medium text-amber-300/80 hover:text-amber-200"
        >
          더 보기 →
        </Link>
      </header>
      <ul className="divide-y divide-amber-900/20">
        {rows.map((r) => (
          <li key={String(r.id)} className="flex gap-2.5 px-3.5 py-2.5">
            <span aria-hidden className="shrink-0 text-sm leading-snug text-amber-300/80">
              {ICON_BY_TYPE[r.eventType] ?? '•'}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] leading-snug text-amber-50/90">
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
  );
}
