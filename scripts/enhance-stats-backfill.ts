// 강화 누적 지표 백필(2026-09-28, 0219) — 강화 기록이 있는 모든 (유저, 서버)의 enhance_stats를 전체 기록으로 재구성한다.
//   실행: bun run scripts/enhance-stats-backfill.ts [--apply] [DATABASE_URL]   (기본 dry-run · .env.local DATABASE_URL)
//   순서: 0219 적용 → 코드 배포 → 이 스크립트 --apply. 코드(수령 시 반영)가 먼저 돌아야 재구성 뒤 수령이 빠지지 않는다.
//   프로덕션은 URL을 명시(PROD_DATABASE_URL 값).
//   - 유저마다 enhance_stats_rebuild 한 번 = 트랜잭션 하나. 재구성 동안 그 유저의 수령은 행 락을 기다렸다가 결과 위에 반영된다.
//   - 이미 ready인 행은 건너뛴다(재실행 안전 — 중간에 끊겨도 다시 돌리면 남은 것만 한다).
//   - 기록이 많은 유저(수백만 건)는 기본 statement_timeout에 걸릴 수 있어 트랜잭션 안에서만 풀어 준다(SET LOCAL —
//     세션 SET은 트랜잭션 풀러로 새어 다른 요청에 붙는다).
//   - dry-run은 대상 수와 기록 수만 `read only` 트랜잭션으로 센다.
import postgres from 'postgres';

const apply = process.argv.includes('--apply');
const url = process.argv.find((a) => a.startsWith('postgres')) ?? process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL 필요');
const sql = postgres(url, { prepare: false, max: 1 });

type Target = { user_id: string; server_id: number; logs: number };

async function targets(tx: postgres.TransactionSql): Promise<Target[]> {
  return (await tx`
    select l.user_id::text, l.server_id, count(*)::int as logs
    from enhancement_logs l
    where exists (select 1 from profiles p where p.id = l.user_id) -- 탈퇴 잔여 기록(FK 없음)은 대상 아님
      and not exists (select 1 from enhance_stats s
                        where s.user_id = l.user_id and s.server_id = l.server_id and s.ready)
    group by 1, 2
    order by 3
  `) as unknown as Target[];
}

async function main(): Promise<void> {
  const list = await sql.begin('read only', (tx) => targets(tx));
  const total = list.reduce((a, t) => a + t.logs, 0);
  console.log(`대상 ${list.length}명 · 기록 ${total.toLocaleString()}건 · 최대 ${(list.at(-1)?.logs ?? 0).toLocaleString()}건`);
  if (!apply) {
    console.log('dry-run — --apply로 실행');
    return;
  }
  let done = 0;
  const t0 = Date.now();
  for (const t of list) {
    const t1 = Date.now();
    const [r] = await sql.begin(async (tx) => {
      await tx`set local statement_timeout = 0`;
      return tx`select enhance_stats_rebuild(${t.user_id}::uuid, ${t.server_id}::smallint) as n`;
    });
    done++;
    const ms = Date.now() - t1;
    if (ms > 3000 || done % 200 === 0 || done === list.length) {
      console.log(`${done}/${list.length} · ${t.user_id.slice(0, 8)} s${t.server_id} ${Number(r?.n).toLocaleString()}건 ${ms}ms`);
    }
  }
  const left = await sql.begin('read only', (tx) => targets(tx));
  console.log(`완료 ${done}명 · ${Math.round((Date.now() - t0) / 1000)}s · 남은 대상 ${left.length}`);
}

main()
  .then(() => sql.end())
  .catch(async (e) => {
    console.error(e);
    await sql.end();
    process.exit(1);
  });
