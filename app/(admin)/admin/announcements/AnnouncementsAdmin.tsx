'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { isoToKstLocalInput } from '@/lib/kst';
import {
  ANNOUNCEMENT_CATEGORIES,
  ANNOUNCEMENT_CATEGORY_LABEL,
  type AnnouncementPoll,
  type AnnouncementView,
} from '@/lib/game/announcement-shared';
import type { PollResults } from '@/lib/game/announcement';

import {
  saveAnnouncementAction,
  deleteAnnouncementAction,
  getPollResultsAction,
  uploadAnnouncementImageAction,
} from './actions';
import { AnnouncementPreview } from './AnnouncementPreview';

type Draft = {
  id?: string;
  category: string;
  serverId: number | null;
  title: string;
  body: string;
  pinned: boolean;
  poll: AnnouncementPoll | null;
  /** 예약 발행 — `YYYY-MM-DDTHH:mm`(KST 벽시계), ''=예약 없음. */
  scheduledAt: string;
};

const EMPTY: Draft = {
  category: 'notice',
  serverId: null,
  title: '',
  body: '',
  pinned: false,
  poll: null,
  scheduledAt: '',
};
const genId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
/** datetime-local(로컬시각) ↔ ISO 변환 — 마감일 입력용. */
const isoToLocal = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const localToIso = (local: string) => (local ? new Date(local).toISOString() : null);
/** 예약 배지 표기 — `8/24 11:00`(KST). 입력·표시 모두 KST 고정(§3.8). */
const kstBadge = (iso: string) => {
  const [date, time] = isoToKstLocalInput(iso).split('T');
  const [, m, d] = date!.split('-');
  return `${Number(m)}/${Number(d)} ${time}`;
};

