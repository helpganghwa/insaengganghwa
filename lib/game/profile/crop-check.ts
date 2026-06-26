import 'server-only';

import sharp from 'sharp';

/**
 * 전신 잘림 검사(결정론) — create-character-v3가 "full-length, both feet visible"를
 * 프롬프트로 요청해도 정사각 캔버스에서 하반신을 프레임 밖으로 잘라내는 케이스를 차단한다.
 * 이 alpha 선차단이 1차 게이트, ai-review.ts의 FRAMING 규칙이 backstop(2중 방어 — 넓은 캐릭터 등
 * 휴리스틱 맹점을 AI 비전이 보완). 둘 중 하나라도 잘림이면 reject.
 *
 * 원리(south 정면, 투명 배경): 정상 전신은 바닥이 "발"(좁게 모이고 보통 약간의 여백) 또는
 * 자연스러운 치맛단으로 끝난다. 허벅지/몸통에서 잘리면 피사체가 이미지 바닥 가장자리에
 * "넓은 단면"으로 닿는다(발이 아니라 다리 단면). 두 신호를 결합한다:
 *   - bottomContact: 피사체가 이미지 바닥에 거의 닿음(아래 여백이 거의 없음)
 *   - bottomBandRatio: 바닥 밴드의 폭 / 피사체 최대폭 — 잘린 단면은 넓고, 발은 좁다
 *   - headsTall: 보이는 신장 ÷ 머리높이 — 전신 7등신은 ~6+, 허벅지 잘림은 ~3.5
 * 머리 추정(목 핀치)이 머리카락으로 흐려질 수 있어, 잘림은 bottomContact+bottomBandRatio로
 * 판정하고 headsTall은 보조(넓은 치맛단=전신 오탐 방지)로만 쓴다.
 */

export interface CropMetrics {
  /** 피사체 상단/하단 행(0~1, 이미지 높이 정규화). */
  top: number;
  bottom: number;
  /** 피사체 아래 투명 여백(이미지 높이 대비). 작을수록 바닥에 닿음. */
  bottomMargin: number;
  /** 바닥 밴드 평균폭 ÷ 몸통 대표폭(피사체 행 span의 median). 클수록 넓은 단면(=발 아님). */
  bottomBandRatio: number;
  /** 보이는 신장 ÷ 추정 머리높이. 작을수록 적게 보임(=잘림). 추정 실패 시 null. */
  headsTall: number | null;
}

export interface CropResult {
  cropped: boolean;
  metrics: CropMetrics;
}

const ALPHA_ON = 128; // 불투명 임계
const ROW_MIN_PX = 2; // 행을 "피사체 있음"으로 칠 최소 불투명 픽셀(스트레이 무시)

