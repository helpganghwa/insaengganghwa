import { transcendFodderForStep } from '@/lib/game/balance';

/**
 * 할로윈 장비 교환 — 순수 규칙(서버·클라 공용, server-only 없음). 2026-10-27 사용자 확정.
 *  - 사탕으로 할로윈 6종을 1개씩 받는다. 받는 처리는 보급 개봉과 같다(미보유 → 획득 T0, 보유 → 진행도 +1 → 임계 도달 시 자동 초월).
 *  - 가격: 1개 = 사탕 100(상자 1개 교환과 같은 값).
 *  - 수량 제한: 교환 뒤 그 장비의 초월 단계가 **내가 가진 장비 중 가장 높은 초월 단계(같은 서버)**를 넘을 수 없다.
 *    미보유면 획득 1개 + 그 단계까지 채우는 개수. 내 최고가 T0이면 미보유 장비만 1개.
 */
export const CANDY_ITEM_EXCHANGE = { candy: 100 } as const;

export type ItemTranscendState = { level: number; progress: number };

/** cur에서 maxT 단계(진행도 0)까지 올리는 데 드는 개수. 이미 maxT 이상이면 0. */
function copiesToReach(cur: ItemTranscendState, maxT: number): number {
  if (cur.level >= maxT) return 0;
  let need = 0;
  for (let k = cur.level + 1; k <= maxT; k += 1) need += transcendFodderForStep(k);
  return Math.max(0, need - cur.progress);
}

/** 지금 교환할 수 있는 최대 개수. cur=null은 미보유. */
export function allowedItemCopies(maxT: number, cur: ItemTranscendState | null): number {
  const m = Math.max(0, Math.floor(maxT));
  if (!cur) return 1 + copiesToReach({ level: 0, progress: 0 }, m);
  return copiesToReach(cur, m);
}

/** count개 받은 뒤 상태 미리보기(보급 개봉과 같은 선형 규칙 T→T+1 = T+1개). */
export function simulateItemCopies(cur: ItemTranscendState | null, count: number): ItemTranscendState & { transcended: number; acquired: boolean } {
  let level = cur?.level ?? 0;
  let progress = cur?.progress ?? 0;
  let transcended = 0;
  let acquired = false;
  for (let i = 0; i < count; i += 1) {
    if (!cur && i === 0) {
      acquired = true;
      continue;
    }
    progress += 1;
    while (progress >= transcendFodderForStep(level + 1)) {
      progress -= transcendFodderForStep(level + 1);
      level += 1;
      transcended += 1;
    }
  }
  return { level, progress, transcended, acquired };
}