export function AnnouncementsAdmin({ items, serverIds }: { items: AnnouncementView[]; serverIds: number[] }) {
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
    setDraft({
      id: a.id,
      category: a.category,
      serverId: a.serverId ?? null,
      title: a.title,
      body: a.body,
      pinned: a.pinned,
      poll: a.poll,
      scheduledAt: a.scheduledAtIso ? isoToKstLocalInput(a.scheduledAtIso) : '',
    });

  // ── 이미지 첨부 ── 업로드 후 본문 커서 위치에 `![](URL)` 한 줄 삽입.
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const insertImage = (url: string) => {
    const md = `![](${url})`;
    setDraft((d) => {
      const el = bodyRef.current;
      // 커서 위치 삽입(없으면 끝) — 이미지는 블록 문법이라 앞뒤 줄바꿈을 보장한다.
      const pos = el ? el.selectionStart : d.body.length;
      const before = d.body.slice(0, pos);
      const after = d.body.slice(pos);
      const lead = before && !before.endsWith('\n') ? '\n' : '';
      const tail = after && !after.startsWith('\n') ? '\n' : '';
      return { ...d, body: `${before}${lead}${md}\n${tail}${after}` };
    });
  };

  const pickImage = async (file: File) => {
    setErr(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.set('file', file);
      const r = await uploadAnnouncementImageAction(fd);
      if (r.status === 'success') insertImage(r.url);
      else setErr(r.message);
    } catch {
      setErr('업로드에 실패했어요. 파일 크기(5MB 이하)를 확인해 주세요.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = ''; // 같은 파일 재선택 허용
    }
  };

  // ── 투표 빌더 헬퍼 ──
  const setPoll = (fn: (p: AnnouncementPoll) => AnnouncementPoll) =>
    setDraft((d) => ({ ...d, poll: d.poll ? fn(d.poll) : d.poll }));
  const addPoll = () =>
    setDraft((d) => ({
      ...d,
      poll: d.poll ?? {
        question: '',
        options: [
          { id: genId(), label: '' },
          { id: genId(), label: '' },
        ],
        closesAtIso: null,
      },
    }));
  const removePoll = () => setDraft((d) => ({ ...d, poll: null }));

  // ── 결과 열람(관리자만) ──
  const [results, setResults] = useState<{ id: string; data: PollResults } | null>(null);
  const showResults = (a: AnnouncementView) => {
    setResults(null);
    setErr(null);
    start(async () => {
      const r = await getPollResultsAction(a.id);
      if (r.status === 'success') setResults({ id: a.id, data: r.data });
      else setErr(r.message);
    });
  };
  const labelOf = (poll: AnnouncementPoll | null, optId: string) =>
    poll?.options.find((o) => o.id === optId)?.label ?? optId;

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
          {/* 대상 서버(2026-08-07) — 전서버 또는 특정 서버에만 노출. */}
          <select
            value={draft.serverId == null ? 'all' : String(draft.serverId)}
            onChange={(e) =>
              setDraft((d) => ({ ...d, serverId: e.target.value === 'all' ? null : Number(e.target.value) }))
            }
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs"
          >
            <option value="all">전서버</option>
            {serverIds.map((sid) => (
              <option key={sid} value={String(sid)}>
                {sid}서버
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
          ref={bodyRef}
          value={draft.body}
          onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
          placeholder="내용 (마크다운: ## 제목, - 목록, **굵게**, | 표 |, ![](이미지))"
          rows={8}
          className={`${input} w-full resize-y font-mono text-base`}
        />
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void pickImage(f);
            }}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading || pending}
            className="rounded-lg border border-zinc-300 px-2.5 py-1 text-[12px] font-semibold text-zinc-600 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300"
          >
            {uploading ? '업로드 중…' : '🖼 이미지 첨부'}
          </button>
          <span className="text-[11px] text-zinc-400">
            PNG/JPEG/WebP/GIF · 5MB 이하 · 본문 커서 위치에 삽입
          </span>
        </div>
        <label className="flex items-center gap-2 text-[13px] text-zinc-600 dark:text-zinc-300">
          <input
            type="checkbox"
            checked={draft.pinned}
            onChange={(e) => setDraft((d) => ({ ...d, pinned: e.target.checked }))}
          />
          상단 고정
        </label>

        {/* 예약 발행(0158) — 입력·표시 모두 KST. 도래하면 5분 주기 크론이 발행으로 전환. */}
        <div className="rounded-lg border border-zinc-200 p-2.5 dark:border-zinc-800">
          <label className="flex flex-wrap items-center gap-2 text-[13px] text-zinc-600 dark:text-zinc-300">
            ⏰ 예약 발행 시각(KST)
            <input
              type="datetime-local"
              value={draft.scheduledAt}
              onChange={(e) => setDraft((d) => ({ ...d, scheduledAt: e.target.value }))}
              className={`${input} text-[13px]`}
            />
            {draft.scheduledAt && (
              <button
                type="button"
                onClick={() => setDraft((d) => ({ ...d, scheduledAt: '' }))}
                className="text-[11px] text-zinc-400 underline"
              >
                예약 해제
              </button>
            )}
          </label>
          <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-400">
            {draft.scheduledAt
              ? '예약이 설정되어 있습니다 — 아래 「초안 저장」으로 저장하세요. 그 시각(±5분)에 크론이 자동 발행합니다. 지금 「발행」을 누르면 예약은 취소되고 즉시 발행됩니다.'
              : '비워두면 예약 없음(직접 「발행」해야 노출). 예약과 즉시 발행은 함께 쓸 수 없습니다.'}
          </p>
        </div>

        {/* 투표(선택) — 결과·투표자는 관리자만 열람(유저는 투표만). */}
        <div className="rounded-lg border border-zinc-200 p-2.5 dark:border-zinc-800">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-semibold">🗳️ 투표{draft.poll ? '' : ' (없음)'}</span>
            {draft.poll ? (
              <button type="button" onClick={removePoll} className="text-[11px] font-semibold text-red-500">
                투표 제거
              </button>
            ) : (
              <button type="button" onClick={addPoll} className="text-[11px] font-semibold text-amber-600">
                + 투표 추가
              </button>
            )}
          </div>
          {draft.poll && (
            <div className="mt-2 space-y-2">
              <p className="text-[10px] leading-relaxed text-zinc-400">
                기본은 본문 아래 블록으로 표시됩니다. 본문에 <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">{'{{투표1}}'}</code>
                처럼 쓰면 그 위치에 해당 번호의 선택지 버튼이 들어갑니다(설명→투표→설명→투표 흐름).
                마커 사용 시 질문은 표시되지 않으니 본문에 직접 적어주세요.
                각 보기 왼쪽의 숫자는 <b>질문 그룹</b> — 같은 번호끼리 1인 1표(한 공지에 설문 여러 개 가능).
              </p>
              <input
                value={draft.poll.question}
                onChange={(e) => setPoll((p) => ({ ...p, question: e.target.value }))}
                placeholder="투표 질문"
                className={`${input} w-full`}
              />
              <div className="space-y-1.5">
                {draft.poll.options.map((o, i, arr) => (
                  <div key={o.id} className="flex gap-1.5">
                    {/* 질문 그룹(0137) — 같은 번호끼리 1인 1표(한 공지 다중 설문). 기본 1. */}
                    <input
                      value={String(o.q ?? 1)}
                      onChange={(e) =>
                        setPoll((p) => ({
                          ...p,
                          options: p.options.map((x) =>
                            x.id === o.id ? { ...x, q: Math.max(1, parseInt(e.target.value, 10) || 1) } : x,
                          ),
                        }))
                      }
                      inputMode="numeric"
                      title="질문 그룹 번호 — 같은 번호끼리 1인 1표"
                      className={`${input} w-11 shrink-0 text-center`}
                    />
                    <input
                      value={o.label}
                      onChange={(e) =>
                        setPoll((p) => ({
                          ...p,
                          options: p.options.map((x) => (x.id === o.id ? { ...x, label: e.target.value } : x)),
                        }))
                      }
                      placeholder={`보기 ${i + 1}`}
                      className={`${input} min-w-0 flex-1`}
                    />
                    <button
                      type="button"
                      onClick={() => setPoll((p) => ({ ...p, options: p.options.filter((x) => x.id !== o.id) }))}
                      disabled={arr.length <= 2}
                      className="shrink-0 rounded-md border border-zinc-300 px-2.5 text-[15px] text-zinc-500 disabled:opacity-40 dark:border-zinc-700"
                    >
                      −
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setPoll((p) => ({ ...p, options: [...p.options, { id: genId(), label: '' }] }))}
                className="text-[11px] font-semibold text-amber-600"
              >
                + 보기 추가
              </button>
              <label className="flex flex-wrap items-center gap-2 text-[12px] text-zinc-600 dark:text-zinc-300">
                마감일(선택)
                <input
                  type="datetime-local"
                  value={isoToLocal(draft.poll.closesAtIso)}
                  onChange={(e) => setPoll((p) => ({ ...p, closesAtIso: localToIso(e.target.value) }))}
                  className={`${input} text-[13px]`}
                />
                {draft.poll.closesAtIso && (
                  <button
                    type="button"
                    onClick={() => setPoll((p) => ({ ...p, closesAtIso: null }))}
                    className="text-[11px] text-zinc-400 underline"
                  >
                    마감 없앰
                  </button>
                )}
              </label>
              <p className="text-[11px] text-zinc-400">결과·투표자는 관리자만 열람합니다(유저는 투표만).</p>
            </div>
          )}
        </div>

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
              <li key={a.id} className="py-2">
                <div className="flex items-center gap-2">
                  <span className="shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-bold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                    {ANNOUNCEMENT_CATEGORY_LABEL[a.category] ?? a.category}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px]">
                    {a.pinned && <span className="mr-1 text-amber-500">📌</span>}
                    {a.poll && <span className="mr-1" title="투표 있음">🗳️</span>}
                    {a.title}
                  </span>
                  {/* 예약 대기 배지 — 발행 전 상태를 목록에서 바로 구분(초안 vs 예약). */}
                  {a.scheduledAtIso && !a.publishedAtIso && (
                    <span
                      className="shrink-0 rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-bold text-sky-600 dark:text-sky-400"
                      title="예약 발행 대기(KST)"
                    >
                      예약 {kstBadge(a.scheduledAtIso)}
                    </span>
                  )}
                  <span
                    className={`shrink-0 text-[10px] font-bold ${a.publishedAtIso ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400'}`}
                  >
                    {a.publishedAtIso ? '발행' : '초안'}
                  </span>
                  {a.poll && (
                    <button
                      type="button"
                      onClick={() => showResults(a)}
                      disabled={pending}
                      className="shrink-0 rounded-md border border-amber-300 px-2 py-0.5 text-[11px] font-semibold text-amber-600 disabled:opacity-50 dark:border-amber-800/60"
                    >
                      결과
                    </button>
                  )}
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
                </div>

                {/* 투표 결과·투표자(관리자만) — '결과' 클릭 시 인라인 표시. */}
                {results?.id === a.id && (
                  <div className="mt-2 rounded-lg bg-zinc-50 p-2.5 text-[12px] dark:bg-zinc-900">
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="font-bold">투표 결과 · 총 {results.data.total}표</span>
                      <button type="button" onClick={() => setResults(null)} className="text-[11px] text-zinc-400">
                        닫기
                      </button>
                    </div>
                    <ul className="mb-2 space-y-0.5">
                      {a.poll?.options.map((o) => {
                        const n = results.data.counts[o.id] ?? 0;
                        const pct = results.data.total ? Math.round((n / results.data.total) * 100) : 0;
                        return (
                          <li key={o.id} className="flex items-center gap-2">
                            <span className="min-w-0 flex-1 truncate">{o.label}</span>
                            <span className="shrink-0 tabular-nums text-zinc-500">
                              {n}표 · {pct}%
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                    <div className="border-t border-zinc-200 pt-1.5 dark:border-zinc-800">
                      <div className="mb-1 text-[11px] font-semibold text-zinc-500">투표자 ({results.data.voters.length})</div>
                      {results.data.voters.length === 0 ? (
                        <p className="text-[11px] text-zinc-400">아직 투표가 없습니다.</p>
                      ) : (
                        <ul className="max-h-40 space-y-0.5 overflow-y-auto">
                          {results.data.voters.map((v, i) => (
                            <li key={i} className="flex items-center gap-2 text-[11px]">
                              <span className="min-w-0 flex-1 truncate">{v.nickname}</span>
                              <span className="shrink-0 text-zinc-500">{labelOf(a.poll, v.optionId)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
