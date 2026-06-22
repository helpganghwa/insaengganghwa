'use client';

const CHECKER = {
  backgroundImage:
    'linear-gradient(45deg,#222 25%,transparent 25%),linear-gradient(-45deg,#222 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#222 75%),linear-gradient(-45deg,transparent 75%,#222 75%)',
  backgroundSize: '16px 16px',
  backgroundPosition: '0 0,0 8px,8px -8px,-8px 0',
} as const;

/**
 * 생성 내역 검토용 — 가로 꽉 채운 1:1 아바타 뷰어(정면 정적, 회전 미사용 2026-06-22).
 * south 우선, 없으면 첫 가용 방향(구 8방향 건 호환).
 */
export function AdminAvatarViewer({ rotations }: { rotations: Record<string, string> }) {
  const src = rotations.south ?? Object.values(rotations)[0] ?? '';

  if (!src) {
    return (
      <div
        className="flex aspect-square w-full items-center justify-center rounded-xl text-sm text-zinc-600"
        style={CHECKER}
      >
        이미지 없음
      </div>
    );
  }

  return (
    <div
      className="relative w-full select-none overflow-hidden rounded-xl"
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
    </div>
  );
}
