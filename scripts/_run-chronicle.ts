// 세계 연대기 cron 수동 실행 — 배포된 cron 엔드포인트(CRON_SECRET 필요) 대신 로컬에서
// 동일 generateAndStoreChronicle를 직접 호출(공유 DB에 그날 1행 멱등 생성).
//   실행: bun --conditions react-server run scripts/_run-chronicle.ts [YYYY-MM-DD]
//   (react-server 조건 — server-only 가드 해소). env는 .env.local(DATABASE_URL·ANTHROPIC_API_KEY).
import { config } from 'dotenv';
config({ path: '.env.local' });

// dotenv 적용 후 동적 import(db client 싱글톤이 import 시점에 DATABASE_URL을 읽으므로 순서 중요).
// index가 아닌 chronicle 모듈을 직접 import — next/headers 등 비-Next 모듈 유입 회피.
const { generateAndStoreChronicle } = await import('@/lib/game/guild/conquest/chronicle');
const { kstDateString } = await import('@/lib/kst');

const kstDay = process.argv[2] ?? kstDateString();
console.log(`[chronicle] 실행 — kstDay=${kstDay}`);
const r = await generateAndStoreChronicle(kstDay, 1);
console.log('[chronicle] 결과:', JSON.stringify(r));
process.exit(0);
