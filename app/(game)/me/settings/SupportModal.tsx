'use client';

import { useState, useTransition } from 'react';
import { createPortal } from 'react-dom';

import { useResourceToast } from '@/components/ResourceToast';
import { INQUIRY_TYPES, BODY_MAX, type InquiryType } from '@/lib/game/support/types';

import { submitInquiryAction } from './support-actions';

/**
 * 고객센터 문의 — 인앱 접수 폼(외부 메일 X).
 * 유형 선택 + 내용 작성 → 서버 저장 + 접수 안내 우편. 답변은 우편 + 앱 알림으로 도착.
 */
export function SupportModal({
  nickname,
  publicCode,
  serverName,
}: {
  nickname: string;
  publicCode: string;
  serverName: string;
}) {
  const { showError } = useResourceToast();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<InquiryType | null>(null);
  const [body, setBody] = useState('');
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  const reset = () => {
    setType(null);
    setBody('');
    setDone(false);
  };
  const close = () => {
    setOpen(false);
    reset();
  };

  const found = type ? INQUIRY_TYPES.find((t) => t.id === type) : undefined;
  const note = found && 'note' in found ? found.note : undefined;
  const canSubmit = !!type && body.trim().length >= 5 && !pending;

  const submit = () => {
    if (!canSubmit || !type) return;
    start(async () => {
      const r = await submitInquiryAction(type, body);
      if (r.status !== 'success') return showError(r.message);
      setDone(true);
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center px-3 py-2.5 text-left"
      >
        <span className="text-sm">고객센터 문의</span>
      </button>

      {open
        ? createPortal(
            <div
              className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
              onClick={close}
            >
              <div
                className="w-full max-w-[360px] rounded-2xl border border-zinc-200 bg-white p-4 shadow-xl dark:border-zinc-800 dark:bg-zinc-950"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="mb-1 flex items-center justify-between">
                  <h3 className="text-base font-bold">고객센터 문의</h3>
                  <button
                    type="button"
                    onClick={close}
                    aria-label="닫기"
                    className="text-zinc-400 hover:text-zinc-600"
                  >
                    ✕
                  </button>
                </div>

                {done ? (
                  <div className="py-4 text-center">
                    <div className="text-3xl">📨</div>
                    <p className="mt-2 text-sm font-semibold">문의가 접수되었어요</p>
                    <p className="mt-1 text-[12px] leading-relaxed text-zinc-500">
                      담당자가 확인 후 <b>우편함</b>으로 답변을 보내드릴게요. 답변이 도착하면 앱
                      알림으로 알려드립니다.
                    </p>
                    <button
                      type="button"
                      onClick={close}
                      className="mt-4 w-full rounded-lg bg-zinc-900 py-2.5 text-sm font-bold text-white active:opacity-90 dark:bg-zinc-100 dark:text-zinc-900"
                    >
                      확인
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="text-[11px] leading-relaxed text-zinc-500">
                      {nickname}{' '}
                      <span className="tabular-nums text-zinc-400">(#{publicCode})</span> ·{' '}
                      {serverName} · 유형을 고르고 내용을 작성해 주세요.
                    </p>

                    {/* 유형 선택 */}
                    <div className="mt-2.5 grid grid-cols-2 gap-1.5">
                      {INQUIRY_TYPES.map((t) => {
                        const on = type === t.id;
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => setType(t.id)}
                            className={`rounded-xl border px-2.5 py-2 text-left transition active:scale-[0.99] ${
                              on
                                ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/30'
                                : 'border-zinc-200 dark:border-zinc-800'
                            }`}
                          >
                            <div className="text-[13px] font-bold">{t.label}</div>
                            <div className="mt-0.5 text-[10px] text-zinc-500">{t.desc}</div>
                          </button>
                        );
                      })}
                    </div>

                    {/* 내용 */}
                    <textarea
                      value={body}
                      onChange={(e) => setBody(e.target.value.slice(0, BODY_MAX))}
                      rows={5}
                      placeholder={note ?? '문의 내용을 작성해 주세요.'}
                      className="mt-2.5 w-full resize-none rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-[13px] outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-500"
                    />
                    <div className="mt-0.5 flex items-center justify-between text-[10px] text-zinc-400">
                      <span>{note ? `* ${note}` : ' '}</span>
                      <span className="tabular-nums">
                        {body.trim().length}/{BODY_MAX}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={submit}
                      disabled={!canSubmit}
                      className="mt-2 w-full rounded-lg bg-amber-600 py-2.5 text-sm font-bold text-white active:opacity-90 disabled:opacity-40"
                    >
                      {pending ? '접수 중…' : '문의 접수'}
                    </button>
                  </>
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
