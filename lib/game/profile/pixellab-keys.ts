import 'server-only';
// 아바타·문양 생성 Pixellab 키 풀 — key1(PIXELLAB_API_KEY) + key2(PIXELLAB_API_KEY_2) + key3(PIXELLAB_API_KEY_3), 2·3은 선택.
// 여러 Tier-3 구독을 나눠 써 처리량↑·레이트리밋 여유.
// ⚠️ 캐릭터는 "생성한 키"로만 조회/다운로드 가능(계정 귀속) → 잡 options.pixellabKeyIdx에
//    생성 시 키 인덱스를 기록하고, 폴링·다운로드·지급은 반드시 같은 키로 한다.
//
// 키 추가(2026-09-19, key3): 풀 참여 여부는 **그 배포의 env에 키가 있느냐**로만 정한다. key3를 로컬(.env.local)에만
// 두면 스크립트(아이템 생성 등)만 쓰고, Vercel env에 넣고 재배포하면 아바타 동시 생성 상한이 키당 상한만큼 늘어난다.
// 스크립트가 key3로 대량 생성하는 동안에는 Vercel에 넣지 말 것 — 같은 계정의 동시 실행 한도를 나눠 쓰게 된다.

import { PROFILE_GEN_PER_KEY } from '@/lib/game/balance';

/** 지원하는 키 인덱스 → env 이름. 인덱스는 잡 options에 영구 기록되므로 번호를 바꾸거나 재사용하지 말 것. */
const KEY_ENV: Record<number, string> = {
  1: 'PIXELLAB_API_KEY',
  2: 'PIXELLAB_API_KEY_2',
  3: 'PIXELLAB_API_KEY_3',
};
export const PIXELLAB_KEY_IDXS = [1, 2, 3] as const;

function envKey(idx: number, env: NodeJS.ProcessEnv): string | undefined {
  const name = KEY_ENV[idx];
  const v = name ? env[name] : undefined;
  return v && v.trim() ? v : undefined;
}

/** 이 배포에서 쓸 수 있는 키 인덱스(오름차순). key1이 없으면 빈 배열 — 호출부가 'missing'으로 처리. */
export function configuredPixellabKeyIdxs(env: NodeJS.ProcessEnv = process.env): number[] {
  if (!envKey(1, env)) return [];
  return PIXELLAB_KEY_IDXS.filter((i) => envKey(i, env) != null);
}

/**
 * 키 인덱스 → 실제 키. 그 인덱스가 미설정이면 key1로 폴백한다.
 *
 * ⚠ 폴백은 **새 발주엔 안전하지만 진행 중인 잡엔 안전하지 않다.** 캐릭터는 생성한 키의 계정에
 * 귀속돼 다른 키로 조회하면 404가 나고, 폴링은 그것을 '캐릭터 없음'으로 읽어 환불 처리한다 —
 * Pixellab 과금은 이미 끝난 뒤다. key2·key3로 발주된 잡이 떠 있는 상태에서 env를 내리고 재배포하면
 * 조용히 벌어지므로(Vercel은 env를 배포 시점에 스냅샷한다) 반드시 흔적을 남긴다.
 * 던지지는 않는다 — 이 함수는 폴링 배치 루프 안에서 불려, 던지면 무관한 잡까지 같이 멈춘다.
 */
export function pixellabKeyByIdx(idx: number, env: NodeJS.ProcessEnv = process.env): string {
  if (idx !== 1) {
    const k = envKey(idx, env);
    if (k) return k;
    console.error(
      `[pixellab-keys] key${idx}로 발주된 잡인데 ${KEY_ENV[idx] ?? `키 ${idx}`}가 없다 — key1 폴백(404→환불 위험). env를 되돌리고 재배포할 것.`,
    );
  }
  const k1 = envKey(1, env);
  if (!k1) throw new Error('PIXELLAB_API_KEY missing');
  return k1;
}

/** 생성 시 키 인덱스 선택(라운드로빈) — 설정된 키들 사이를 seed로 돈다. seed=잡·길드 id 등 단조 증가값. */
export function pickPixellabKeyIdx(seed: bigint | number, env: NodeJS.ProcessEnv = process.env): number {
  const idxs = configuredPixellabKeyIdxs(env);
  if (idxs.length <= 1) return 1;
  return idxs[Number(BigInt(seed) % BigInt(idxs.length))]!;
}

/** 목록에서 `after` 다음 키(순환). 동률 교대·재시도 교대 공용. `after`가 목록에 없으면 첫 키. */
export function nextPixellabKeyIdx(after: number, env: NodeJS.ProcessEnv = process.env): number {
  const idxs = configuredPixellabKeyIdxs(env);
  if (idxs.length === 0) return 1;
  const i = idxs.indexOf(after);
  return idxs[(i + 1) % idxs.length]!;
}

/** 잡 options에서 키 인덱스 추출(없거나 모르는 값이면 1 — 레거시 잡은 모두 key1로 생성됨). */
export function keyIdxFromOptions(options: unknown): number {
  const idx = (options as { pixellabKeyIdx?: number } | null)?.pixellabKeyIdx;
  return typeof idx === 'number' && (PIXELLAB_KEY_IDXS as readonly number[]).includes(idx) ? idx : 1;
}

/** 활성 Pixellab 키 수(1~3). key1이 없어도 1 — 발주 쪽이 'missing'으로 먼저 막는다. */
export function pixellabKeyCount(env: NodeJS.ProcessEnv = process.env): number {
  return Math.max(1, configuredPixellabKeyIdxs(env).length);
}

/** 서버 전체 아바타 동시 생성 상한 = 키당 상한 × 활성 키 수(키 3개면 4×3=12). */
export function profileGenConcurrency(env: NodeJS.ProcessEnv = process.env): number {
  return PROFILE_GEN_PER_KEY * pixellabKeyCount(env);
}
