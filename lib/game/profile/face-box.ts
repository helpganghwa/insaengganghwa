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

/**
 * faceBox 확정(2026-07-21 쩌내·SEB 사례) — 실루엣 감지(det)와 AI 머리 박스(ai)를 교차검증해
 * 채택하고, 얼굴 행의 몸체 런 중심으로 cx를 스냅한다.
 *  - 두 소스가 크게 어긋나면(Δcy>0.05 또는 Δcx>0.06) 실루엣이 깃발·창 돌출물에 끌린
 *    신호로 보고 AI 쪽 채택(AI 프롬프트는 배너·무기 무시를 명시 — 파국적 오류가 없음).
 *  - cx 스냅: cy 행의 불투명 런(≥W*4%) 중 cx에 가장 가까운 런의 중심으로 이동(±0.08 한도)
 *    — AI의 중앙 앵커링(cx≈0.5 관성)을 실제 머리 위치로 교정(쩌내 0.49→0.43 검증).
 */
export async function reconcileFaceBox(
  png: Buffer,
  det: FaceBox | null,
  ai: FaceBox | null,
): Promise<FaceBox | null> {
  const primary =
    det && ai
      ? Math.abs(det.cy - ai.cy) > 0.05 || Math.abs(det.cx - ai.cx) > 0.06
        ? ai
        : det
      : (det ?? ai);
  if (!primary) return null;
  try {
    const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width: W, height: H, channels: C } = info;
    if (C < 4 || W < 16 || H < 16) return primary;
    const alpha = (x: number, y: number) => data[(y * W + x) * C + 3]!;
    const y = Math.min(H - 1, Math.max(0, Math.round(primary.cy * H)));
    // cy 행의 불투명 런 수집(폭 ≥ W*4% — 창대·깃대 제외)
    const minRun = Math.max(6, Math.round(W * 0.04));
    const runs: { s: number; e: number }[] = [];
    let s = -1;
    for (let x = 0; x < W; x++) {
      const on = alpha(x, y) >= ALPHA_ON;
      if (on && s < 0) s = x;
      if (!on && s >= 0) {
        if (x - s >= minRun) runs.push({ s, e: x - 1 });
        s = -1;
      }
    }
    if (s >= 0 && W - s >= minRun) runs.push({ s, e: W - 1 });
    if (runs.length === 0) return primary; // 행에 몸체 없음 — 원본 유지(호출부 판단)
    const px = primary.cx * W;
    const nearest = runs.sort(
      (a, b) => Math.abs((a.s + a.e) / 2 - px) - Math.abs((b.s + b.e) / 2 - px),
    )[0]!;
    const cx = (nearest.s + nearest.e) / 2 / W;
    // 스냅 한도 ±0.08 — 얼굴이 아닌 먼 물체 런으로 튀는 것 방지.
    return Math.abs(cx - primary.cx) <= 0.08 ? { ...primary, cx } : primary;
  } catch {
    return primary;
  }
}

export async function detectFaceBox(png: Buffer): Promise<FaceBox | null> {
  try {
    const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width: W, height: H, channels: C } = info;
    if (C < 4 || W < 16 || H < 16) return null;
    const alpha = (x: number, y: number) => data[(y * W + x) * C + 3]!;

    // 머리 탐색은 **중앙 밴드(가로 30~70%)**로 제한(2026-07-14) — 치켜든 무기(도끼·망치)가
    // 머리보다 높으면 전체 스캔의 top이 무기 끝으로 잡혀 얼굴 박스가 무기 쪽으로 끌렸음
    // (YOONEE 사례). 캐릭터는 중앙 정렬이 생성 표준이라 얼굴은 항상 밴드 안에 있다.
    // 신장(figureH)만 전체 스캔 기준(발끝·치마 폭 등 포함).
    const bandL = Math.round(W * 0.3);
    const bandR = Math.round(W * 0.7);

    // 행별 불투명 좌/우 끝 + 폭 — 밴드(머리 탐색용)와 전체(신장용) 이중 계산.
    const left = new Int32Array(H);
    const right = new Int32Array(H);
    const span = new Int32Array(H);
    const fullSpan = new Int32Array(H);
    for (let y = 0; y < H; y++) {
      let l = -1;
      let r = -1;
      let cnt = 0;
      let fCnt = 0;
      let fSeen = -1;
      let fLast = -1;
      for (let x = 0; x < W; x++) {
        if (alpha(x, y) >= ALPHA_ON) {
          if (fSeen < 0) fSeen = x;
          fLast = x;
          fCnt++;
          if (x >= bandL && x <= bandR) {
            if (l < 0) l = x;
            r = x;
            cnt++;
          }
        }
      }
      left[y] = l;
      right[y] = r;
      span[y] = cnt >= 2 && l >= 0 ? r - l + 1 : 0;
      fullSpan[y] = fCnt >= 2 && fSeen >= 0 ? fLast - fSeen + 1 : 0;
    }

    // 신장(전체) + 머리 탐색 상/하단(밴드 — 비면 전체로 폴백).
    let fTop = -1;
    let fBot = -1;
    for (let y = 0; y < H; y++) {
      if (fullSpan[y] > 0) {
        if (fTop < 0) fTop = y;
        fBot = y;
      }
    }
    if (fTop < 0 || fBot <= fTop) return null;
    let top = -1;
    let bottom = -1;
    for (let y = 0; y < H; y++) {
      if (span[y] > 0) {
        if (top < 0) top = y;
        bottom = y;
      }
    }
    if (top < 0 || bottom <= top) {
      top = fTop;
      bottom = fBot;
    }
    const figureH = fBot - fTop + 1;

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
