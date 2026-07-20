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

/**
 * 얼굴이 썸네일 (50%, 44%)에 오도록 transform-origin을 역산(2026-07-21 수식 교체).
 * 이전 수식은 origin에 박스 좌표를 그대로 꽂아 "박스=머리 꼭대기"(옛 실루엣 감지)일 때만
 * 우연히 맞았다 — 비전 재감지로 박스가 정확한 "얼굴 중심"이 되면서 머리가 잘려(검증됨)
 * 목표점 고정 방식으로 교체. 스케일은 얼굴이 썸네일의 ~절반을 차지하도록.
 */
export function faceCropStyle(box: FaceBox | null): CSSProperties {
  // 폴백도 얼굴 "중심" 의미(v3 표준 머리 중심 근사).
  const cx = box?.cx ?? 0.5;
  const cy = box?.cy ?? 0.13;
  const hf = box?.h ?? 0.14;
  const s = Math.min(5, Math.max(2.2, 0.5 / hf));
  // 목표: 얼굴 중심이 썸네일 (0.5, 0.44)에 위치. screen = o + (p - o)·s 를 o에 대해 풀면:
  const ox = (0.5 - cx * s) / (1 - s);
  const oy = (0.44 - cy * s) / (1 - s);
  return {
    imageRendering: 'pixelated',
    objectFit: 'cover',
    objectPosition: '50% 0%',
    transform: `scale(${s.toFixed(2)})`,
    transformOrigin: `${(ox * 100).toFixed(1)}% ${(oy * 100).toFixed(1)}%`,
  };
}

/** (레거시) origin에 박스 좌표를 그대로 꽂는 옛 수식 — 대난투 스트립 전용(옛 데이터로 튜닝됨). */
function pinnedCropStyle(box: FaceBox): CSSProperties {
  const scale = Math.min(5, Math.max(2.2, 0.5 / box.h));
  return {
    imageRendering: 'pixelated',
    objectFit: 'cover',
    objectPosition: '50% 0%',
    transform: `scale(${scale.toFixed(2)})`,
    transformOrigin: `${(box.cx * 100).toFixed(1)}% ${(box.cy * 100).toFixed(1)}%`,
  };
}

/**
 * 대난투 챔피언 배경 스트립(가로형)용 — 정사각 헤더와 달리 세로로 눌린 영역이라,
 * 실제 박스의 얼굴 위치(cx/cy)는 쓰되 초점을 약간 내리고(가로 비율 보정) 줌을 완화한다.
 * 박스 없으면 v3 표준 머리 위치(cy 0.07) 가정 후 동일 보정 → 폴백도 일관.
 */
export function meleeFaceCropStyle(box: FaceBox | null): CSSProperties {
  // 가로 스트립은 object-cover가 정사각을 '너비'에 맞춰 크롭 → 얼굴의 화면상 세로위치는
  // 이미지 cy × 스트립 가로세로비(≈2.4)로 비례 확대된다. 박스가 AI 비전 기반(모자·뿔 무시,
  // 정확)일 때 cy를 곱 보정하면 아바타별 머리 위치가 정확히 중심에 온다.
  const b = box ?? { cx: 0.5, cy: 0.25, h: 0.2 };
  const screenCy = Math.min(0.9, b.cy * 1.8);
  return pinnedCropStyle({ cx: b.cx, cy: screenCy, h: Math.max(b.h, 0.3) });
}
