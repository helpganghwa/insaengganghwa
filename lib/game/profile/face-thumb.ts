import 'server-only';

import sharp from 'sharp';

import type { FaceBox } from '@/components/faceCrop';

/**
 * 얼굴 썸네일 서버 사전 생성(2026-08-25) — 채팅 등 소형 썸네일의 흐림 해결.
 *
 * 기존엔 클라이언트가 원본 south.png(256px)를 CSS transform scale(2.2~5배)로 확대해
 * 얼굴을 잘라 보였는데, ① 얼굴이 작은 아바타일수록 확대 배율이 커져 원본 픽셀이 모자라고
 * ② iOS Safari 등은 transform 합성 확대에서 image-rendering:pixelated를 무시하고
 * 부드러운 보간을 해 흐릿해졌다. 여기서 nearest-neighbor로 미리 확대한 96px 썸네일을
 * 만들어 저장하면 클라이언트는 확대 없이 표시만 한다(3배율 화면의 32px 박스까지 무손실).
 *
 * 프레이밍은 components/faceCrop.ts faceCropStyle과 동일해야 한다(썸네일 교체 시 화면상
 * 구도가 튀지 않게): 배율 s = clamp(0.5/h, 2.2, 5), 보이는 영역 = 원본의 1/s,
 * 얼굴 중심이 결과의 (50%, 44%)에 오도록 크롭.
 */
export const FACE_THUMB_SIZE = 96;

export async function renderFaceThumb(png: Buffer, box: FaceBox | null): Promise<Buffer> {
  const meta = await sharp(png).metadata();
  const W = meta.width ?? 256;
  const H = meta.height ?? 256;
  const cx = box?.cx ?? 0.5;
  const cy = box?.cy ?? 0.13; // faceCropStyle 폴백과 동일(v3 표준 머리 중심 근사)
  const hf = box?.h ?? 0.14;
  const s = Math.min(5, Math.max(2.2, 0.5 / hf));
  const side = Math.max(8, Math.round(Math.min(W, H) / s));
  const left = Math.max(0, Math.min(W - side, Math.round(cx * W - 0.5 * side)));
  const top = Math.max(0, Math.min(H - side, Math.round(cy * H - 0.44 * side)));
  return sharp(png)
    .extract({ left, top, width: side, height: side })
    .resize(FACE_THUMB_SIZE, FACE_THUMB_SIZE, { kernel: 'nearest' })
    .png()
    .toBuffer();
}
