/**
 * 아직 판정 로직이 없는 코드 — 구현 시 제거. 사유는 주석으로.
 *
 * judge.ts가 아닌 독립 모듈인 이유: 위키(공개 문서)가 "노출 칭호 총수"를 셀 때 이 목록이
 * 필요한데, judge.ts는 db 클라이언트를 끌고 온다. 여기는 의존 0 — 어디서든 안전하게 import.
 *
 * 2026-08-21 현재 비어 있음 — 0166 이력 컬럼(12종)과 왕국 보스 그리핀 출시(0168, 레이드
 * 3종)로 전량 해소. 앞으로 판정 근거가 없는 칭호를 추가할 때만 여기에 코드를 넣는다.
 */
export const PENDING_CODES = new Set<string>([]);

/**
 * 판정 밖 **이벤트 훅**에서 직접 지급되는 코드 — 커버리지 감사 시 "누락"으로 오인 금지.
 *  - comeback: 출석 수령 트랜잭션(checkin/claim.ts) — 공백 증거(lastClaimedKstDay)가
 *    수령으로 소멸하므로 판정으로는 불가능, 훅 지급이 유일한 경로.
 *  - apex_shoot: 아바타 생성 수락(profile/pipeline.ts) — 생성 **시점**의 장착 상태
 *    (createProfileJob이 options.apexAtCreation으로 스냅샷)라 사후 판정 불가.
 *  - new_record: rank-leader 크론(world/event.ts) — max 1위 값의 **경신** 관측 순간 지급.
 *    "현재 1위" 판정(rank_max와 동일 술어)으로는 cond의 "경신"이 아니다.
 */
export const EVENT_HOOK_CODES = new Set<string>(['comeback', 'apex_shoot', 'new_record']);
