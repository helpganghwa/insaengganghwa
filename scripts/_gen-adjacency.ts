// 구역 인접 그래프 생성(검토용) — 좌표 기반 **평면 그래프**(간선 교차 없음).
//   알고리즘: 짧은 간선 우선 그리디 추가(이미 추가된 간선과 교차하면 skip, 차수 상한)
//            → 연결성 보정(분리 컴포넌트를 교차 없는 최단 간선으로 병합).
//   무방향 간선, 정규형 a<b. 교차수 0 검증 포함.
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
const byId = new Map(rows.map((z) => [z.id, z]));

const dist = (a: Z, b: Z) => Math.hypot(a.x - b.x, a.y - b.y);
const MAXDEG = 4; // 구역당 최대 길 수
const MAXLEN = 30; // 너무 긴(맵 가로지르는) 길 배제

// 선분 교차(고유 교차만) — 두 간선이 노드를 공유하면 '교차' 아님(접점).
const orient = (a: Z, b: Z, c: Z) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
function properCross(e: [number, number], f: [number, number]): boolean {
  if (e[0] === f[0] || e[0] === f[1] || e[1] === f[0] || e[1] === f[1]) return false; // 노드 공유
  const [p1, p2] = [byId.get(e[0])!, byId.get(e[1])!];
  const [p3, p4] = [byId.get(f[0])!, byId.get(f[1])!];
  const d1 = orient(p3, p4, p1);
  const d2 = orient(p3, p4, p2);
  const d3 = orient(p1, p2, p3);
  const d4 = orient(p1, p2, p4);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

// 후보 — 모든 쌍을 길이 오름차순.
const cand: { a: number; b: number; d: number }[] = [];
for (let i = 0; i < rows.length; i++)
  for (let j = i + 1; j < rows.length; j++)
    cand.push({ a: rows[i]!.id, b: rows[j]!.id, d: dist(rows[i]!, rows[j]!) });
cand.sort((x, y) => x.d - y.d);

const added: [number, number][] = [];
const deg = new Map<number, number>();
const crossesAny = (e: [number, number]) => added.some((f) => properCross(e, f));
for (const { a, b, d } of cand) {
  if (d > MAXLEN) continue;
  if ((deg.get(a) ?? 0) >= MAXDEG || (deg.get(b) ?? 0) >= MAXDEG) continue;
  if (crossesAny([a, b])) continue;
  added.push([a, b]);
  deg.set(a, (deg.get(a) ?? 0) + 1);
  deg.set(b, (deg.get(b) ?? 0) + 1);
}

// 연결성 — 분리 컴포넌트를 교차 없는 최단 간선으로 병합(차수/길이 상한 무시).
function components(): number[][] {
  const adj = new Map<number, Set<number>>();
  for (const z of rows) adj.set(z.id, new Set());
  for (const [a, b] of added) {
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
let comps = components();
while (comps.length > 1) {
  comps.sort((a, b) => b.length - a.length);
  const main = new Set(comps[0]);
  let best: { a: number; b: number; d: number } | null = null;
  for (const z of rows) {
    if (!main.has(z.id)) continue;
    for (const o of rows) {
      if (main.has(o.id)) continue;
      const e: [number, number] = z.id < o.id ? [z.id, o.id] : [o.id, z.id];
      if (crossesAny(e)) continue; // 교차 없는 다리만
      const d = dist(z, o);
      if (!best || d < best.d) best = { a: e[0], b: e[1], d };
    }
  }
  if (!best) break;
  added.push([best.a, best.b]);
  comps = components();
}

const edges = added
  .map(([a, b]) => (a < b ? [a, b] : [b, a]) as [number, number])
  .sort((p, q) => p[0] - q[0] || p[1] - q[1]);

// 교차 검증.
let crossCount = 0;
for (let i = 0; i < edges.length; i++)
  for (let j = i + 1; j < edges.length; j++) if (properCross(edges[i]!, edges[j]!)) crossCount++;

if (process.argv.includes('--sql')) {
  const vals = edges.map(([a, b]) => `(${a},${b})`).join(',\n  ');
  console.log(`INSERT INTO zone_adjacency (zone_a, zone_b) VALUES\n  ${vals}\nON CONFLICT DO NOTHING;`);
} else {
  console.log(`총 구역 ${rows.length} · 간선 ${edges.length} · 컴포넌트 ${components().length} · 교차 ${crossCount}\n`);
  const degree = new Map<number, number>();
  for (const [a, b] of edges) {
    degree.set(a, (degree.get(a) ?? 0) + 1);
    degree.set(b, (degree.get(b) ?? 0) + 1);
  }
  for (const z of rows) {
    const ns = edges.filter(([a, b]) => a === z.id || b === z.id).map(([a, b]) => (a === z.id ? b : a));
    const cross = ns.filter((n) => byId.get(n)!.region !== z.region).length;
    console.log(
      `  [${z.id}] ${z.region} ${z.name} (deg ${degree.get(z.id) ?? 0}, 교차지역 ${cross}) → ${ns
        .map((n) => `${n}:${byId.get(n)!.name}`)
        .join(', ')}`,
    );
  }
  const isolated = rows.filter((z) => (degree.get(z.id) ?? 0) === 0);
  console.log(`\n고립 구역: ${isolated.length === 0 ? '없음' : isolated.map((z) => z.id).join(',')}`);
}
process.exit(0);
