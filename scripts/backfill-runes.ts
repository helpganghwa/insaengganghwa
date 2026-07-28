/**
 * 룬 백필(0138) — 기존 아바타 1개당 룬 1개 지급(2026-07-28 확정: 소급 백필).
 * 멱등: runes.source_profile_id unique — 재실행해도 이미 지급된 아바타는 건너뜀.
 *
 * 사용:
 *   bun scripts/backfill-runes.ts                    # DATABASE_URL(스테이징)
 *   bun scripts/backfill-runes.ts PROD_DATABASE_URL  # 프로덕션(0138 적용 후)
 */
import { config } from 'dotenv';
import postgres from 'postgres';

import { rollAvatarAttrs } from '../lib/game/balance';

config({ path: '.env.local' });
const envName = process.argv[2] ?? 'DATABASE_URL';
const url = process.env[envName];
if (!url) {
  console.error(`${envName} 없음`);
  process.exit(1);
}
const sql = postgres(url, { prepare: false, max: 1 });
console.log(`[backfill-runes] 대상 = ${envName}`);

const rows = await sql`
  select p.id, p.user_id, p.server_id
  from user_profiles p
  left join runes r on r.source_profile_id = p.id
  where r.id is null`;
console.log(`미지급 아바타 ${rows.length}건`);

let done = 0;
for (const p of rows) {
  await sql`
    insert into runes (user_id, server_id, attrs, source_profile_id)
    values (${p.user_id}, ${p.server_id}, ${sql.json(rollAvatarAttrs() as unknown as never)}, ${p.id})
    on conflict (source_profile_id) do nothing`;
  done++;
  if (done % 100 === 0) console.log(`${done}/${rows.length}`);
}
console.log(`[backfill-runes] 완료 ${done}건`);
await sql.end();
