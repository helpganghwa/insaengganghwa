'use client';

import { useEffect, useState } from 'react';

import { ModalShell } from '@/components/ModalShell';

const CHECKER = {
  backgroundImage:
    'linear-gradient(45deg,#222 25%,transparent 25%),linear-gradient(-45deg,#222 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#222 75%),linear-gradient(-45deg,transparent 75%,#222 75%)',
  backgroundSize: '16px 16px',
  backgroundPosition: '0 0,0 8px,8px -8px,-8px 0',
} as const;

/**
 * 생성 내역 검토용 — 가로 꽉 채운 1:1 아바타 뷰어(정면 정적, 회전 미사용 2026-06-22).
 * south 우선, 없으면 첫 가용 방향(구 8방향 건 호환). 이미지 클릭 시 확대 팝업(픽셀 디테일 검수).
 */
export function AdminAvatarViewer({
  rotations,
  lazyJobId,
}: {
  rotations: Record<string, string>;
  /** 저장 이미지가 없는 잡 — 마운트 후 Pixellab 회전을 지연 조회(페이지 진입을 막지 않음). */
  lazyJobId?: string;
}) {
  const [lazy, setLazy] = useState<Record<string, string> | null>(null);
  const [lazyDone, setLazyDone] = useState(false);
  useEffect(() => {
    if (!lazyJobId) return;
    let alive = true;
    void fetch(`/api/admin/pixellab-rotations?job=${lazyJobId}`, { cache: 'no-store' })
      .then(async (r) => (r.ok ? ((await r.json()) as { rotations: Record<string, string> }) : null))
      .then((d) => {
        if (!alive) return;
        setLazy(d?.rotations ?? {});
        setLazyDone(true);
      })
      .catch(() => {
        if (alive) setLazyDone(true);
      });
    return () => {
      alive = false;
    };
  }, [lazyJobId]);

  const merged = Object.keys(rotations).length ? rotations : (lazy ?? {});
  const src = merged.south ?? Object.values(merged)[0] ?? '';
  const [zoom, setZoom] = useState(false);

  if (!src) {
    return (
      <div
        className="flex aspect-square w-full items-center justify-center rounded-xl text-sm text-zinc-600"
        style={CHECKER}
      >
        {lazyJobId && !lazyDone ? '이미지 불러오는 중…' : '이미지 없음'}
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setZoom(true)}
        aria-label="아바타 확대"
        className="group relative block w-full cursor-zoom-in select-none overflow-hidden rounded-xl"
        style={{ aspectRatio: '1 / 1', ...CHECKER }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt="아바타 정면"
          draggable={false}
          className="absolute inset-0 h-full w-full object-contain"
          style={{ imageRendering: 'pixelated' }}
        />
        <span className="absolute bottom-1.5 right-1.5 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold text-white opacity-80 transition group-hover:opacity-100">
          🔍 확대
        </span>
      </button>

      {zoom && (
        <ModalShell
          onClose={() => setZoom(false)}
          label="아바타 확대"
          className="w-[min(92vw,92vh)] max-w-[640px]"
        >
          <div
            className="relative w-full overflow-hidden rounded-2xl"
            style={{ aspectRatio: '1 / 1', ...CHECKER }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt="아바타 확대"
              draggable={false}
              className="absolute inset-0 h-full w-full object-contain"
              style={{ imageRendering: 'pixelated' }}
            />
            <button
              type="button"
              onClick={() => setZoom(false)}
              className="absolute right-2 top-2 rounded-full bg-black/60 px-2.5 py-1 text-[12px] font-semibold text-white"
            >
              닫기
            </button>
          </div>
        </ModalShell>
      )}
    </>
  );
}
