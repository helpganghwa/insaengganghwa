// 튜토리얼 테스트 준비 — 대상 유저의 상태 출력 + tutorial_step=1(노출)로 설정.
// 실행: bun run scripts/_set-tutorial.ts <user_uuid>
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });

const uid = process.argv[2];
if (!uid) {
  console.error('usage: bun run scripts/_set-tutorial.ts <user_uuid>');
  process.exit(1);
}
const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error('DIRECT_URL/DATABASE_URL missing');
  process.exit(1);
}
const sql = postgres(url, { prepare: false, max: 1 });

try {
  const [p] = await sql<{ nickname: string; tutorial_step: number }[]>`
    select nickname, tutorial_step from profiles where id = ${uid}`;
  if (!p) {
    console.error('✗ 해당 user_id의 프로필 없음:', uid);
    process.exit(1);
  }

  const [s] = await sql<
    { eq: number; equipped: number; jobs: number; logs: number; boxes: number }[]
  >`
    select
      (select count(*) from user_equipment where user_id = ${uid})::int as eq,
      (select count(*) from user_equipment where user_id = ${uid} and equipped_slot is not null)::int as equipped,
      (select count(*) from enhancement_jobs where user_id = ${uid})::int as jobs,
      (select count(*) from enhancement_logs where user_id = ${uid})::int as logs,
      (select coalesce(sum(count),0) from user_supply_boxes where user_id = ${uid})::int as boxes`;

  const step = s.eq <= 0 ? 'open' : s.equipped <= 0 ? 'equip' : s.jobs + s.logs <= 0 ? 'enhance' : '완료(노출 안 됨)';
  console.log(`대상: ${p.nickname} (${uid})`);
  console.log(`  현재 tutorial_step = ${p.tutorial_step}`);
  console.log(`  장비 보유 ${s.eq} · 장착 ${s.equipped} · 강화(job ${s.jobs}/log ${s.logs}) · 보급상자 ${s.boxes}개`);
  console.log(`  → 파생 단계: ${step}`);

  await sql`update profiles set tutorial_step = 1 where id = ${uid}`;
  console.log('✓ tutorial_step = 1 로 설정(노출). 앱 새로고침 시 코치마크 노출.');
  if (step === '완료(노출 안 됨)') {
    console.log(
      '⚠ 이 계정은 보급·장착·강화를 모두 마쳐 로드 즉시 자동 완료(9)됩니다. 첫 단계(보급 열기)부터 보려면 장비 0 상태가 필요.',
    );
  }
} catch (e) {
  console.error('✗', (e as Error).message);
  process.exit(1);
} finally {
  await sql.end();
}
