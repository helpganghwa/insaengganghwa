/**
 * 칭호 판정 결과 인스턴스 캐시 — 새로고침 연타로 27쿼리 지표 수집이 반복되지 않게(풀러 보호). 키 = `${userId}:${serverId}`.
 * 판정(judge.ts)과 장비 칭호 즉시 확인(equipment-titles.ts)이 함께 쓴다 — 장착이 바뀌면 후자가 이 키를 지워,
 * 칭호 화면을 30초 안에 다시 열어도 새 장착 상태로 판정한다(2026-11-06 업데이트 18 후속).
 */
export const judgeCache = new Map<string, { at: number; result: { found: string[]; active: Set<string> } }>();
