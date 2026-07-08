/**
 * 강화 라이프사이클 — CLAUDE §6.1.
 * (A) queueEnhance · (B) resolveEnhance · (C) reduceEnhanceTime ·
 * (D) cancelEnhance · (D+A) swapEnhance. 자동 재등록은 액션 계층에서 결과 무관 (A) 재호출(실패도 슬롯 유지).
 */
export { queueEnhance, queueEnhanceInTx, EnhanceError } from './queue';
export type {
  QueueEnhanceInput,
  QueueEnhanceResult,
  EnhanceErrorCode,
} from './queue';
export { resolveEnhance } from './resolve';
export type { ResolveInput, ResolveResult, ResolveOutcome } from './resolve';
export { reduceEnhanceTime } from './reduceTime';
export type { ReduceTimeInput, ReduceTimeResult } from './reduceTime';
export { cancelEnhance } from './cancel';
export { swapEnhance } from './swap';
