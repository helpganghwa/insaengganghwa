import { FIRST_MILESTONES } from '@/lib/game/balance'; // 상수만 있는 모듈 — 의존 0 원칙 유지

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
 * 보유자에게만 보이는 코드 — 최초 이정표(first_<key>_<rank>, 서버에서 처음 넘은 세 사람).
 * 자리가 셋뿐이라 대부분은 영영 못 얻는다. 목록·분모에 두면 발견 게이지가 채워질 수 없고,
 * 이름이 보이면 "무엇이 있는지"가 드러나 기록의 의외성이 사라진다(2026-09-26 확정, 잠금 a).
 * 판정은 그대로 돈다 — 얻는 순간 목록에 나타난다.
 */
const OWNER_ONLY = new Set(FIRST_MILESTONES.flatMap((m) => [1, 2, 3].map((r) => `first_${m.key}_${r}`)));
export function isOwnerOnlyCode(code: string): boolean {
  // 이정표 정본에서 만든 목록으로만 — 모양(first_*_N)으로 보면 일반 칭호 first_bitter(첫 쓴맛) 같은 것까지 숨는다.
  return OWNER_ONLY.has(code);
}

/**
 * 판정 밖 **이벤트 훅**에서 직접 지급되는 코드 — 커버리지 감사 시 "누락"으로 오인 금지.
 *  - comeback: 출석 수령 트랜잭션(checkin/claim.ts) — 공백 증거(lastClaimedKstDay)가
 *    수령으로 소멸하므로 판정으로는 불가능, 훅 지급이 유일한 경로.
 *  - apex_shoot: 아바타 생성 수락(profile/pipeline.ts) — 생성 **시점**의 장착 상태
 *    (createProfileJob이 options.apexAtCreation으로 스냅샷)라 사후 판정 불가.
 *  - new_record: rank-leader 크론(world/event.ts) — max 1위 값의 **경신** 관측 순간 지급.
 *    "현재 1위" 판정(rank_max와 동일 술어)으로는 cond의 "경신"이 아니다.
 */
export const EVENT_HOOK_CODES = new Set<string>([
  'comeback', 'apex_shoot', 'new_record',
  // 추석 강화 대회 순위 칭호(2026-09) — 어드민 정산(lib/game/chuseok/contest.ts settleContest)이 지급.
  'chuseok26_moon1', 'chuseok26_moon2', 'chuseok26_moon3', 'chuseok26_flower1', 'chuseok26_flower2', 'chuseok26_flower3',
]);
