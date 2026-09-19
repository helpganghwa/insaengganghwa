/**
 * 시대 요약 동기화 판정(0203) — 이 시대에 이야기꾼 제안을 새로 만들지. DB·AI와 분리한 순수 함수(tests/history/era-sync-decision.test.ts).
 *  - locked: 제안을 받지 않는 시대.
 *  - skip: 정본이 이미 이 사실표로 쓴 글이거나, 이 사실표로는 이미 제안했다(버린 제안 포함 — 글은 지워도 해시는 남는다).
 *  - generate: 그 밖. 정본이 집계 문장(source='code')이면 사실표가 그대로여도 제안을 시도한다 —
 *    끝난 시대는 사실표가 더는 안 바뀌어, 건너뛰면 생성에 실패한 시대가 영영 집계 문장으로 남는다.
 */
export type EraSyncRow = { locked: boolean; factsHash: string; source: string; proposedFactsHash: string | null };
export type EraSyncDecision = 'locked' | 'skip' | 'generate';

export function eraSyncDecision(row: EraSyncRow | null, hash: string, force: boolean): EraSyncDecision {
  if (!row) return 'generate';
  if (row.locked) return 'locked';
  if (force) return 'generate';
  if (row.proposedFactsHash === hash) return 'skip';
  if (row.factsHash === hash && row.source !== 'code') return 'skip';
  return 'generate';
}
