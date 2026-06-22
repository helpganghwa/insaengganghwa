import 'server-only';

import sharp from 'sharp';

/**
 * 얼굴(머리) 박스 결정론 검출 — 정면(south) PNG의 alpha 실루엣에서 머리 위치를 측정.
 * 헤더·친구 썸네일 얼굴 크롭용(components/faceCrop.ts가 소비). 좌표는 **원본 이미지 기준 0~1**
 * (저장·표시되는 south.png와 동일 좌표계 — AI 검수의 트림/리사이즈 좌표계 불일치 문제 제거).
 *  - cx: 머리 가로 중심, cy: 얼굴 세로 중심, h: 머리 높이(이미지 높이 대비)
 * 디코드/검출 실패 시 null(호출부 폴백).
 */
export interface FaceBox {
  cx: number;
  cy: number;
  h: number;
}

const ALPHA_ON = 128;

export async function detectFaceBox(png: Buffer): Promise<FaceBox | null> {
  try {
    const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width: W, height: H, channels: C } = info;
    if (C < 4 || W < 16 || H < 16) return null;
    const alpha = (x: number, y: number) => data[(y * W + x) * C + 3]!;

    // 행별 불투명 좌/우 끝 + 폭.
    const left = new Int32Array(H);
    const right = new Int32Array(H);
    const span = new Int32Array(H);
    for (let y = 0; y < H; y++) {
      let l = -1;
      let r = -1;
      let cnt = 0;
      for (let x = 0; x < W; x++) {
        if (alpha(x, y) >= ALPHA_ON) {
          if (l < 0) l = x;
          r = x;
          cnt++;
        }
      }
      left[y] = l;
      right[y] = r;
      span[y] = cnt >= 2 && l >= 0 ? r - l + 1 : 0;
    }

    // 피사체 상/하단.
    let top = -1;
    let bottom = -1;
    for (let y = 0; y < H; y++) {
      if (span[y] > 0) {
        if (top < 0) top = y;
        bottom = y;
      }
    }
    if (top < 0 || bottom <= top) return null;
    const figureH = bottom - top + 1;

    // 어깨폭(상체 최대) — 목 판정 기준.
    const shLo = top + Math.round(figureH * 0.15);
    const shHi = top + Math.round(figureH * 0.42);
    let shoulderW = 0;
    for (let y = shLo; y <= shHi && y <= bottom; y++) if (span[y] > shoulderW) shoulderW = span[y];

    // 목 = 머리 정점(상단 8%) 아래 ~ 어깨 사이에서 폭이 최소인 행. headH = neck - top.
    const crownHi = top + Math.round(figureH * 0.08);
    const searchHi = top + Math.round(figureH * 0.42);
    let neck = -1;
    let minW = Number.MAX_SAFE_INTEGER;
    for (let y = crownHi; y <= searchHi && y <= bottom; y++) {
      if (span[y] > 0 && span[y] < minW) {
        minW = span[y];
        neck = y;
      }
      // 어깨가 본격적으로 넓어지면 중단(목은 그 위).
      if (shoulderW > 0 && span[y] >= shoulderW * 0.85 && neck > crownHi) break;
    }
    let headH = neck > top ? neck - top : Math.round(figureH / 6.8);
    // 가드 — 목 핀치가 머리카락/장식으로 너무 이르거나 늦게 잡히는 경우 보정.
    // 7등신 기준 머리는 신장의 약 14%(1/6.8). 신장의 11~22% 벗어나면 기본값으로 대체.
    const minHead = Math.round(figureH * 0.11);
    const maxHead = Math.round(figureH * 0.22);
    if (headH < minHead || headH > maxHead) headH = Math.round(figureH / 6.8);

    // cx = 머리 영역(top ~ top+headH*0.7)의 불투명 픽셀 가로 중심(어깨 제외).
    const headBot = Math.min(bottom, top + Math.round(headH * 0.7));
    let sumX = 0;
    let nPix = 0;
    for (let y = top; y <= headBot; y++) {
      if (span[y] <= 0) continue;
      for (let x = left[y]!; x <= right[y]!; x++) {
        if (alpha(x, y) >= ALPHA_ON) {
          sumX += x;
          nPix++;
        }
      }
    }
    const cxPx = nPix > 0 ? sumX / nPix : W / 2;
    // cy = 얼굴 중심 ≈ 머리 정점 + headH*0.45(눈·코 영역).
    const cyPx = top + headH * 0.45;

    return {
      cx: Math.min(1, Math.max(0, cxPx / W)),
      cy: Math.min(1, Math.max(0, cyPx / H)),
      h: Math.min(1, Math.max(0.02, headH / H)),
    };
  } catch {
    return null;
  }
}
