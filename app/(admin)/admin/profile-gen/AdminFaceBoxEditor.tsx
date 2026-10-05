'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';

import { ModalShell } from '@/components/ModalShell';
import { faceCropStyle, parseFaceBox, type FaceBox } from '@/components/faceCrop';

import { adminSaveFaceBox } from './actions';

/** 폴백 박스 — faceCropStyle의 박스 없음 폴백과 같은 값(얼굴 중심 의미). */
const FALLBACK: FaceBox = { cx: 0.5, cy: 0.13, h: 0.14 };

/** 앱과 같은 크롭으로 그린 얼굴 썸네일(검수 카드·미리보기 공용). */
function FaceThumb({ src, box, size, round }: { src: string; box: FaceBox; size: number; round?: boolean }) {
  return (
    <div
      className={`relative shrink-0 overflow-hidden bg-zinc-800 ${round ? 'rounded-full' : 'rounded-lg'}`}
      style={{ width: size, height: size }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" draggable={false} className="absolute inset-0 h-full w-full" style={faceCropStyle(box)} />
    </div>
  );
}

/**
 * 얼굴 위치 조정(2026-10-05, 운영자 전용) — 검수 카드에 앱 썸네일을 띄우고, 어긋났으면 전신 위 박스를 끌어 맞춰 저장한다.
 * 박스 = 가운데 +가 얼굴 중심(cx·cy), 한 변이 머리 높이(h). 저장하면 faceBox와 얼굴 썸네일 이미지가 바뀐다.
 */
export function AdminFaceBoxEditor({ profileId, south, faceBox }: { profileId: string; south: string; faceBox: unknown }) {
  const [saved, setSaved] = useState<FaceBox>(() => parseFaceBox(faceBox) ?? FALLBACK);
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState('');
  return (
    <div className="mt-2 flex items-center gap-2">
      <FaceThumb src={south} box={saved} size={48} round />
      <div className="min-w-0">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-md border border-zinc-600 px-2 py-1 text-[11px] font-bold text-zinc-200"
        >
          얼굴 위치 조정
        </button>
        {msg ? <p className="mt-0.5 text-[10px] text-emerald-400">{msg}</p> : null}
      </div>
      {open && (
        <FaceBoxDialog
          profileId={profileId}
          south={south}
          initial={saved}
          onClose={() => setOpen(false)}
          onSaved={(b) => {
            setSaved(b);
            setMsg('저장됨 · 썸네일 갱신');
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

function FaceBoxDialog({
  profileId,
  south,
  initial,
  onClose,
  onSaved,
}: {
  profileId: string;
  south: string;
  initial: FaceBox;
  onClose: () => void;
  onSaved: (b: FaceBox) => void;
}) {
  const [box, setBox] = useState<FaceBox>(initial);
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();
  const stageRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ mode: 'move' | 'size'; x: number; y: number; start: FaceBox } | null>(null);

  const begin = (mode: 'move' | 'size', e: React.PointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { mode, x: e.clientX, y: e.clientY, start: box };
  };
  const onMove = useCallback((e: React.PointerEvent) => {
    const d = drag.current;
    const W = stageRef.current?.clientWidth;
    if (!d || !W) return;
    const dx = (e.clientX - d.x) / W;
    const dy = (e.clientY - d.y) / W;
    const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
    setBox(
      d.mode === 'move'
        ? { ...d.start, cx: clamp(d.start.cx + dx, 0, 1), cy: clamp(d.start.cy + dy, 0, 1) }
        : { ...d.start, h: clamp(d.start.h + Math.max(dx, dy) * 2, 0.06, 0.3) },
    );
  }, []);
  const onUp = () => {
    drag.current = null;
  };

  // 키보드 미세 조정 — 방향키 0.005, Shift+방향키는 크기.
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const step = 0.005;
      const map: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      const v = map[e.key];
      if (!v) return;
      e.preventDefault();
      setBox((b) =>
        e.shiftKey
          ? { ...b, h: Math.min(0.3, Math.max(0.06, b.h + (v[0] || -v[1]))) }
          : { ...b, cx: Math.min(1, Math.max(0, b.cx + v[0])), cy: Math.min(1, Math.max(0, b.cy + v[1])) },
      );
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  const save = () =>
    start(async () => {
      setErr('');
      const r = await adminSaveFaceBox(profileId, box);
      if (r.ok) onSaved(box);
      else setErr(r.msg ?? '저장하지 못했습니다.');
    });

  return (
    <ModalShell onClose={onClose} label="얼굴 위치 조정" className="w-[min(94vw,760px)]">
      <div className="rounded-2xl bg-zinc-900 text-zinc-100">
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <b className="text-sm">얼굴 위치 조정</b>
          <button type="button" onClick={onClose} className="rounded-md border border-zinc-700 px-2 py-1 text-xs">
            닫기
          </button>
        </div>
        <div className="flex flex-wrap gap-4 p-4">
          <div
            ref={stageRef}
            className="relative aspect-square w-full max-w-[384px] touch-none select-none overflow-hidden rounded-xl bg-zinc-700"
            onPointerMove={onMove}
            onPointerUp={onUp}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={south} alt="전신" draggable={false} className="pointer-events-none absolute inset-0 h-full w-full" style={{ imageRendering: 'pixelated' }} />
            <div
              role="presentation"
              onPointerDown={(e) => begin('move', e)}
              className="absolute cursor-move border-2 border-red-500 shadow-[0_0_0_1px_rgba(0,0,0,.4)]"
              style={{
                width: `${box.h * 100}%`,
                height: `${box.h * 100}%`,
                left: `${(box.cx - box.h / 2) * 100}%`,
                top: `${(box.cy - box.h / 2) * 100}%`,
              }}
            >
              <span className="pointer-events-none absolute left-1/2 top-1/2 h-2.5 w-0.5 -translate-x-1/2 -translate-y-1/2 bg-red-500" />
              <span className="pointer-events-none absolute left-1/2 top-1/2 h-0.5 w-2.5 -translate-x-1/2 -translate-y-1/2 bg-red-500" />
              <span
                role="presentation"
                onPointerDown={(e) => begin('size', e)}
                className="absolute -bottom-2 -right-2 h-3.5 w-3.5 cursor-nwse-resize rounded-sm border-2 border-white bg-red-500"
              />
            </div>
          </div>
          <div className="flex min-w-[200px] flex-1 flex-col gap-3 text-xs">
            <p className="text-zinc-400">
              박스 가운데 <b className="text-zinc-200">+</b>를 두 눈 사이에, 박스 크기를 머리카락 꼭대기부터 턱까지(왕관·모자·귀 같은 장식 제외)에 맞춰 주세요. 방향키로 미세 이동, Shift+방향키로 크기 조절.
            </p>
            <div className="flex items-end gap-4">
              <div className="space-y-1">
                <FaceThumb src={south} box={box} size={96} />
                <p className="text-[10px] text-zinc-500">프로필 썸네일</p>
              </div>
              <div className="space-y-1">
                <FaceThumb src={south} box={box} size={40} round />
                <p className="text-[10px] text-zinc-500">헤더·친구</p>
              </div>
            </div>
            <p className="font-mono text-[11px] tabular-nums text-zinc-500">
              cx {box.cx.toFixed(3)} · cy {box.cy.toFixed(3)} · h {box.h.toFixed(3)}
            </p>
            <div>
              <button type="button" onClick={() => setBox(initial)} className="rounded-md border border-zinc-700 px-2 py-1">
                처음 값으로
              </button>
            </div>
            {err ? <p className="text-red-400">✗ {err}</p> : null}
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-zinc-800 px-4 py-3">
          <button type="button" onClick={onClose} className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs">
            취소
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={save}
            className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
          >
            {pending ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
