/**
 * '전체' 연표 소급 정리 — 새 등재 기준(판도 이정표·기록적 개인 활약)으로 과거 headline 재평가.
 * conquest_battles를 날짜순 리플레이해 각 날의 before/after 소유 상태를 복원, 미달이면 headline=''.
 * 실행: bun --conditions=react-server scripts/prune-chronicle-headlines.ts            (드라이런)
 *       bun --conditions=react-server scripts/prune-chronicle-headlines.ts --confirm  (적용)
 */
import postgres from 'postgres';

const CONFIRM = process.argv.includes('--confirm');
const SERVER = 1;
const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

type FinaleEvent = [number, number, unknown, number];
type Finale = { roster?: Record<string, { userId: string }>; events?: FinaleEvent[] } | null;

const zones = (await sql`
  select id::int as id, name, region::text as region from zones where server_id = ${SERVER}
`) as unknown as { id: number; name: string; region: string }[];
const battles = (await sql`
  select cb.battle_kst_day::text as day, cb.zone_id::int as zone_id, g.name as winner, cb.finale
  from conquest_battles cb left join guilds g on g.id = cb.winner_guild_id
  where cb.server_id = ${SERVER} order by cb.battle_kst_day
`) as unknown as { day: string; zone_id: number; winner: string | null; finale: Finale }[];
const rows = (await sql`
  select kst_day::text as day, headline from world_chronicle
  where server_id = ${SERVER} order by kst_day
`) as unknown as { day: string; headline: string }[];

const countsOf = (owner: Map<number, string | null>) => {
  const m = new Map<string, number>();
  for (const o of owner.values()) if (o) m.set(o, (m.get(o) ?? 0) + 1);
  return m;
};
const leaderOf = (counts: Map<string, number>): string | null => {
  let best: string | null = null, bestN = 0, tie = false;
  for (const [g, n] of counts) {
    if (n > bestN) { best = g; bestN = n; tie = false; }
    else if (n === bestN) tie = true;
  }
  return tie ? null : best;
};

// 날짜순 리플레이 — 각 전투일의 before/after 소유 스냅샷으로 이정표 판정.
const owner = new Map<number, string | null>(zones.map((z) => [z.id, null]));
const byDay = new Map<string, typeof battles>();
for (const b of battles) byDay.set(b.day, [...(byDay.get(b.day) ?? []), b]);

const verdicts = new Map<string, { keep: boolean; reasons: string[] }>();
for (const [day, dayBattles] of [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  const before = new Map(owner);
  for (const b of dayBattles) if (b.winner) owner.set(b.zone_id, b.winner);
  const after = new Map(owner);

  const bc = countsOf(before), ac = countsOf(after);
  const reasons: string[] = [];
  const pl = leaderOf(bc), nl = leaderOf(ac);
  if (pl && nl && pl !== nl) reasons.push(`1위 교체: ${pl} → ${nl}`);
  const regionIds = new Map<string, number[]>();
  for (const z of zones) regionIds.set(z.region, [...(regionIds.get(z.region) ?? []), z.id]);
  for (const [region, ids] of regionIds) {
    const os = new Set(ids.map((id) => after.get(id) ?? null));
    if (os.size === 1) {
      const g = [...os][0];
      if (g && !ids.every((id) => before.get(id) === g)) reasons.push(`지역 완전 장악: ${g} — ${region}`);
    }
  }
  for (const g of new Set([...bc.keys(), ...ac.keys()])) {
    const b0 = bc.get(g) ?? 0, a0 = ac.get(g) ?? 0;
    if (b0 > 0 && a0 === 0) reasons.push(`영토 소멸: ${g}`);
    if (b0 === 0 && a0 > 0) reasons.push(bc.size === 0 ? `대륙 최초 점령: ${g}` : `판도 데뷔: ${g}`);
  }
  // 기록적 개인 활약(단일 날 처치/수비 5회+) — finale 이벤트 합산.
  const kills = new Map<string, number>(), survives = new Map<string, number>();
  for (const b of dayBattles) {
    if (!b.finale?.roster || !b.finale.events) continue;
    for (const [a, t, , hp] of b.finale.events) {
      if (hp <= 0) {
        const u = b.finale.roster[a]?.userId;
        if (u) kills.set(u, (kills.get(u) ?? 0) + 1);
      } else {
        const u = b.finale.roster[t]?.userId;
        if (u) survives.set(u, (survives.get(u) ?? 0) + 1);
      }
    }
  }
  const maxFeat = Math.max(0, ...kills.values(), ...survives.values());
  if (maxFeat >= 5) reasons.push(`기록적 개인 활약: ${maxFeat}회`);

  verdicts.set(day, { keep: reasons.length > 0, reasons });
}

console.log(`=== 재평가 (headline 있는 행 ${rows.filter((r) => r.headline).length}건) ===`);
const toClear: string[] = [];
for (const r of rows) {
  const v = verdicts.get(r.day) ?? { keep: false, reasons: [] };
  const has = r.headline && r.headline.trim().length > 0;
  const action = !has ? '(headline 없음 — 유지)' : v.keep ? `유지 ✓ [${v.reasons.join(' / ')}]` : '→ 비움';
  console.log(`${r.day}: ${action}${has ? `  | 현재: ${r.headline}` : ''}`);
  if (has && !v.keep) toClear.push(r.day);
}

if (CONFIRM && toClear.length > 0) {
  await sql`update world_chronicle set headline = '' where server_id = ${SERVER} and kst_day in ${sql(toClear)}`;
  console.log(`\n적용: ${toClear.length}건 headline 비움 (${toClear.join(', ')})`);
} else {
  console.log(`\n드라이런 — 비울 대상 ${toClear.length}건: ${toClear.join(', ') || '(없음)'}`);
}
await sql.end();
process.exit(0);
