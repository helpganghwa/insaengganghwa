'use client';

import { useRef, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';

import { useResourceToast } from '@/components/ResourceToast';
import { INQUIRY_TYPES, BODY_MAX, type InquiryType } from '@/lib/game/support/types';
import { ZoomSafeTextarea } from '@/components/ui/ZoomSafeField';

const MAX_IMAGES = 3;

/**
 * 첨부 이미지 클라 압축 — 최대 1600px JPEG(q0.82). 폰 스크린샷 1~5MB → ~200~500KB로
 * 줄여 업로드 시간·서버 5MB 상한 여유 확보. 디코드 실패(HEIC 등)면 원본 그대로(서버가 재검증).
 */
async function compressImage(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob(res, 'image/jpeg', 0.82),
    );
    return blob ?? file;
  } catch {
    return file;
  }
}

/**
 * 고객센터 문의 — 인앱 접수 폼(외부 메일 X).
 * 유형 선택 + 내용 작성(+이미지 ≤3장, 0116) → 서버 저장 + 접수 안내 우편. 답변은 우편 + 앱 알림.
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
  // 첨부 — 압축 Blob + 미리보기 objectURL 쌍(제거 시 revoke).
  const [images, setImages] = useState<{ blob: Blob; preview: string }[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const clearImages = () => {
    setImages((cur) => {
      for (const im of cur) URL.revokeObjectURL(im.preview);
      return [];
    });
  };
  const reset = () => {
    setType(null);
    setBody('');
    setDone(false);
    clearImages();
  };
  const close = () => {
    setOpen(false);
    reset();
  };

  const addFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    const room = MAX_IMAGES - images.length;
    const picked = Array.from(list).slice(0, room);
    if (list.length > room) showError(`이미지는 최대 ${MAX_IMAGES}장까지 첨부할 수 있어요.`);
    const compressed = await Promise.all(picked.map(compressImage));
    setImages((cur) => [
      ...cur,
      ...compressed.map((blob) => ({ blob, preview: URL.createObjectURL(blob) })),
    ]);
    if (fileRef.current) fileRef.current.value = ''; // 같은 파일 재선택 허용
  };
  const removeImage = (i: number) => {
    setImages((cur) => {
      URL.revokeObjectURL(cur[i]!.preview);
      return cur.filter((_, j) => j !== i);
    });
  };

  const found = type ? INQUIRY_TYPES.find((t) => t.id === type) : undefined;
  const note = found && 'note' in found ? found.note : undefined;
  const canSubmit = !!type && body.trim().length >= 5 && !pending;

  const submit = () => {
    if (!canSubmit || !type) return;
    start(async () => {
      // 이미지 첨부 지원 — 라우트 핸들러(multipart). 서버 액션 바디 1MB 제한 회피.
      const fd = new FormData();
      fd.set('type', type);
      fd.set('body', body);
      for (const im of images) fd.append('images', im.blob, 'image.jpg');
      let r: { status?: string; message?: string };
      try {
        const res = await fetch('/api/support/inquiry', { method: 'POST', body: fd });
        r = (await res.json()) as { status?: string; message?: string };
      } catch {
        r = { status: 'error', message: '네트워크 오류가 발생했어요. 잠시 후 다시 시도해 주세요.' };
      }
      if (r.status !== 'success')
        return showError(r.message ?? '접수 중 오류가 발생했어요.');
      setDone(true);
      clearImages();
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
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
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
                    <ZoomSafeTextarea
                      value={body}
                      onChange={(e) => setBody(e.target.value.slice(0, BODY_MAX))}
                      placeholder={note ?? '문의 내용을 작성해 주세요.'}
                      wrapClassName="mt-2.5 h-[116px] w-full"
                      className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-500"
                    />
                    <div className="mt-0.5 flex items-center justify-between text-[10px] text-zinc-400">
                      <span>{note ? `* ${note}` : ' '}</span>
                      <span className="tabular-nums">
                        {body.trim().length}/{BODY_MAX}
                      </span>
                    </div>

                    {/* 이미지 첨부(선택, ≤3) — 썸네일 + 삭제. 자동 압축 후 접수와 함께 업로드. */}
                    <div className="mt-1.5 flex items-center gap-1.5">
                      {images.map((im, i) => (
                        <div key={im.preview} className="relative h-14 w-14 shrink-0">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={im.preview}
                            alt={`첨부 ${i + 1}`}
                            className="h-full w-full rounded-lg border border-zinc-200 object-cover dark:border-zinc-700"
                          />
                          <button
                            type="button"
                            onClick={() => removeImage(i)}
                            aria-label="첨부 삭제"
                            className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-zinc-800 text-[10px] font-bold text-white shadow dark:bg-zinc-200 dark:text-zinc-900"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                      {images.length < MAX_IMAGES ? (
                        <button
                          type="button"
                          onClick={() => fileRef.current?.click()}
                          className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-lg border border-dashed border-zinc-300 text-zinc-400 dark:border-zinc-700"
                        >
                          <span className="text-base leading-none">📷</span>
                          <span className="mt-0.5 text-[9px]">
                            {images.length}/{MAX_IMAGES}
                          </span>
                        </button>
                      ) : null}
                      <input
                        ref={fileRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(e) => void addFiles(e.target.files)}
                      />
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
