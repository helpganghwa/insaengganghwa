import 'server-only';

import sharp from 'sharp';

/**
 * 배경 투명 검사(결정론) — no_background 생성이 가끔 불투명 배경으로 나오는 케이스 차단.
 * AI 비전은 투명/흰배경 구분이 약해 부적합 → PNG 네 모서리 영역의 alpha를 직접 검사한다.
 * 캐릭터는 보통 중앙, 모서리는 배경이므로 모서리가 불투명하면 "배경 있음".
 *
 * @returns true = 배경 불투명(결함). 디코드 실패 시 false(다른 검수에 위임, 과차단 방지).
 */
export async function isBackgroundOpaque(png: Buffer): Promise<boolean> {
  try {
    const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width, height, channels } = info;
    if (channels < 4 || width < 8 || height < 8) return false;
    const c = Math.max(4, Math.round(Math.min(width, height) * 0.06)); // 모서리 한 변 ~6%
    const alpha = (x: number, y: number) => data[(y * width + x) * channels + 3]!;
    let opaque = 0;
    let total = 0;
    for (const oy of [0, height - c]) {
      for (const ox of [0, width - c]) {
        for (let y = oy; y < oy + c; y++) {
          for (let x = ox; x < ox + c; x++) {
            total++;
            if (alpha(x, y) > 200) opaque++;
          }
        }
      }
    }
    return total > 0 && opaque / total > 0.5; // 모서리 절반 이상 불투명 = 배경 있음
  } catch {
    return false;
  }
}

/** 여러 방향 중 배경 불투명이 임계 이상이면 true(다수결). 회전 일부만 깨지는 케이스 포함. */
export async function anyBackgroundOpaque(pngs: Buffer[], minFrac = 0.34): Promise<boolean> {
  if (pngs.length === 0) return false;
  const flags = await Promise.all(pngs.map((p) => isBackgroundOpaque(p)));
  const bad = flags.filter(Boolean).length;
  return bad / pngs.length >= minFrac;
}
