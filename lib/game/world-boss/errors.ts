/** 월드보스·원정대 오류 코드 — 화면 문구는 호출부(actions)가 매핑한다. */
export type WorldBossErrorCode =
  | 'NOT_FOUND'
  | 'BOSS_NOT_ACTIVE'
  | 'NOT_OWNER_GUILD'
  | 'NO_CHARACTER'
  | 'ALREADY_IN_PARTY'
  | 'ALREADY_FOUGHT'
  | 'ALREADY_REQUESTED'
  | 'NO_REQUEST'
  | 'PARTY_NOT_RECRUITING'
  | 'PARTY_FULL'
  | 'NOT_LEADER'
  | 'NOT_MEMBER'
  | 'LOCKED';

export class WorldBossError extends Error {
  constructor(public readonly code: WorldBossErrorCode) {
    super(code);
    this.name = 'WorldBossError';
  }
}
