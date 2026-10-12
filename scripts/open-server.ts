/**
 * 신서버 오픈(SERVER.md §6) — 운영 이벤트(코드 배포 불필요).
 *
 * 사용:
 *   bun run scripts/open-server.ts <serverId> <이름>                     # DIRECT_URL(기본) = 스테이징
 *   bun run scripts/open-server.ts <serverId> <이름> PROD_DATABASE_URL   # 프로덕션
 *   예: bun run scripts/open-server.ts 2 2서버 PROD_DATABASE_URL
 *
 * ⚠ 대상 env를 **반드시 명시**한다 — 기본값 DIRECT_URL은 스테이징이라, 프로덕션 오픈인 줄 알고
 *   인자 없이 돌리면 스테이징에 서버가 생기고 성공 로그만 찍힌다(프로덕션은 그대로 1서버).
 *   apply-migration.ts와 같은 규약(3번째 인자 = env 이름).
 *
 * 처리(단일 트랜잭션):
 *  1) servers 행 INSERT(status=open, --status=closed|full로 바꿀 수 있다 — closed인 동안은 운영자도 들어갈 수 없다)
 *  2) zones 50구역 시드 — 1서버 구역을 템플릿으로 복제(이름·지역·좌표), 새 id 부여
 *  3) zone_adjacency 간선 복제(id 매핑)
 *
 * 멱등 — 이미 존재하는 serverId면 중단.
 */
import { config } from 'dotenv';
import postgres from 'postgres';

config({ path: '.env.local' });

// 옵션(10-12 2서버 조사): --status=closed 로 미리 만들어 숨기기(공지 시각에 /admin/servers에서 open), --dry-run 은 전부
// 실행한 뒤 롤백(무엇이 생길지 확인), --force 는 구역 id 50단위 정렬 검사를 건너뛴다.
// 플래그는 **어느 자리에 있어도** 플래그다(3차 검사 A1-N1) — 종전엔 argv[4]부터만 봐서 `2 --dry-run PROD_DATABASE_URL`처럼
// 이름을 빼먹으면 이름이 '--dry-run'이 되고 드라이런은 꺼진 채 프로덕션에 서버가 open으로 생겼다.
const args = process.argv.slice(2);
const flags = args.filter((a) => a.startsWith('--'));
const positional = args.filter((a) => !a.startsWith('--'));
const serverId = Number(positional[0]);
const name = positional[1];
if (name && (/^[A-Z0-9_]+$/.test(name) || name.endsWith('_URL'))) {
  console.error(`이름 자리에 env 이름이 왔다: ${name} — 사용: <serverId> <이름> [ENV_NAME] [--옵션]`);
  process.exit(1);
}
const statusFlag = flags.find((f) => f.startsWith('--status='))?.slice('--status='.length) ?? 'open';
const dryRun = flags.includes('--dry-run');
const force = flags.includes('--force');
const unknownFlags = flags.filter((f) => !f.startsWith('--status=') && f !== '--dry-run' && f !== '--force');
if (unknownFlags.length > 0) {
  console.error(`모르는 옵션: ${unknownFlags.join(' ')} (오타로 실제 오픈되는 것을 막기 위해 중단)`);
  process.exit(1);
}
if (!Number.isInteger(serverId) || serverId < 2 || !name || !['open', 'full', 'closed'].includes(statusFlag)) {
  console.error('사용: bun run scripts/open-server.ts <serverId(2+)> <이름> [ENV_NAME] [--status=open|full|closed] [--dry-run] [--force]');
  console.error('  ENV_NAME 생략 시 DIRECT_URL(스테이징). 프로덕션은 PROD_DATABASE_URL을 명시한다.');
  process.exit(1);
}

const urlEnv = positional[2] ?? 'DIRECT_URL';
const url = process.env[urlEnv];
if (!url) {
  console.error(`${urlEnv} 미설정 — .env.local 확인`);
  process.exit(1);
}
console.log(`[open-server] 대상 = ${urlEnv}${urlEnv === 'DIRECT_URL' ? ' (스테이징 기본값)' : ''}`);
const sql = postgres(url, { prepare: false, max: 1 });

try {
  // 대상 DB 확인용 — 지금 열려 있는 서버를 먼저 보여 준다(엉뚱한 DB에 붙었는지 눈으로 검증).
  const before = await sql`select id, name, status from servers order by id`;
  console.log(
    `[open-server] 현재 서버: ${before.length === 0 ? '(없음)' : before.map((s) => `${s.id}=${s.name}(${s.status})`).join(', ')}`,
  );

  await sql.begin(async (tx) => {
    const [exists] = await tx`select id from servers where id = ${serverId}`;
    if (exists) throw new Error(`server ${serverId} already exists`);

    await tx`insert into servers (id, name, status) values (${serverId}, ${name}, ${statusFlag})`;

    // 1서버 구역 템플릿 복제 — 새 id = 기존 max + offset.
    const tpl = await tx`
      select id, region, name, map_x, map_y from zones where server_id = 1 order by id`;
    if (tpl.length === 0) throw new Error('템플릿(1서버 zones) 없음');
    const [{ next }] = await tx`select coalesce(max(id), 0) + 1 as next from zones`;
    const base = Number(next);
    // 구역 설명(zoneLoreOf)이 50단위 매핑을 전제하므로 새 서버의 첫 구역 id는 50k+1 이어야 한다(2서버=51).
    if (!force && (base - 1) % 50 !== 0) throw new Error(`zones 다음 id ${base}가 50단위 경계가 아니다(기대 ${Math.ceil((base - 1) / 50) * 50 + 1}). 확인 뒤 --force`);
    const idMap = new Map<number, number>();
    for (let i = 0; i < tpl.length; i++) idMap.set(tpl[i]!.id as number, base + i);

    for (const z of tpl) {
      await tx`
        insert into zones (id, server_id, region, name, map_x, map_y)
        values (${idMap.get(z.id as number)!}, ${serverId}, ${z.region}, ${z.name}, ${z.map_x}, ${z.map_y})`;
    }

    const edges = await tx`
      select a.zone_a, a.zone_b from zone_adjacency a
      join zones z on z.id = a.zone_a where z.server_id = 1`;
    for (const e of edges) {
      const na = idMap.get(e.zone_a as number);
      const nb = idMap.get(e.zone_b as number);
      if (na && nb) await tx`insert into zone_adjacency (zone_a, zone_b) values (${na}, ${nb})`;
    }

    console.log(`[open-server] ${name}(id=${serverId}, status=${statusFlag}) — zones ${tpl.length}(id ${base}~${base + tpl.length - 1})·edges ${edges.length} ${dryRun ? '시드 확인(롤백)' : '시드 완료'}`);
    if (dryRun) throw new Error('DRY_RUN_ROLLBACK');
  }).catch((e: unknown) => {
    if ((e as Error).message === 'DRY_RUN_ROLLBACK') return;
    throw e;
  });
} finally {
  await sql.end({ timeout: 5 });
}
