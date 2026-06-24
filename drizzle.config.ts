import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

// drizzle-kit는 별도 프로세스라 Bun의 자동 env 로딩을 못 받는다.
// .env.local 우선 → .env 폴백 명시 로딩.
config({ path: '.env.local' });
config({ path: '.env', override: false });

if (!process.env.DATABASE_URL && !process.env.DIRECT_URL) {
  throw new Error(
    'DATABASE_URL (또는 DIRECT_URL) 환경 변수가 필요합니다. .env.local 또는 .env 확인(.env.example 템플릿 참조).',
  );
}

// 마이그레이션은 Pooler가 아닌 직접 연결(DIRECT_URL) 권장 — prepared statement 호환성.
const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL!;

export default defineConfig({
  schema: './lib/db/schema/*.ts',
  out: './lib/db/migrations',
  dialect: 'postgresql',
  dbCredentials: { url },
  verbose: true,
  strict: true,
  // Supabase는 auth.users / storage 등을 자체 관리. Drizzle은 public 스키마만.
  schemaFilter: ['public'],
});
