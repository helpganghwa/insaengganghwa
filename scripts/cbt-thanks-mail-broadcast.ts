// CBT 참여 감사 보상 우편 — 기존 유저 일괄 발송(2026-07-13, 1회성).
//   신규 가입자는 server-select.ts createCharacter 경로에서 동일 제목으로 자동 지급되므로,
//   이 스크립트는 **이미 캐릭터가 있는 기존 유저**에게만 소급 지급한다.
//
// 지급: 캐릭터(서버) 1건당 다이아 10,000 + 보급상자 각 슬롯 100개.
// 대상: characters(=서버별 캐릭터) 중 탈퇴 안 한 계정. profiles.withdrawn_at IS NULL.
// 디듀프: mailbox에 (user_id, server_id, title='CBT 참여 감사 보상')가 이미 있으면 건너뜀
//   → 재실행 안전 + 신규 웰컴 메일 수령자와 이중 지급 방지(제목 동일 활용).
//
// 실행: bun run scripts/cbt-thanks-mail-broadcast.ts --db=staging            (드라이런: 대상 수만)
//       bun run scripts/cbt-thanks-mail-broadcast.ts --db=staging --confirm  (실행)
//       bun run scripts/cbt-thanks-mail-broadcast.ts --db=prod    --confirm
// 안전: --db 필수 · --confirm 없으면 드라이런 · 단일 INSERT..SELECT(원자적) · CASCADE 미사용.
import { config } from 'dotenv';
import postgres from 'postgres';

config({ path: '.env.local' });
config({ path: '.env', override: false });

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
const has = (k: string) => process.argv.includes(`--${k}`);
const target = arg('db');
const confirm = has('confirm');

const URL =
  target === 'prod' ? process.env.PROD_DATABASE_URL
  : target === 'staging' ? process.env.DATABASE_URL
  : undefined;
if (!target || !URL) {
  console.error('--db=staging|prod 필요 (staging=DATABASE_URL, prod=PROD_DATABASE_URL)');
  process.exit(1);
}

const TITLE = 'CBT 참여 감사 보상';
const BODY = 'CBT에 참여해 주셔서 감사합니다! 마음껏 강화를 즐겨보세요. ⚒️';
const SENDER = '인생강화';
const PAYLOAD = { diamond: 10000, boxes: { weapon: 100, armor: 100, accessory: 100 } };

const sql = postgres(URL, { prepare: false, max: 1 });

try {
  // 대상 = 탈퇴 안 한 계정의 캐릭터 중, 동일 보상 우편이 아직 없는 (user_id, server_id).
  const [{ count }] = await sql<{ count: number }[]>`
    SELECT count(*)::int AS count
    FROM characters c
    JOIN profiles p ON p.id = c.user_id
    WHERE p.withdrawn_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM mailbox m
        WHERE m.user_id = c.user_id AND m.server_id = c.server_id AND m.title = ${TITLE}
      )
  `;
  console.log(`[${target}] 발송 대상(미수령·기존 캐릭터): ${count}건`);

  if (!confirm) {
    console.log('드라이런 — 실제 발송하려면 --confirm 추가.');
    process.exit(0);
  }

  const inserted = await sql`
    INSERT INTO mailbox (server_id, user_id, type, title, body, sender_label, payload, expires_at)
    SELECT c.server_id, c.user_id, 'reward', ${TITLE}, ${BODY}, ${SENDER},
           ${sql.json(PAYLOAD)}, now() + interval '90 days'
    FROM characters c
    JOIN profiles p ON p.id = c.user_id
    WHERE p.withdrawn_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM mailbox m
        WHERE m.user_id = c.user_id AND m.server_id = c.server_id AND m.title = ${TITLE}
      )
    RETURNING id
  `;
  console.log(`✅ [${target}] ${inserted.length}건 발송 완료(다이아 10,000 + 상자 각 100).`);
} finally {
  await sql.end();
}
