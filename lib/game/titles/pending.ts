/**
 * 아직 판정 로직이 없는 코드 — 구현 시 제거. 사유는 주석으로.
 *
 * judge.ts가 아닌 독립 모듈인 이유: 위키(공개 문서)가 "노출 칭호 총수"를 셀 때 이 목록이
 * 필요한데, judge.ts는 db 클라이언트를 끌고 온다. 여기는 의존 0 — 어디서든 안전하게 import.
 *
 * 2026-08-21 0166 이력 컬럼(characters 6종 + enhancement_logs.overdue_ms)으로 12종 해소:
 * 거주(resident_10/mover_30/wandering_smith)·아바타 유지(same_face_30/one_suit)·길드 기부
 * (guild_donate/pillar)·집행관 역임(tour_lord)·방치 수령(aging/carefree)은 judge.ts 판정으로,
 * apex_shoot(생성 시점 스냅샷)·new_record(1위 교체 관측)는 이벤트 훅으로 이동.
 */
export const PENDING_CODES = new Set<string>([
  // 지역 보스 미출시 — 판정은 raids.boss_code로 지금도 쓸 수 있고, 콘텐츠만 없다.
  'raid_temple', 'raid_kingdom',
  // 대륙 토벌 — 조건이 "6개 지역"(세계관 확정, 2026-08-21 사용자: 현행 4지역으로 낮추지
  // 않음)이라 신전·왕국 보스 출시 전엔 성립 불가. 출시 시 판정(전 보스 min>=10) 복원.
  'continent_sweep',
  // 컷오버 지급(헌정) — 판정이 아니라 cbt-restore/ensureCbtCarryover가 직접 넣는다.
  'cbt_2026',
]);

/**
 * 판정 밖 **이벤트 훅**에서 직접 지급되는 코드 — 커버리지 감사 시 "누락"으로 오인 금지.
 *  - comeback: 출석 수령 트랜잭션(checkin/claim.ts) — 공백 증거(lastClaimedKstDay)가
 *    수령으로 소멸하므로 판정으로는 불가능, 훅 지급이 유일한 경로.
 *  - apex_shoot: 아바타 생성 수락(profile/pipeline.ts) — 생성 **시점**의 장착 상태
 *    (createProfileJob이 options.apexAtCreation으로 스냅샷)라 사후 판정 불가.
 *  - new_record: rank-leader 크론(world/event.ts) — max 1위 **교체** 관측 순간 지급.
 *    "현재 1위" 판정(rank_max와 동일 술어)으로는 cond의 "경신"이 아니다.
 */
export const EVENT_HOOK_CODES = new Set<string>(['comeback', 'apex_shoot', 'new_record']);
