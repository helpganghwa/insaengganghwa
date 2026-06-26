'use client';

import { useEffect, useState } from 'react';

import { ModalShell } from '@/components/ModalShell';
import { MarkdownView } from '@/components/MarkdownView';
import { assetUrl } from '@/lib/asset-versions';
import {
  ANNOUNCEMENT_CATEGORY_LABEL,
  ANNOUNCEMENT_CATEGORY_CLS as CAT_CLS,
  type AnnouncementView,
} from '@/lib/game/announcement-shared';

const SEEN_KEY = 'annSeenId';

function fmtDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(Date.parse(iso) + 9 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCFullYear() % 100)}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

function CatBadge({ category }: { category: string }) {
  return (
    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${CAT_CLS[category] ?? CAT_CLS.notice}`}>
      {ANNOUNCEMENT_CATEGORY_LABEL[category] ?? category}
    </span>
  );
}

/** 공지 상세 — 카테고리·제목·일시 + 마크다운 본문. */
function Detail({ a }: { a: AnnouncementView }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
      <div className="flex items-center gap-2">
        <CatBadge category={a.category} />
        {a.pinned && <span className="text-[11px] text-amber-500">📌</span>}
        <span className="ml-auto text-[10px] tabular-nums text-zinc-400">{fmtDate(a.publishedAtIso)}</span>
      </div>
      <h2 className="mt-1.5 text-base font-bold leading-snug">{a.title}</h2>
      <div className="mt-2 text-[13px] leading-relaxed text-zinc-700 dark:text-zinc-200">
        <MarkdownView source={a.body} />
      </div>
    </div>
  );
}

/**
 * 홈 게시판 — 메뉴 카드(강화 자리)·목록 모달·상세·홈 강제 팝업. 안읽음은 localStorage(annSeenId,
 * 마지막 본 최신 공지 id)로 추적: 최신 id > seen이면 카드에 빨간 dot + 홈 진입 시 1회 팝업.
 * '다시 보지 않기' → seen=최신 id(새 글 올라오면 자동 재노출). 목록을 열어도 읽음 처리.
 */
export function AnnouncementBoard({ items, tint }: { items: AnnouncementView[]; tint: string }) {
  const [mounted, setMounted] = useState(false);
  // 초기값은 클라에서 localStorage로(SSR=0). 의존 UI는 mounted 후에만 노출 → 하이드레이션 안전.
  const [seenId, setSeenId] = useState<number>(() => {
    if (typeof window === 'undefined') return 0;
    try {
      return Number(localStorage.getItem(SEEN_KEY) || 0);
    } catch {
      return 0;
    }
  });
  const [listOpen, setListOpen] = useState(false);
  const [detail, setDetail] = useState<AnnouncementView | null>(null);
  const [gateDismissed, setGateDismissed] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const latest = items[0] ?? null; // 발행 최신순 → 가장 새 글
  const hasNew = !!latest && Number(latest.id) > seenId;
  const gateOpen = mounted && hasNew && !gateDismissed && !listOpen;
  // 고정 우선(목록) — stable sort라 같은 그룹 내 발행 최신순 유지.
  const sorted = [...items].sort((a, b) => Number(b.pinned) - Number(a.pinned));

  const markSeen = () => {
    if (!latest) return;
    setSeenId(Number(latest.id));
    try {
      localStorage.setItem(SEEN_KEY, latest.id);
    } catch {
      /* noop */
    }
  };
  const openList = () => {
    setGateDismissed(true);
    setDetail(null);
    setListOpen(true);
    markSeen();
  };
  const closeList = () => {
    setListOpen(false);
    setDetail(null);
  };

  return (
    <>
      {/* 메뉴 카드 — 다른 홈 카드와 동일 형태(버튼). 강화 자리. */}
      <button
        type="button"
        onClick={openList}
        style={{ backgroundColor: tint }}
        className="relative flex aspect-[50/17] isolate overflow-hidden rounded-2xl border border-zinc-800 transition active:scale-[0.98]"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={assetUrl('/sprites/hub/board.png')}
          alt=""
          aria-hidden
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover"
          style={{ imageRendering: 'pixelated' }}
        />
        {mounted && hasNew && (
          <span
            aria-label="새 공지"
            className="absolute right-1.5 top-1.5 z-10 h-2.5 w-2.5 rounded-full bg-red-500 shadow ring-2 ring-zinc-900/50"
          />
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/55 to-transparent px-3 pt-5 pb-1.5 text-left">
          <div className="text-sm font-bold leading-tight text-white drop-shadow-sm">게시판</div>
          <div className="mt-0.5 truncate text-[10px] leading-tight text-white/85">
            {latest ? latest.title : '공지·업데이트'}
          </div>
        </div>
      </button>

      {/* 목록 모달 — 상세 진입/뒤로 */}
      {listOpen && (
        <ModalShell
          onClose={closeList}
          label="게시판"
          className="flex max-h-[80vh] w-full max-w-[360px] flex-col overflow-hidden rounded-2xl bg-white dark:bg-zinc-950"
        >
          <div className="flex shrink-0 items-center gap-2 border-b border-zinc-100 px-4 py-2.5 dark:border-zinc-900">
            {detail ? (
              <button type="button" onClick={() => setDetail(null)} className="text-[13px] font-semibold text-zinc-500">
                ‹ 목록
              </button>
            ) : (
              <h2 className="text-sm font-bold">게시판</h2>
            )}
            <button type="button" onClick={closeList} className="ml-auto text-[13px] text-zinc-400">
              닫기
            </button>
          </div>
          {detail ? (
            <Detail a={detail} />
          ) : sorted.length === 0 ? (
            <p className="px-4 py-10 text-center text-[12px] text-zinc-400">등록된 공지가 없습니다.</p>
          ) : (
            <ul className="min-h-0 flex-1 divide-y divide-zinc-100 overflow-y-auto dark:divide-zinc-900">
              {sorted.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => setDetail(a)}
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-left active:bg-zinc-50 dark:active:bg-zinc-900"
                  >
                    <CatBadge category={a.category} />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                      {a.pinned && <span className="mr-1 text-amber-500">📌</span>}
                      {a.title}
                    </span>
                    <span className="shrink-0 text-[10px] tabular-nums text-zinc-400">
                      {fmtDate(a.publishedAtIso).slice(0, 8)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ModalShell>
      )}

      {/* 홈 강제 팝업 — 새 글 있으면 진입 시 1회. '다시 보지 않기'로 읽음 처리. */}
      {gateOpen && latest && (
        <ModalShell
          onClose={() => setGateDismissed(true)}
          label={latest.title}
          className="flex max-h-[80vh] w-full max-w-[340px] flex-col overflow-hidden rounded-2xl bg-white dark:bg-zinc-950"
        >
          <Detail a={latest} />
          <div className="flex shrink-0 gap-2 border-t border-zinc-100 px-4 py-3 dark:border-zinc-900">
            <button
              type="button"
              onClick={() => setGateDismissed(true)}
              className="flex-1 rounded-lg border border-zinc-300 py-2 text-[13px] font-semibold text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
            >
              닫기
            </button>
            <button
              type="button"
              onClick={() => {
                markSeen();
                setGateDismissed(true);
              }}
              className="flex-1 rounded-lg bg-zinc-800 py-2 text-[13px] font-bold text-white dark:bg-zinc-200 dark:text-zinc-900"
            >
              다시 보지 않기
            </button>
          </div>
        </ModalShell>
      )}
    </>
  );
}
