// 0027 성장패스 개별 수령 — 컬럼 추가 + watermark 백필. 멱등. 실행: bun run scripts/_apply-0027.ts
import { readFileSync } from 'node:fs';
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error('DIRECT_URL/DATABASE_URL missing');
  process.exit(1);
}
const sql = postgres(url, { prepare: false, max: 1 });
const STEP: Record<string, number> = { enhance: 10, transcend: 1 };
// (start, through] 안의 step 배수 마일스톤들.
function milestones(step: number, startExclusive: number, through: number): number[] {
  const out: number[] = [];
  let l = Math.floor(startExclusive / step) * step + step;
  for (; l <= through; l += step) out.push(l);
  return out;
}
try {
  await sql.unsafe(readFileSync('lib/db/manual/0027_battlepass_claimed_tiers.sql', 'utf8'));
  console.log('✓ 0027 컬럼 추가');

  // 무료 백필 — free_claimed_through 워터마크를 마일스톤 집합으로.
  const states = await sql<
    { user_id: string; pass_type: string; through: number; tiers: number[] }[]
  >`select user_id, pass_type, free_claimed_through as through, free_claimed_tiers as tiers from battlepass_state`;
  let nFree = 0;
  for (const s of states) {
    if ((s.tiers?.length ?? 0) > 0) continue; // 이미 백필됨
    const t = milestones(STEP[s.pass_type] ?? 1, 0, s.through);
    if (t.length === 0) continue;
    await sql`update battlepass_state set free_claimed_tiers = ${JSON.stringify(t)}::jsonb
              where user_id=${s.user_id} and pass_type=${s.pass_type}`;
    nFree++;
  }

  // 프리미엄 백필 — 구간별 premium_claimed_through를 그 구간 마일스톤 집합으로.
  const segs = await sql<
    { user_id: string; pass_type: string; segment_index: number; through: number; tiers: number[] }[]
  >`select user_id, pass_type, segment_index, premium_claimed_through as through, premium_claimed_tiers as tiers from battlepass_segments`;
  let nPrem = 0;
  for (const s of segs) {
    if ((s.tiers?.length ?? 0) > 0) continue;
    const step = STEP[s.pass_type] ?? 1;
    const segStartExclusive = s.segment_index * (s.pass_type === 'enhance' ? 100 : 10);
    const t = milestones(step, segStartExclusive, s.through);
    if (t.length === 0) continue;
    await sql`update battlepass_segments set premium_claimed_tiers = ${JSON.stringify(t)}::jsonb
              where user_id=${s.user_id} and pass_type=${s.pass_type} and segment_index=${s.segment_index}`;
    nPrem++;
  }
  console.log(`✓ 백필 완료 — free ${nFree}행 / premium ${nPrem}행 (state ${states.length} / seg ${segs.length})`);
} catch (e) {
  console.error('✗', (e as Error).message);
  process.exit(1);
} finally {
  await sql.end();
}
