// 연대기 행 출력 — 확인용.
//   실행: bun --conditions react-server scripts/_show-chronicle.ts YYYY-MM-DD
import { config } from 'dotenv';
config({ path: '.env.local' });

const { db } = await import('@/lib/db/client');
const { worldChronicle } = await import('@/lib/db/schema/guild');
const { eq } = await import('drizzle-orm');

const kstDay = process.argv[2];
if (!kstDay) throw new Error('kstDay 인자 필요');
const [r] = await db
  .select()
  .from(worldChronicle)
  .where(eq(worldChronicle.kstDay, kstDay))
  .limit(1);
console.log('=== HEADLINE ===\n' + (r?.headline ?? '(없음)'));
console.log('\n=== TODAY ===\n' + (r?.todayText ?? '(없음)'));
process.exit(0);
