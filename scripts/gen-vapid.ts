/**
 * VAPID 키페어 생성기 — `bun run scripts/gen-vapid.ts`
 *
 * 생성된 publicKey/privateKey를 .env.local + Vercel(Production/Preview) 환경변수에
 * 동일하게 등록한다. VAPID_SUBJECT는 발신자 식별용(mailto:URL 또는 https URL).
 *
 * 한 번 생성하면 영구 사용. 키가 바뀌면 기존 구독은 모두 무효화되므로 분실 주의.
 */
import { generateVAPIDKeys } from 'web-push';

const keys = generateVAPIDKeys();

console.log('\n=== 생성 완료 — 아래를 .env.local에 추가 ===\n');
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log(`VAPID_SUBJECT=mailto:contact@insaengganghwa.com`);
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log('\n# Vercel 대시보드 → Settings → Environment Variables에도 동일 입력');
console.log('# (Production + Preview 둘 다)');
console.log('# Private key는 절대 NEXT_PUBLIC_ 접두 사용 금지\n');
