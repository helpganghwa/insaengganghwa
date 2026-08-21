/**
 * 아직 판정 로직이 없는 코드 — 구현 시 제거. 사유는 주석으로.
 *
 * judge.ts가 아닌 독립 모듈인 이유: 위키(공개 문서)가 "노출 칭호 총수"를 셀 때 이 목록이
 * 필요한데, judge.ts는 db 클라이언트를 끌고 온다. 여기는 의존 0 — 어디서든 안전하게 import.
 *
 * 2026-08-12 재분류로 14종이 빠졌다. 원인은 "판정을 안 짰다"가 아니라 근거 테이블이 없었던
 * 것인데, diamond_ledger(0159)·guild_audit_log가 그 사이 생겨 전제가 바뀌었다.
 */
export const PENDING_CODES = new Set<string>([
  // 이력 테이블 부재 — 거주 이동 기록·아바타 교체 기록이 없다(현재 상태만 남는다).
  'mover_30', 'resident_10', 'same_face_30', 'one_suit', 'wandering_smith',
  // 길드 기부 **횟수** 로그 부재 — contribution_points(누적 점수)와 daily_donation_count(오늘치)만
  // 있고 guild_audit_log에도 기부 action이 없다(join/leave/kick/tax_* 등만).
  'guild_donate', 'pillar',
  // 점령전 — 집행관 역임 이력 부재(zones는 현재 집행관만, conquest_battles는 승리 길드만)
  'tour_lord',
  // 아바타 생성 시점 장비 강화레벨 부재 — profile_generation_jobs.equipment_snapshot은
  // {weaponKey, armorKey, accessoryKey}뿐이라 "+100 이상 3개"를 사후에 알 수 없다.
  'apex_shoot',
  // 지역 보스 미출시 — 판정은 raids.boss_code로 지금도 쓸 수 있고, 콘텐츠만 없다.
  'raid_temple', 'raid_kingdom',
  // 컷오버 지급(헌정) — 판정이 아니라 cbt-restore/ensureCbtCarryover가 직접 넣는다.
  'cbt_2026',
  // "완료 후 방치" 측정 불가 — resolve.ts가 elapsed_ms를 총 소요시간으로 클램프해
  // (통산 단련 시간 통계의 "만기 후 방치 제외" 의미와 결합) 만기 이후 경과가 어디에도
  // 안 남는다. 판정식(elapsed >= duration + N)은 수학적으로 영원히 거짓이었다(감사 H2).
  // 해소하려면 수령 시점 지연을 따로 기록하는 컬럼이 필요 — 오픈 후 검토.
  'aging', 'carefree',
]);

/**
 * 판정 밖 **이벤트 훅**에서 직접 지급되는 코드 — 커버리지 감사 시 "누락"으로 오인 금지.
 *  - comeback: 출석 수령 트랜잭션(checkin/claim.ts) — 공백 증거(lastClaimedKstDay)가
 *    수령으로 소멸하므로 판정으로는 불가능, 훅 지급이 유일한 경로.
 */
export const EVENT_HOOK_CODES = new Set<string>(['comeback']);
