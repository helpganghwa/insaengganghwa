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
  | 'NOT_EXECUTOR' // 집행관 아님(세금 수금)
  | 'COLLECT_COOLDOWN' // 수금 쿨다운 미경과
  | 'NOTHING_TO_COLLECT' // 수금할 💎 없음
  | 'NOTHING_TO_DISTRIBUTE'
  | 'DISTRIBUTE_OVER_POOL' // 수동 분배 — 분배 총액이 세금 풀 초과
  | 'ZONE_NOT_OWNED' // 수비 배치 — 자기 길드 소유 구역 아님
  | 'CANNOT_ATTACK_OWN' // 공격 배치 — 자기 길드 소유 구역
  | 'NOT_ADJACENT' // 공격 배치 — 내 영토에 인접하지 않은 구역(영토 0개면 자유)
  | 'IS_EXECUTOR' // 집행관은 배치 불가(자동 방어로 슬롯 점유)
  | 'BATTLE_IN_PROGRESS' // 점령전 진행 중(KST 23:00~24:00) — 배치/집행관 변경 잠금
  | 'TARGET_ALREADY_EXECUTOR' // 대상이 이미 다른 구역 집행관
  | 'NOT_OFFICER' // 길드장/부길드장 아님(집행관 지정·가입 승인)
  | 'NO_JOIN_REQUEST' // 승인/거절 대상 가입 신청 없음
  | 'VICE_LIMIT' // 부길드장 임명 상한(5명) 초과
  | 'EMBLEM_INVALID' // 문양 3축 선택 위반(모양/톤/키워드 1~3)
  | 'EMBLEM_GEN_FAILED' // 문양 생성 외부 실패(환불됨)
  | 'EMBLEM_MAX' // 보관 문양 최대(3개) 초과 — 삭제 후 생성
  | 'EMBLEM_MIN' // 최소 1개 유지(마지막 문양 삭제 불가)
  | 'EMBLEM_NOT_FOUND' // 해당 길드의 문양이 아님/없음
  | 'OPENCHAT_INVALID' // 오픈채팅 링크 형식 위반(open.kakao.com만 허용)
  | 'FORBIDDEN';

export class GuildError extends Error {
  constructor(public code: GuildErrorCode) {
    super(code);
    this.name = 'GuildError';
  }
}
