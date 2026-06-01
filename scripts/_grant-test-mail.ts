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
const PAYLOAD = {
  diamond: 1000,
  boxes: { weapon: 5, armor: 5, accessory: 5 },
};

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

  // ⚠ jsonb 컬럼엔 sql.json(obj)을 써야 함(2026-06-02 학습).
  //   JSON.stringify + $N::jsonb 패턴은 postgres-js text 바인딩이 wire 단에서
  //   문자열 재인코딩 → DB엔 jsonb 객체가 아닌 jsonb 문자열로 저장돼
  //   payload->>'key'가 NULL 반환. 객체 직접 전달이 안전.
  const rows = await sql<{ id: string }[]>`
    insert into mailbox (user_id, type, title, body, sender_label, payload)
    values (
      ${USER_ID}::uuid,
      'reward'::mailbox_type,
      '테스트 보상',
      '테스트용 보상입니다. 7일 안에 수령하세요.',
      '운영자',
      ${sql.json(PAYLOAD)}
    )
    returning id::text id
  `;
  console.log(`✓ inserted mailbox id=${rows[0]?.id}`);
} catch (e) {
  console.error('✗ failed:', (e as Error).message);
  process.exit(1);
} finally {
  await sql.end();
}
