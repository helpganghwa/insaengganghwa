// 확률 공시 전문(payload) 빌더 — 스냅샷 기록 스크립트(record-probability-snapshot.ts)와
// 운영 대시보드의 "스냅샷 최신성" 인바리언트가 공유하는 단일 출처.
// 게임산업법 §33: balance.ts/카탈로그가 바뀌면 스냅샷을 다시 기록해야 한다 — 이 코어의
// 지문(fingerprint)이 최신 스냅샷과 다르면 "미기록 변경"으로 감지된다.
import {
  baseSuccessRateBp,
  downRateBp,
  MEGA_OF_SUCCESS_BP,
  transcendFodderForStep,
  transcendFodderCumulative,
  transcendBonusBp,
  supplyItemProbability,
  RAID_CRIT_RATE_BP,
  RAID_CRIT_MULT,
} from './balance';

export type SlotCount = { slot: string; n: number };

/** 공시 전문 코어 — note(기록 사유) 제외 전 항목. 값이 하나라도 바뀌면 재기록 대상. */
export function buildProbabilityPayloadCore(slotCounts: SlotCount[]) {
  const enhance = Array.from({ length: 100 }, (_, lv) => ({
    level: lv,
    successBp: baseSuccessRateBp(lv),
    downBp: downRateBp(lv),
  }));
  const transcend = Array.from({ length: 10 }, (_, i) => {
    const t = i + 1;
    return {
      toLevel: t,
      fodder: transcendFodderForStep(t),
      fodderCumulative: transcendFodderCumulative(t),
      bonusBp: transcendBonusBp(t),
    };
  });
  const supply = [...slotCounts]
    .sort((a, b) => a.slot.localeCompare(b.slot))
    .map((s) => ({ slot: s.slot, activeCount: s.n, itemProbability: supplyItemProbability(s.n) }));
  return {
    version: 1,
    enhance: { table: enhance, megaOfSuccessBp: MEGA_OF_SUCCESS_BP },
    transcend,
    supply,
    raid: { critRateBp: RAID_CRIT_RATE_BP, critMult: RAID_CRIT_MULT },
  };
}

/**
 * 키 정렬 canonical JSON 지문 — Postgres jsonb는 키 순서를 보존하지 않으므로
 * 왕복한 payload와 새로 만든 객체를 비교하려면 깊은 키 정렬이 필요하다.
 */
export function probabilityFingerprint(v: unknown): string {
  const sort = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(sort);
    if (x && typeof x === 'object') {
      return Object.fromEntries(
        Object.entries(x as Record<string, unknown>)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, val]) => [k, sort(val)]),
      );
    }
    return x;
  };
  return JSON.stringify(sort(v));
}
