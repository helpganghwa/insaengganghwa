'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';

import type { WikiDocLink } from './registry';
import { PAPER } from './theme';

const MAX_RESULTS = 8;

/**
 * 문서 검색 — 제목·요약 부분일치만. 색인 서버도 fetch도 없다(문서 목록이 정적 데이터라
 * 목록 자체를 prop으로 받는다 — 본문 컴포넌트는 클라이언트 번들에 실리지 않는다).
 */
export function WikiSearch({ docs }: { docs: readonly WikiDocLink[] }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        return;
      }
      if (e.key !== '/') return;
      // 입력 중인 사용자에게서 '/'를 뺏지 않는다.
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      e.preventDefault();
      setOpen(true);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const hits = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const pool = needle
      ? docs.filter(
          (d) => d.title.toLowerCase().includes(needle) || d.summary.toLowerCase().includes(needle),
        )
      : docs;
    return pool.slice(0, MAX_RESULTS);
  }, [docs, q]);

  function close() {
    setOpen(false);
    setQ('');
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`rounded-md border px-2.5 py-1 text-[12px] ${PAPER.card} ${PAPER.hover}`}
      >
        검색
        <span className={`ml-1.5 hidden md:inline ${PAPER.muted}`}>/</span>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/45 px-4 pt-[12vh]"
          onClick={close}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="문서 검색"
            className={`w-full max-w-[520px] overflow-hidden rounded-lg border shadow-xl ${PAPER.card}`}
            onClick={(e) => e.stopPropagation()}
          >
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="문서 검색"
              className={`w-full border-b bg-transparent px-4 py-3 text-[14px] outline-none ${PAPER.border}`}
            />
            {hits.length === 0 ? (
              <p className={`px-4 py-6 text-center text-[13px] ${PAPER.muted}`}>결과가 없다.</p>
            ) : (
              <ul className="max-h-[52vh] overflow-y-auto py-1">
                {hits.map((d) => (
                  <li key={d.slug}>
                    <Link
                      prefetch={false}
                      href={`/wiki/${d.slug}`}
                      onClick={close}
                      className={`block px-4 py-2.5 ${PAPER.hover}`}
                    >
                      <span className="text-[13.5px] font-semibold">{d.title}</span>
                      <span className={`ml-2 text-[11px] ${PAPER.muted}`}>{d.cat}</span>
                      <span className={`mt-0.5 block text-[12px] leading-snug ${PAPER.muted}`}>
                        {d.summary}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
