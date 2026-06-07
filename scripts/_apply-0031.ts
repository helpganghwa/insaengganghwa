// 0031 상점 구매 제한 테이블. 멱등. 실행: bun run scripts/_apply-0031.ts
import { readFileSync } from 'node:fs';
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) { console.error('DIRECT_URL/DATABASE_URL missing'); process.exit(1); }
const sql = postgres(url, { prepare: false, max: 1 });
try {
  await sql.unsafe(readFileSync('lib/db/manual/0031_shop_purchases.sql', 'utf8'));
  console.log('✓ 0031 적용 — shop_purchases 생성');
} catch (e) { console.error('✗', (e as Error).message); process.exit(1); }
finally { await sql.end(); }
