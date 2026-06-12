/**
 * 신서버 오픈(SERVER.md §6) — 운영 이벤트(코드 배포 불필요).
 *
 * 사용: bun run scripts/open-server.ts <serverId> <이름>
 *   예: bun run scripts/open-server.ts 2 2서버
 *
 * 처리(단일 트랜잭션):
 *  1) servers 행 INSERT(status=open)
 *  2) zones 50구역 시드 — 1서버 구역을 템플릿으로 복제(이름·지역·좌표), 새 id 부여
 *  3) zone_adjacency 간선 복제(id 매핑)
 *
 * 환경: DIRECT_URL(.env.local). 멱등 — 이미 존재하는 serverId면 중단.
 */
import { config } from 'dotenv';
import postgres from 'postgres';

config({ path: '.env.local' });

const serverId = Number(process.argv[2]);
const name = process.argv[3];
if (!Number.isInteger(serverId) || serverId < 2 || !name) {
  console.error('사용: bun run scripts/open-server.ts <serverId(2+)> <이름>');
  process.exit(1);
}

const url = process.env.DIRECT_URL;
if (!url) throw new Error('DIRECT_URL required');
const sql = postgres(url, { prepare: false, max: 1 });

try {
  await sql.begin(async (tx) => {
    const [exists] = await tx`select id from servers where id = ${serverId}`;
    if (exists) throw new Error(`server ${serverId} already exists`);

    await tx`insert into servers (id, name, status) values (${serverId}, ${name}, 'open')`;

    // 1서버 구역 템플릿 복제 — 새 id = 기존 max + offset.
    const tpl = await tx`
      select id, region, name, map_x, map_y from zones where server_id = 1 order by id`;
    if (tpl.length === 0) throw new Error('템플릿(1서버 zones) 없음');
    const [{ next }] = await tx`select coalesce(max(id), 0) + 1 as next from zones`;
    const base = Number(next);
    const idMap = new Map<number, number>();
    for (let i = 0; i < tpl.length; i++) idMap.set(tpl[i]!.id as number, base + i);

    for (const z of tpl) {
      // 단계 개방(콜드스타트): 신서버는 왕국(kingdom)만 열고 시작 — scripts/open-region.ts로 순차 개방.
      await tx`
        insert into zones (id, server_id, region, name, map_x, map_y, locked)
        values (${idMap.get(z.id as number)!}, ${serverId}, ${z.region}, ${z.name}, ${z.map_x}, ${z.map_y}, ${z.region !== 'kingdom'})`;
    }

    const edges = await tx`
      select a.zone_a, a.zone_b from zone_adjacency a
      join zones z on z.id = a.zone_a where z.server_id = 1`;
    for (const e of edges) {
      const na = idMap.get(e.zone_a as number);
      const nb = idMap.get(e.zone_b as number);
      if (na && nb) await tx`insert into zone_adjacency (zone_a, zone_b) values (${na}, ${nb})`;
    }

    console.log(`[open-server] ${name}(id=${serverId}) — zones ${tpl.length}·edges ${edges.length} 시드 완료`);
  });
} finally {
  await sql.end({ timeout: 5 });
}
