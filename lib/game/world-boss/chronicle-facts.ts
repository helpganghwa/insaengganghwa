/**
 * 연대기 사실표의 월드보스 줄(docs/WORLD-BOSS.md §8) — 순수 함수(테스트 대상).
 * 점령전과 직접 이어지는 사실만 넣는다: 보스가 머무는 구역이 그날 **점령됐는지(전리품째 넘어감)** / **지켜졌는지**.
 * 출현·원정대 기록처럼 그날 전투와 무관한 사실은 연대기 주제를 흐려 넣지 않는다.
 */
export type WorldBossAtZone = { zone: string; name: string; stage: number; lootDiamond: number; lootBoxes: number };

const lootText = (b: WorldBossAtZone) =>
  b.stage > 0 ? `${b.stage}단계 · 쌓인 전리품 💎${b.lootDiamond.toLocaleString('ko-KR')} 📦${b.lootBoxes.toLocaleString('ko-KR')}` : '아직 0단계 · 쌓인 전리품 없음';

export function worldBossDigestLines(
  captures: readonly { zone: string; winner: string; from: string | null }[],
  defenses: readonly { zone: string; owner: string }[],
  bosses: readonly WorldBossAtZone[],
): string[] {
  const byZone = new Map(bosses.map((b) => [b.zone, b] as const));
  const out: string[] = [];
  for (const c of captures) {
    const b = byZone.get(c.zone);
    if (!b) continue;
    out.push(
      `· 구역 「${c.zone}」에 월드보스 「${b.name}」이(가) 머물고 있었음(${lootText(b)}) — 길드 「${c.winner}」 이(가) 이 구역을 점령해, 원정이 종료될 때 전리품은 「${c.winner}」 금고로 들어감${c.from ? `(이전 주인 「${c.from}」)` : ''}`,
    );
  }
  for (const d of defenses) {
    const b = byZone.get(d.zone);
    if (!b) continue;
    out.push(`· 구역 「${d.zone}」에 월드보스 「${b.name}」이(가) 머물고 있음(${lootText(b)}) — 길드 「${d.owner}」 이(가) 이 구역을 지켜 내 전리품을 계속 쥐고 있음`);
  }
  return out;
}
