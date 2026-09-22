/**
 * 한가위 강화 대회 순위 — 순수 규칙(서버·테스트 공용). docs/CHUSEOK.md.
 *
 * 규칙(2026-09-22 사용자 확정): 아이템별·서버별로 **기준 시각의 현재 단계**가 높은 순, 같으면 **그 단계에
 * 먼저 도달한 사람**이 앞선다(도달 시각 = 그 장비의 마지막 강화 기록 시각, 기록이 없으면 획득 시각).
 * 하한 없음(+0도 순위에 든다). 정지·탈퇴 계정은 정산 시 제외하고 아래 순위가 승계(입력에서 미리 거른다).
 */
export type RankInput = {
  userId: string;
  nickname: string;
  level: number;
  /** ms epoch — null이면 맨 뒤. */
  reachedAt: number | null;
};

export type RankedRow = RankInput & { rank: number };

export function rankRows(rows: readonly RankInput[]): RankedRow[] {
  const sorted = [...rows].sort((a, b) => {
    if (b.level !== a.level) return b.level - a.level;
    const ta = a.reachedAt ?? Number.POSITIVE_INFINITY;
    const tb = b.reachedAt ?? Number.POSITIVE_INFINITY;
    if (ta !== tb) return ta - tb;
    return a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0;
  });
  // 동점(단계·시각 모두 같음)도 앞선 행이 앞 등수 — 보상 구간이 겹치지 않게 등수는 항상 유일.
  return sorted.map((r, i) => ({ ...r, rank: i + 1 }));
}
