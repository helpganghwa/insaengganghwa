// 테스트 보상 우편 지급 — 1회용 스크립트(2026-06-01 사용자 요청).
// 실행: bun run scripts/_grant-test-mail.ts
import { config } from 'dotenv';
import postgres from 'postgres';

config({ path: '.env.local' });

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error('DIRECT_URL/DATABASE_URL missing');
  process.exit(1);
}

const USER_ID = 'b8f0bb7e-6a1a-4853-b366-72bee74ae8d1';
const PAYLOAD = JSON.stringify({
  diamond: 1000,
  boxes: { weapon: 5, armor: 5, accessory: 5 },
});

const sql = postgres(url, { prepare: false, max: 1 });

try {
  // 존재 확인.
  const [u] = await sql<{ id: string; nickname: string | null }[]>`
    select id::text id, nickname from profiles where id = ${USER_ID}::uuid
  `;
  if (!u) {
    console.error(`✗ user not found: ${USER_ID}`);
    process.exit(1);
  }
  console.log(`✓ user: ${u.nickname ?? '(no nickname)'} (${u.id})`);

  const rows = (await sql.unsafe(
    `insert into mailbox (user_id, type, title, body, sender_label, payload)
     values ($1::uuid, 'reward'::mailbox_type, $2, $3, $4, $5::jsonb)
     returning id::text id`,
    [USER_ID, '테스트 보상', '테스트용 보상입니다. 7일 안에 수령하세요.', '운영자', PAYLOAD],
  )) as { id: string }[];
  console.log(`✓ inserted mailbox id=${rows[0]?.id}`);
} catch (e) {
  console.error('✗ failed:', (e as Error).message);
  process.exit(1);
} finally {
  await sql.end();
}
