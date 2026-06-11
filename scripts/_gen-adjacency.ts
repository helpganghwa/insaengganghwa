// 구역 인접 그래프 생성(검토용) — 좌표(map_x/map_y) 기반 근접 그래프.
//   알고리즘: 대칭 kNN(k=3, 합집합) + 연결성 보정(분리된 컴포넌트를 최단 간선으로 연결).
//   결과: 정규형 a<b 간선 목록 + 구역별 이웃 + 연결성/지역 교차 통계 출력.
//   실행: bun --conditions react-server scripts/_gen-adjacency.ts [--sql]
import { config } from 'dotenv';
config({ path: '.env.local' });

const { db } = await import('@/lib/db/client');
const { zones } = await import('@/lib/db/schema/guild');

type Z = { id: number; region: string; name: string; x: number; y: number };
const rows = (await db
  .select({ id: zones.id, region: zones.region, name: zones.name, x: zones.mapX, y: zones.mapY })
  .from(zones)) as Z[];
rows.sort((a, b) => a.id - b.id);

const dist = (a: Z, b: Z) => Math.hypot(a.x - b.x, a.y - b.y);
const K = 3;

// 대칭 kNN — i의 최근접 K개와 연결(j가 i의 K-NN이거나 i가 j의 K-NN이면 간선).
const knn = new Map<number, number[]>();
for (const z of rows) {
  const near = rows
    .filter((o) => o.id !== z.id)
    .sort((a, b) => dist(z, a) - dist(z, b))
    .slice(0, K)
    .map((o) => o.id);
  knn.set(z.id, near);
}
const edgeSet = new Set<string>();
const key = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);
for (const z of rows) for (const n of knn.get(z.id)!) edgeSet.add(key(z.id, n));

// 연결성 보정 — 분리 컴포넌트 발견 시, 두 컴포넌트 사이 최단 간선을 추가해 병합(전체 1-컴포넌트).
function components(): number[][] {
  const adj = new Map<number, Set<number>>();
  for (const z of rows) adj.set(z.id, new Set());
  for (const e of edgeSet) {
    const [a, b] = e.split('-').map(Number);
    adj.get(a!)!.add(b!);
    adj.get(b!)!.add(a!);
  }
  const seen = new Set<number>();
  const comps: number[][] = [];
  for (const z of rows) {
    if (seen.has(z.id)) continue;
    const stack = [z.id];
    const comp: number[] = [];
    while (stack.length) {
      const c = stack.pop()!;
      if (seen.has(c)) continue;
      seen.add(c);
      comp.push(c);
      for (const n of adj.get(c)!) if (!seen.has(n)) stack.push(n);
    }
    comps.push(comp);
  }
  return comps;
}
let comps = components();
while (comps.length > 1) {
  // 가장 큰 컴포넌트와 나머지 중 최단 간선으로 병합.
  comps.sort((a, b) => b.length - a.length);
  const main = new Set(comps[0]);
  let best: { a: number; b: number; d: number } | null = null;
  for (const z of rows) {
    if (!main.has(z.id)) continue;
    for (const o of rows) {
      if (main.has(o.id)) continue;
      const d = dist(z, o);
      if (!best || d < best.d) best = { a: z.id, b: o.id, d };
    }
  }
  if (!best) break;
  edgeSet.add(key(best.a, best.b));
  comps = components();
}

const edges = [...edgeSet]
  .map((e) => e.split('-').map(Number) as [number, number])
  .map(([a, b]) => (a < b ? [a, b] : [b, a]) as [number, number])
  .sort((p, q) => p[0] - q[0] || p[1] - q[1]);

const byId = new Map(rows.map((z) => [z.id, z]));
const degree = new Map<number, number>();
for (const [a, b] of edges) {
  degree.set(a, (degree.get(a) ?? 0) + 1);
  degree.set(b, (degree.get(b) ?? 0) + 1);
}

if (process.argv.includes('--sql')) {
  const vals = edges.map(([a, b]) => `(${a},${b})`).join(',\n  ');
  console.log(
    `INSERT INTO zone_adjacency (zone_a, zone_b) VALUES\n  ${vals}\nON CONFLICT DO NOTHING;`,
  );
} else {
  console.log(`총 구역 ${rows.length} · 간선 ${edges.length} · 컴포넌트 ${components().length}\n`);
  console.log('구역별 이웃:');
  for (const z of rows) {
    const ns = edges
      .filter(([a, b]) => a === z.id || b === z.id)
      .map(([a, b]) => (a === z.id ? b : a));
    const crossRegion = ns.filter((n) => byId.get(n)!.region !== z.region).length;
    console.log(
      `  [${z.id}] ${z.region} ${z.name} (deg ${degree.get(z.id) ?? 0}, 교차 ${crossRegion}) → ${ns
        .map((n) => `${n}:${byId.get(n)!.name}`)
        .join(', ')}`,
    );
  }
  const isolated = rows.filter((z) => (degree.get(z.id) ?? 0) === 0);
  console.log(`\n고립 구역: ${isolated.length === 0 ? '없음' : isolated.map((z) => z.id).join(',')}`);
}
process.exit(0);
