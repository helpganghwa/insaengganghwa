// 특정 날짜 연대기 행 삭제 — 재생성 전 정리용(멱등 skip 해소).
//   실행: bun --conditions react-server run scripts/_del-chronicle.ts YYYY-MM-DD
import { config } from 'dotenv';
config({ path: '.env.local' });

const { db } = await import('@/lib/db/client');
const { worldChronicle } = await import('@/lib/db/schema/guild');
const { eq } = await import('drizzle-orm');

const kstDay = process.argv[2];
if (!kstDay) throw new Error('kstDay 인자 필요(YYYY-MM-DD)');
const r = await db.delete(worldChronicle).where(eq(worldChronicle.kstDay, kstDay));
console.log(`[del-chronicle] ${kstDay} 삭제 완료`, r);
process.exit(0);
