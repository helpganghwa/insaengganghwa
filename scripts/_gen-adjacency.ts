// 구역 인접 그래프 생성(검토용) — **전략적 희소 평면 그래프**.
//   기반: RNG(상대 이웃 그래프) — 평면·연결·희소(불필요한 삼각 메시 없음 → 길목/전략성).
//   특수: 성벽 구역(왕성)은 지정 성문으로만 연결(다른 인접 제거). 교차수 0 검증.
//   무방향 간선, 정규형 a<b.  실행: bun --conditions react-server scripts/_gen-adjacency.ts [--sql]
import { config } from 'dotenv';
config({ path: '.env.local' });

const { db } = await import('@/lib/db/client');
const { zones } = await import('@/lib/db/schema/guild');

type Z = { id: number; region: string; name: string; x: number; y: number };
const rows = (await db
  .select({ id: zones.id, region: zones.region, name: zones.name, x: zones.mapX, y: zones.mapY })
  .from(zones)) as Z[];
rows.sort((a, b) => a.id - b.id);
const byId = new Map(rows.map((z) => [z.id, z]));
const dist = (a: Z, b: Z) => Math.hypot(a.x - b.x, a.y - b.y);

// 성벽 구역 — 지정 성문으로만 진입(다른 모든 인접 제거). { 구역: 성문 }.
const WALLED: Record<number, number> = { 41: 43 }; // 왕성 → 성문

// RNG — 간선 (a,b)는 어떤 제3 구역 c도 a·b 둘 다보다 가깝지 않을 때만 존재.
const key = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);
const edgeSet = new Set<string>();
for (let i = 0; i < rows.length; i++) {
  for (let j = i + 1; j < rows.length; j++) {
    const a = rows[i]!;
    const b = rows[j]!;
    // 성벽 구역은 RNG 제외(나중에 성문 간선만 강제).
    if (WALLED[a.id] !== undefined || WALLED[b.id] !== undefined) continue;
    const dab = dist(a, b);
    let blocked = false;
    for (const c of rows) {
      if (c.id === a.id || c.id === b.id) continue;
      if (Math.max(dist(c, a), dist(c, b)) < dab - 1e-9) {
        blocked = true;
        break;
      }
    }
    if (!blocked) edgeSet.add(key(a.id, b.id));
  }
}
// 성벽 구역 — 성문 간선만 강제.
for (const [zStr, gate] of Object.entries(WALLED)) edgeSet.add(key(Number(zStr), gate));

const edges = [...edgeSet]
  .map((e) => e.split('-').map(Number) as [number, number])
  .map(([a, b]) => (a < b ? [a, b] : [b, a]) as [number, number])
  .sort((p, q) => p[0] - q[0] || p[1] - q[1]);

// 교차 검증(고유 교차만 — 노드 공유는 접점).
const orient = (a: Z, b: Z, c: Z) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
function properCross(e: [number, number], f: [number, number]): boolean {
  if (e[0] === f[0] || e[0] === f[1] || e[1] === f[0] || e[1] === f[1]) return false;
  const [p1, p2] = [byId.get(e[0])!, byId.get(e[1])!];
  const [p3, p4] = [byId.get(f[0])!, byId.get(f[1])!];
  const d1 = orient(p3, p4, p1);
  const d2 = orient(p3, p4, p2);
  const d3 = orient(p1, p2, p3);
  const d4 = orient(p1, p2, p4);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}
const crossing: string[] = [];
for (let i = 0; i < edges.length; i++)
  for (let j = i + 1; j < edges.length; j++)
    if (properCross(edges[i]!, edges[j]!))
      crossing.push(`${edges[i]!.join('-')} × ${edges[j]!.join('-')}`);

// 연결성.
function components(): number[][] {
  const adj = new Map<number, Set<number>>();
  for (const z of rows) adj.set(z.id, new Set());
  for (const [a, b] of edges) {
    adj.get(a)!.add(b);
    adj.get(b)!.add(a);
  }
  const seen = new Set<number>();
  const comps: number[][] = [];
  for (const z of rows) {
    if (seen.has(z.id)) continue;
    const st = [z.id];
    const comp: number[] = [];
    while (st.length) {
      const c = st.pop()!;
      if (seen.has(c)) continue;
      seen.add(c);
      comp.push(c);
      for (const n of adj.get(c)!) if (!seen.has(n)) st.push(n);
    }
    comps.push(comp);
  }
  return comps;
}

if (process.argv.includes('--sql')) {
  const vals = edges.map(([a, b]) => `(${a},${b})`).join(',\n  ');
  console.log(`INSERT INTO zone_adjacency (zone_a, zone_b) VALUES\n  ${vals}\nON CONFLICT DO NOTHING;`);
} else {
  console.log(
    `총 구역 ${rows.length} · 간선 ${edges.length} · 컴포넌트 ${components().length} · 교차 ${crossing.length}`,
  );
  if (crossing.length) console.log('교차:', crossing.join(' / '));
  console.log('');
  const degree = new Map<number, number>();
  for (const [a, b] of edges) {
    degree.set(a, (degree.get(a) ?? 0) + 1);
    degree.set(b, (degree.get(b) ?? 0) + 1);
  }
  for (const z of rows) {
    const ns = edges.filter(([a, b]) => a === z.id || b === z.id).map(([a, b]) => (a === z.id ? b : a));
    const cross = ns.filter((n) => byId.get(n)!.region !== z.region).length;
    const wall = WALLED[z.id] !== undefined ? ' [성벽]' : '';
    console.log(
      `  [${z.id}] ${z.region} ${z.name}${wall} (deg ${degree.get(z.id) ?? 0}, 교차지역 ${cross}) → ${ns
        .map((n) => `${n}:${byId.get(n)!.name}`)
        .join(', ')}`,
    );
  }
  const isolated = rows.filter((z) => (degree.get(z.id) ?? 0) === 0);
  console.log(`\n고립 구역: ${isolated.length === 0 ? '없음' : isolated.map((z) => z.id).join(',')}`);
}
process.exit(0);
