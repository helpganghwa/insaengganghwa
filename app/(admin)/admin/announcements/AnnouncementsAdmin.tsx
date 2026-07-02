'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import {
  ANNOUNCEMENT_CATEGORIES,
  ANNOUNCEMENT_CATEGORY_LABEL,
  type AnnouncementView,
} from '@/lib/game/announcement-shared';

import { saveAnnouncementAction, deleteAnnouncementAction } from './actions';
import { AnnouncementPreview } from './AnnouncementPreview';

type Draft = {
  id?: string;
  category: string;
  title: string;
  body: string;
  pinned: boolean;
};

const EMPTY: Draft = { category: 'notice', title: '', body: '', pinned: false };

export function AnnouncementsAdmin({ items }: { items: AnnouncementView[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [err, setErr] = useState<string | null>(null);
  const editing = !!draft.id;

  const save = (publish: boolean) => {
    setErr(null);
    start(async () => {
      const r = await saveAnnouncementAction({ ...draft, publish });
      if (r.status !== 'success') {
        setErr(r.message);
        return;
      }
      setDraft(EMPTY);
      router.refresh();
    });
  };

  const edit = (a: AnnouncementView) =>
    setDraft({ id: a.id, category: a.category, title: a.title, body: a.body, pinned: a.pinned });

  const del = (id: string) => {
    if (!confirm('이 공지를 삭제할까요?')) return;
    start(async () => {
      await deleteAnnouncementAction(id);
      if (draft.id === id) setDraft(EMPTY);
      router.refresh();
    });
  };

  const input =
    'rounded-lg border border-zinc-300 bg-white px-2.5 py-2 text-base outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900';

  return (
    <div className="space-y-4">
      {/* 작성/수정 폼 */}
      <section className="space-y-2 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold">{editing ? '공지 수정' : '새 공지'}</h2>
          {editing && (
            <button type="button" onClick={() => setDraft(EMPTY)} className="text-xs text-zinc-500">
              새 글로
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <select
            value={draft.category}
            onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
            className={`${input} w-28 shrink-0`}
          >
            {ANNOUNCEMENT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {ANNOUNCEMENT_CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
          <input
            value={draft.title}
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            placeholder="제목"
            className={`${input} min-w-0 flex-1`}
          />
        </div>
        <textarea
          value={draft.body}
          onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
          placeholder="내용 (마크다운: ## 제목, - 목록, **굵게**, | 표 |)"
          rows={8}
          className={`${input} w-full resize-y font-mono text-base`}
        />
        <label className="flex items-center gap-2 text-[13px] text-zinc-600 dark:text-zinc-300">
          <input
            type="checkbox"
            checked={draft.pinned}
            onChange={(e) => setDraft((d) => ({ ...d, pinned: e.target.checked }))}
          />
          상단 고정
        </label>
        {err && <p className="text-[12px] text-red-500">{err}</p>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => save(false)}
            disabled={pending}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-[13px] font-semibold text-zinc-600 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300"
          >
            초안 저장
          </button>
          <button
            type="button"
            onClick={() => save(true)}
            disabled={pending}
            className="rounded-lg bg-amber-600 px-3.5 py-1.5 text-[13px] font-bold text-white disabled:opacity-50"
          >
            발행
          </button>
        </div>
      </section>

      {/* 실시간 미리보기 — 유저 게시판 화면 그대로 */}
      <AnnouncementPreview
        category={draft.category}
        title={draft.title}
        body={draft.body}
        pinned={draft.pinned}
      />

      {/* 목록 */}
      <section className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="mb-2 text-sm font-bold">전체 ({items.length})</h2>
        {items.length === 0 ? (
          <p className="py-3 text-center text-[12px] text-zinc-400">작성된 공지가 없습니다.</p>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-900">
            {items.map((a) => (
              <li key={a.id} className="flex items-center gap-2 py-2">
                <span className="shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-bold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                  {ANNOUNCEMENT_CATEGORY_LABEL[a.category] ?? a.category}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px]">
                  {a.pinned && <span className="mr-1 text-amber-500">📌</span>}
                  {a.title}
                </span>
                <span
                  className={`shrink-0 text-[10px] font-bold ${a.publishedAtIso ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400'}`}
                >
                  {a.publishedAtIso ? '발행' : '초안'}
                </span>
                <button
                  type="button"
                  onClick={() => edit(a)}
                  disabled={pending}
                  className="shrink-0 rounded-md border border-zinc-300 px-2 py-0.5 text-[11px] font-semibold text-zinc-600 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300"
                >
                  수정
                </button>
                <button
                  type="button"
                  onClick={() => del(a.id)}
                  disabled={pending}
                  className="shrink-0 rounded-md border border-red-300 px-2 py-0.5 text-[11px] font-semibold text-red-500 disabled:opacity-50 dark:border-red-900/60"
                >
                  삭제
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
