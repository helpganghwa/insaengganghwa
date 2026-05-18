/**
 * 레이드 — GDD §3.5 / BALANCE §5 / SCHEMA §6.
 * open/join/attack/buyExtraAttack/settle + 파생(phasesCleared/phase drop).
 */
export { openRaid, RaidError } from './open';
export type { RaidErrorCode, RaidBoss } from './open';
export { joinRaid } from './join';
export { attackRaid, buyExtraAttack } from './attack';
export { settleRaid } from './settle';
export { raidPhasesCleared, phaseDropOutcome, aggregatePhaseDrops } from './drops';
export type { PhaseDrop } from './drops';