/** south PNG의 전신 잘림 여부 + 지표. 디코드 실패 시 cropped=false(과차단 방지). */
export async function detectFullBodyCrop(png: Buffer): Promise<CropResult> {
  const empty: CropResult = {
    cropped: false,
    metrics: { top: 0, bottom: 1, bottomMargin: 1, bottomBandRatio: 0, headsTall: null },
  };
  try {
    const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width: W, height: H, channels: C } = info;
    if (C < 4 || W < 16 || H < 16) return empty;
    const alpha = (x: number, y: number) => data[(y * W + x) * C + 3]!;

    // 행별 불투명 폭(span = 좌끝~우끝). 스트레이 픽셀(ROW_MIN_PX 미만)은 0 처리.
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
      span[y] = cnt >= ROW_MIN_PX && l >= 0 ? r - l + 1 : 0;
    }

    // 피사체 상단/하단.
    let top = -1;
    let bottom = -1;
    for (let y = 0; y < H; y++) {
      if (span[y] > 0) {
        if (top < 0) top = y;
        bottom = y;
      }
    }
    if (top < 0 || bottom <= top) return empty;
    const figureH = bottom - top + 1;

    let maxSpan = 0;
    for (let y = top; y <= bottom; y++) if (span[y] > maxSpan) maxSpan = span[y];
    if (maxSpan <= 0) return empty;

    // 바닥 밴드(하단 ~7%)의 평균 폭.
    const band = Math.max(2, Math.round(figureH * 0.07));
    let bandSum = 0;
    let bandRows = 0;
    for (let y = bottom; y > bottom - band && y >= top; y--) {
      bandSum += span[y];
      bandRows++;
    }
    // 분모 = 몸통 대표폭(**피사체 행 span의 중앙값**). maxSpan(절대 최대폭)은 팔벌림·망토·날개로
    // 부풀려져, 넓은 캐릭터의 다리 잘림 단면이 상대적으로 좁아 보여 미검출되던 문제(실측: maxSpan
    // 247 → 잘림 단면 87px가 ratio 0.35로 깎여 통과)를 일으켰다. median은 소수의 와이드 행에
    // 강건 → 같은 케이스 median 136 → ratio 0.64로 정상 검출. bottomContact가 게이트라 median
    // 변경은 "바닥에 닿은 이미지"에만 영향(전신은 보통 여백 있어 무영향).
    const figSpans: number[] = [];
    for (let y = top; y <= bottom; y++) if (span[y] > 0) figSpans.push(span[y]);
    figSpans.sort((a, b) => a - b);
    const bodyWidth = figSpans.length > 0 ? figSpans[figSpans.length >> 1]! : maxSpan;
    const bottomBandRatio = bandRows > 0 ? bandSum / bandRows / Math.max(1, bodyWidth) : 0;
    const bottomMargin = (H - 1 - bottom) / H;

    // 머리높이 추정(보조): 상단부터 목 핀치(상체 폭의 국소 최소)까지.
    // 어깨폭 = [top+15%, top+45%] 구간 최대폭. 목 = 머리 정점 아래~어깨 사이 폭 최소 행.
    const headsTall = estimateHeadsTall(span, top, bottom, figureH);

    // 판정: 피사체가 이미지 바닥 프레임에 닿고(잘림의 정의 — 몸이 프레임 밖으로 나감)
    // 그 단면이 넓으면(발이 아니라 다리/몸통 단면) 잘림.
    // 전신은 발/치맛단 아래에 항상 약간의 여백이 남는다(실측: margin 0.020~0.047) →
    // margin≤0.008(≈2px)를 "프레임 접촉"으로 본다(실측 전신 최소 여백 0.016과 분리).
    // 넓은 치맛단 전신도 여백이 남아 통과. 잘림은 항상 바닥 끝(margin 0)에 닿으므로 검출 손실 없음.
    // headsTall은 머리카락 등으로 추정이 불안정해 결정엔 쓰지 않고 관측용으로만 둔다.
    const bottomContact = bottomMargin <= 0.008; // 바닥 프레임에 사실상 닿음
    const wideBottom = bottomBandRatio >= 0.5; // 밴드가 몸통 대표폭(median)의 절반 이상 = 단면(발 아님)
    const cropped = bottomContact && wideBottom;

    return {
      cropped,
      metrics: {
        top: top / H,
        bottom: bottom / H,
        bottomMargin,
        bottomBandRatio,
        headsTall,
      },
    };
  } catch {
    return empty;
  }
}

/** 머리높이 추정 → 보이는 신장 ÷ 머리높이. 핀치 불명확 시 null. */
function estimateHeadsTall(span: Int32Array, top: number, bottom: number, figureH: number): number | null {
  const shoulderLo = top + Math.round(figureH * 0.15);
  const shoulderHi = top + Math.round(figureH * 0.45);
  let shoulderW = 0;
  for (let y = shoulderLo; y <= shoulderHi && y <= bottom; y++) if (span[y] > shoulderW) shoulderW = span[y];
  if (shoulderW <= 0) return null;

  // 머리 정점 근처(상단 18%) 최대폭 = 대략 머리폭.
  const crownHi = top + Math.round(figureH * 0.18);
  let headW = 0;
  for (let y = top; y <= crownHi && y <= bottom; y++) if (span[y] > headW) headW = span[y];
  if (headW <= 0) return null;

  // 목 = 머리정점~어깨 사이에서 폭이 어깨의 ~70% 미만으로 처음 좁아진 뒤 다시 넓어지는 국소 최소.
  let neck = -1;
  let minW = Number.MAX_SAFE_INTEGER;
  for (let y = crownHi; y <= shoulderHi && y <= bottom; y++) {
    if (span[y] < minW) {
      minW = span[y];
      neck = y;
    }
    // 어깨가 본격적으로 넓어지기 시작하면 중단(목은 그 위).
    if (span[y] >= shoulderW * 0.85 && neck > crownHi) break;
  }
  if (neck < 0 || neck <= top) return null;
  const headH = neck - top;
  if (headH < 2) return null;
  return figureH / headH;
}
