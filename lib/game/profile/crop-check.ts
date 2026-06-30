import 'server-only';

import sharp from 'sharp';

/**
 * 전신 잘림 검사(결정론) — create-character-v3가 "full-length, both feet visible, clear margin"을
 * 프롬프트로 요청해도 정사각 캔버스에서 하반신을 프레임 밖으로 잘라내는 케이스를 차단한다.
 *
 * 규칙(매우 단순·강건): **이미지 맨 아래 1px 행에 피사체(불투명) 픽셀이 있으면 잘림.**
 *   - 정상 전신: 발/치맛단 아래에 항상 약간의 여백 → 맨 아래 행은 비어 있다(불투명 0).
 *   - 잘림: 몸(허벅지/다리)이 프레임 바닥 밖으로 나가 맨 아래 행까지 단면이 꽉 찬다.
 * 이전의 bottomBandRatio·headsTall 휴리스틱은 "넓은 치맛단·큰 머리장식 전신"(오탐)과
 * "허벅지 잘림"(진탐)에서 지표가 역전돼 둘을 못 갈랐다(실측). 맨 아래 행 점유 여부는
 * "발 아래 여백이 있나"를 직접 보므로 두 케이스를 정확히 분리한다(실측: 전신 0px / 잘림 49px).
 * ai-review.ts의 FRAMING 규칙은 보수적 backstop(둘 중 하나라도 잘림이면 reject).
 */

export interface CropMetrics {
  /** 맨 아래 행의 불투명(피사체) 픽셀 수. */
  bottomRowOpaque: number;
  /** 이미지 폭(px) — 임계 맥락. */
  width: number;
}

export interface CropResult {
  cropped: boolean;
  metrics: CropMetrics;
}

const ALPHA_ON = 40; // 불투명 임계(안티에일리어싱 가장자리 포함).
const MIN_OPAQUE = 6; // 맨 아래 행 불투명 픽셀이 이 값 이상이면 잘림(스트레이/AA 잔픽셀 무시).

/** south PNG의 전신 잘림 여부. 디코드 실패 시 cropped=false(과차단 방지). */
export async function detectFullBodyCrop(png: Buffer): Promise<CropResult> {
  try {
    const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width: W, height: H, channels: C } = info;
    if (C < 4 || W < 16 || H < 16) return { cropped: false, metrics: { bottomRowOpaque: 0, width: W } };

    // 맨 아래 행(y = H-1)의 불투명 픽셀 수.
    let n = 0;
    const y = H - 1;
    for (let x = 0; x < W; x++) if (data[(y * W + x) * C + 3]! >= ALPHA_ON) n++;

    return { cropped: n >= MIN_OPAQUE, metrics: { bottomRowOpaque: n, width: W } };
  } catch {
    return { cropped: false, metrics: { bottomRowOpaque: 0, width: 0 } };
  }
}
