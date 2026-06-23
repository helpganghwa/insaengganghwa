// 아바타 썸네일 얼굴 크롭 — AI 검수가 정면(south)에서 잡은 머리 박스(cx,cy,h, 0~1)로
// transform-origin·scale을 산출. 박스 없으면 폴백(풀프레임 v3 기준 46% 7%·scale 3.6).
// object-fit:cover 한 정사각 이미지 위에 적용(헤더·친구 썸네일 공용).
import type { CSSProperties } from 'react';

export type FaceBox = { cx: number; cy: number; h: number };

/** options.faceBox(unknown)를 안전 파싱. 형식 안 맞으면 null. */
export function parseFaceBox(v: unknown): FaceBox | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const cx = o.cx, cy = o.cy, h = o.h;
  if (typeof cx !== 'number' || typeof cy !== 'number' || typeof h !== 'number') return null;
  if (!(h > 0)) return null;
  return { cx, cy, h };
}

/** 얼굴이 썸네일에 들어오도록 transform-origin·scale 산출. 머리가 박스의 ~절반 차지하도록. */
export function faceCropStyle(box: FaceBox | null): CSSProperties {
  const cx = box?.cx ?? 0.46;
  const cy = box?.cy ?? 0.07;
  const hf = box?.h ?? 0.14;
  const scale = Math.min(5, Math.max(2.2, 0.5 / hf));
  return {
    imageRendering: 'pixelated',
    objectFit: 'cover',
    objectPosition: '50% 0%',
    transform: `scale(${scale.toFixed(2)})`,
    transformOrigin: `${(cx * 100).toFixed(1)}% ${(cy * 100).toFixed(1)}%`,
  };
}

/**
 * 대난투 챔피언 배경 스트립(가로형)용 — 정사각 헤더와 달리 세로로 눌린 영역이라,
 * 실제 박스의 얼굴 위치(cx/cy)는 쓰되 초점을 약간 내리고(가로 비율 보정) 줌을 완화한다.
 * 박스 없으면 v3 표준 머리 위치(cy 0.07) 가정 후 동일 보정 → 폴백도 일관.
 */
export function meleeFaceCropStyle(box: FaceBox | null): CSSProperties {
  const b = box ?? { cx: 0.5, cy: 0.07, h: 0.14 };
  // 가로 스트립은 object-cover가 정사각을 '너비'에 맞춰 크롭 → 얼굴의 화면상 세로위치는
  // 이미지 cy × 스트립 가로세로비(≈2.4)로 비례 확대된다. (정사각 헤더는 비 1.0이라 cy 그대로.)
  // 따라서 transform-origin Y는 cy를 '곱'으로 보정해야 아바타별 머리 위치가 정확히 중심에 옴.
  const screenCy = Math.min(0.9, b.cy * 2.4);
  return faceCropStyle({ cx: b.cx, cy: screenCy, h: Math.max(b.h, 0.3) });
}
