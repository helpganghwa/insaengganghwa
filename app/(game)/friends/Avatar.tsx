'use client';

import { faceCropStyle, type FaceBox } from '@/components/faceCrop';

/**
 * 유저 썸네일 — 활성 프로필 정면 + faceBox 크롭(얼굴 중심).
 * 친구 목록·레이드 초대 시트 등 유저를 나열하는 곳이 같은 크롭을 쓰도록 공용화(0146).
 */
export function Avatar({
  src,
  box,
  size = 'h-11 w-11',
}: {
  src: string | null;
  box?: FaceBox | null;
  size?: string;
}) {
  return (
    <div className={`relative ${size} shrink-0 overflow-hidden`}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          aria-hidden
          draggable={false}
          className="absolute inset-0 h-full w-full"
          style={faceCropStyle(box ?? null)}
        />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center text-xl">👤</span>
      )}
    </div>
  );
}
