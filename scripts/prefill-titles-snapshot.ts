// 칭호 랭킹(지표 titles) 스냅샷 미리 채우기(2026-11-06 업데이트 18, 배포 전 1회) — 열린 서버(openServerIds) 전부에
// rebuildLeaderboardSnapshot(sid, ['titles'])를 돌린다. 옛 코드는 모르는 지표라 배포 전에 채워도 무해하다.
// 왜 먼저 채우나(docs/TITLES.md 배포 순서): 빈 보드로 배포하면 시간별 재계산 전까지 칭호 화면을 연 몇 명만 보드에 올라
//   ① 그중 1위가 명불허전(rank_titles)을 발견하고(원장·💎20 보상) ② 6종 10위 이내인 사람의 칠관왕 잠금이 영구로 풀리며
//   ③ 일일 1위 교체 크론(runRankingLeaders)이 몇 명뿐인 보드의 1위를 시드했다가 보드가 채워지면 '1위 교체' 월드 소식·길드 기록을
//      거짓으로 남긴다.
//
// 실행: bun --conditions=react-server scripts/prefill-titles-snapshot.ts --db=staging|prod [--confirm]
//   기본은 드라이런 — 읽기 전용 트랜잭션으로 서버별로 채울 행 수(칭호 1개 이상 보유, 정지 계정 포함 전 수)와 지금 보드 행 수만 센다.
//   --confirm이면 서버마다 rebuildLeaderboardSnapshot(sid, ['titles'])를 실행하고 적재 행 수를 출력한다(멱등, 다시 돌려도 같은 결과).
// 연결 문자열·키는 출력하지 않는다.
import { config } from 'dotenv';
import postgres from 'postgres';

config({ path: '.env.local' });
config({ path: '.env', override: false });

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
const confirm = process.argv.includes('--confirm');
const target = arg('db');
const URL = target === 'prod' ? process.env.PROD_DATABASE_URL : target === 'staging' ? process.env.DATABASE_URL : undefined;
if (!URL) {
  console.error('--db=staging|prod 필요(해당 연결 문자열 환경 변수가 있어야 한다)');
  process.exit(1);
}
// 공용 db 클라이언트(lib/db/client)가 같은 DB를 보게 한다(모듈을 불러오기 전에).
process.env.DATABASE_URL = URL;

const { openServerIds } = await import('../lib/game/server-list');
const { rebuildLeaderboardSnapshot } = await import('../lib/game/leaderboard/snapshot');
const { titleCountsByServerSql } = await import('../lib/game/leaderboard/title-count');
const { db } = await import('../lib/db/client');

const sql = postgres(URL, { prepare: false, max: 1 });
let failed = false;
try {
  const sids = await openServerIds();
  console.log(`[prefill-titles] db=${target} 열린 서버 ${sids.join(', ')} · ${confirm ? '실행' : '드라이런'}`);
  for (const sid of sids) {
    const [{ n: boardNow }] = await sql<{ n: number }[]>`
      select count(*)::int as n from leaderboard_ranks where server_id = ${sid} and metric = 'titles'`;
    if (!confirm) {
      // 드라이런 — 적재할 값과 같은 집계를 읽기만 한다(정지 계정 제외 전 수).
      const rows = (await db.transaction(
        async (tx) => tx.execute(titleCountsByServerSql(sid)),
        { accessMode: 'read only' },
      )) as unknown as { user_id: string; value: number }[];
      const holders = rows.filter((r) => Number(r.value) > 0).length;
      console.log(`  서버 ${sid}: 지금 보드 ${boardNow}행 → 채울 후보 ${holders}명(정지 계정 제외 전)`);
      continue;
    }
    const counts = await rebuildLeaderboardSnapshot(sid, ['titles']);
    const [{ n: boardAfter }] = await sql<{ n: number }[]>`
      select count(*)::int as n from leaderboard_ranks where server_id = ${sid} and metric = 'titles'`;
    console.log(`  서버 ${sid}: 보드 ${boardNow}행 → 적재 ${counts.titles ?? 0}행(지금 ${boardAfter}행)`);
  }
  if (!confirm) console.log('[prefill-titles] 드라이런 끝 — 실제로 채우려면 --confirm');
} catch (e) {
  failed = true;
  console.error('[prefill-titles] 실패', (e as Error).message);
} finally {
  await sql.end();
  process.exit(failed ? 1 : 0);
}
