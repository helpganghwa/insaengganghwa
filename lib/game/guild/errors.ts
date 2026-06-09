/** 길드 도메인 에러 — 서버 액션이 코드별 사용자 메시지로 매핑. */
export type GuildErrorCode =
  | 'ALREADY_IN_GUILD' // 이미 길드 소속(1유저 1길드)
  | 'NOT_IN_GUILD'
  | 'NAME_INVALID' // 길이/형식 위반
  | 'NAME_TAKEN' // 이름 중복
  | 'INSUFFICIENT_DIAMOND'
  | 'GUILD_NOT_FOUND'
  | 'GUILD_FULL' // 수용 인원 초과
  | 'REJOIN_LOCKED' // 탈퇴 후 24h 미경과
  | 'NOT_LEADER'
  | 'LEADER_MUST_TRANSFER' // 길드장이 멤버 남은 채 탈퇴 시도(위임/해산 필요)
  | 'DONATION_CAP_REACHED' // 일일 기부 한도 소진
  | 'TARGET_NOT_IN_GUILD' // 대상이 같은 길드원이 아님
  | 'INVALID_TARGET' // 자기 자신/길드장 대상 등 불가
  | 'ZONE_NOT_FOUND' // 구역 없음(거주 변경 등)
  | 'NOT_LORD' // 영주 아님(세금 수금)
  | 'COLLECT_COOLDOWN' // 수금 쿨다운 미경과
  | 'NOTHING_TO_COLLECT' // 수금할 💎 없음
  | 'NOTHING_TO_DISTRIBUTE'
  | 'FORBIDDEN';

export class GuildError extends Error {
  constructor(public code: GuildErrorCode) {
    super(code);
    this.name = 'GuildError';
  }
}
