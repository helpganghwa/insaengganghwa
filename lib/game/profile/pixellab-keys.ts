import 'server-only';
// 아바타 생성 Pixellab 키 풀 — key1(PIXELLAB_API_KEY) + key2(PIXELLAB_API_KEY_2, 선택).
// 두 Tier-3 구독을 라운드로빈해 처리량↑·레이트리밋 여유.
// ⚠️ 캐릭터는 "생성한 키"로만 조회/다운로드 가능(계정 귀속) → 잡 options.pixellabKeyIdx에
//    생성 시 키 인덱스를 기록하고, 폴링·다운로드·지급은 반드시 같은 키로 한다.

import { PROFILE_GEN_PER_KEY } from '@/lib/game/balance';

/** 키 인덱스(1|2) → 실제 키. idx 2가 미설정이면 key1로 폴백(항상 안전). */
export function pixellabKeyByIdx(idx: number): string {
  const k1 = process.env.PIXELLAB_API_KEY;
  const k2 = process.env.PIXELLAB_API_KEY_2;
  if (idx === 2 && k2) return k2;
  if (!k1) throw new Error('PIXELLAB_API_KEY missing');
  return k1;
}

/** 생성 시 키 인덱스 선택(라운드로빈). key2 미설정이면 항상 1. seed=잡 id 등 단조 증가값. */
export function pickPixellabKeyIdx(seed: bigint | number): number {
  if (!process.env.PIXELLAB_API_KEY_2) return 1;
  return Number(BigInt(seed) % 2n) === 0 ? 1 : 2;
}

/** 잡 options에서 키 인덱스 추출(없으면 1 — 레거시 잡은 모두 key1로 생성됨). */
export function keyIdxFromOptions(options: unknown): number {
  const idx = (options as { pixellabKeyIdx?: number } | null)?.pixellabKeyIdx;
  return idx === 2 ? 2 : 1;
}

/** 활성 Pixellab 키 수(1|2) — key2 설정 여부. */
export function pixellabKeyCount(): number {
  return process.env.PIXELLAB_API_KEY_2 ? 2 : 1;
}

/** 서버 전체 아바타 동시 생성 상한 = 키당 상한 × 활성 키 수(key2 있으면 4×2=8). */
export function profileGenConcurrency(): number {
  return PROFILE_GEN_PER_KEY * pixellabKeyCount();
}
