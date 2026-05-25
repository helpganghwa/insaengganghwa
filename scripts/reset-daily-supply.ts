// 일일 보급 reset — 테스트용. 오늘 KST의 일일 보급 발급 흔적(mailbox + daily_supply_grants)을
// 모두 제거. 다음 (game) layout 진입 시 ensureDailyMail가 재발급 → 홈 카드 재노출.
//
// 사용:
//   bun run scripts/reset-daily-supply.ts --nickname '<닉네임>'
//   bun run scripts/reset-daily-supply.ts --user-id '<uuid>'
//   bun run scripts/reset-daily-supply.ts --all          # 전체 유저
//
// 안전: 운영 DB에 즉시 영향. --all은 모든 유저 reset이므로 신중.

import { config } from 'dotenv';
import postgres from 'postgres';

config({ path: '.env.local' });

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1]! : null;
}

const nickname = arg('nickname');
const userId = arg('user-id');
const all = process.argv.includes('--all');
if (!nickname && !userId && !all) {
  console.error('사용: --nickname <닉네임> | --user-id <uuid> | --all');
  process.exit(1);
}

const url = process.env.DIRECT_URL;
if (!url) {
  console.error('DIRECT_URL 미설정');
  process.exit(1);
}
const sql = postgres(url, { max: 1, prepare: false, idle_timeout: 5 });

try {
  if (all) {
    await sql.begin(async (tx) => {
      const delMail = await tx`
        delete from mailbox
        where sender_label = '일일 보급'
          and (created_at at time zone 'Asia/Seoul')::date = (now() at time zone 'Asia/Seoul')::date
        returning id
      `;
      const delGrant = await tx`
        delete from daily_supply_grants
        where kst_day = (now() at time zone 'Asia/Seoul')::date
        returning user_id
      `;
      console.log(
        `[reset-all] mailbox -${delMail.length}, daily_supply_grants -${delGrant.length} 유저`,
      );
    });
    console.log('[reset-all] OK — 각 유저 다음 (game) 진입 시 재발급');
  } else {
    let uid = userId;
    if (!uid) {
      const r = await sql<{ id: string }[]>`
        select id::text id from profiles where nickname = ${nickname!} limit 1
      `;
      if (r.length === 0) {
        console.error(`닉네임 '${nickname}'을 찾지 못함`);
        process.exit(1);
      }
      uid = r[0]!.id;
      console.log(`[reset] nickname=${nickname} → user_id=${uid}`);
    }

    await sql.begin(async (tx) => {
      const delMail = await tx`
        delete from mailbox
        where user_id = ${uid!}::uuid
          and sender_label = '일일 보급'
          and (created_at at time zone 'Asia/Seoul')::date = (now() at time zone 'Asia/Seoul')::date
        returning id
      `;
      const delGrant = await tx`
        delete from daily_supply_grants
        where user_id = ${uid!}::uuid
          and kst_day = (now() at time zone 'Asia/Seoul')::date
        returning kst_day
      `;
      console.log(`[reset] mailbox -${delMail.length}, daily_supply_grants -${delGrant.length}`);
    });
    console.log('[reset] OK — 다음 (game) 페이지 진입 시 일일 보급 재발급');
  }
} catch (e) {
  console.error('[reset] FAIL', e);
  process.exit(1);
} finally {
  await sql.end({ timeout: 5 });
}
