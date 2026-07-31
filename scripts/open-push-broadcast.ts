// 정식 오픈 브로드캐스트(0145) — push_subscriptions 전 행(유저 연결 + 익명)에 오픈 알림 1회.
//
// 대상: wipe에서 보존된 CBT 유저 구독 + 종료 화면 '오픈 알림 받기' 익명 구독 전부.
// 사용자 토글(카테고리 설정)은 적용하지 않는다 — 오픈 공지는 1회성 운영 알림이고,
// 익명 구독은 토글 주체(유저)가 없다.
//
// 실행(오픈 직후 1회): bun run scripts/open-push-broadcast.ts --db=prod            (드라이런: 대상 수)
//                      bun run scripts/open-push-broadcast.ts --db=prod --confirm  (발송)
// 410/404(만료 endpoint)는 행 삭제로 정리. 재실행해도 알림이 다시 갈 뿐 데이터 부작용 없음.
import { config } from 'dotenv';
import postgres from 'postgres';
import webpush from 'web-push';

config({ path: '.env.local' });
config({ path: '.env', override: false });

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
const confirm = process.argv.includes('--confirm');
const dbArg = arg('db');
if (dbArg !== 'prod' && dbArg !== 'staging') {
  console.error('사용법: bun run scripts/open-push-broadcast.ts --db=prod|staging [--confirm]');
  process.exit(1);
}
const url = dbArg === 'prod' ? process.env.PROD_DATABASE_URL : process.env.DATABASE_URL;
if (!url) { console.error('DB URL env 누락'); process.exit(1); }

const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
if (!publicKey || !privateKey) { console.error('VAPID 키 누락'); process.exit(1); }
webpush.setVapidDetails('mailto:help@ganghwa.app', publicKey, privateKey);

const PAYLOAD = JSON.stringify({
  title: '인생강화 정식 오픈!',
  body: '문이 열렸습니다. 지금 접속해 강화를 시작하세요.',
  url: '/',
  tag: 'official-open',
});

const sql = postgres(url, { prepare: false, max: 4 });

async function main() {
  const subs = await sql<{ id: string; endpoint: string; p256dh: string; auth: string }[]>`
    select id, endpoint, p256dh, auth from push_subscriptions`;
  console.log(`대상 구독 ${subs.length}건 ${confirm ? '(발송)' : '(드라이런 — 발송하려면 --confirm)'}`);
  if (!confirm) { await sql.end(); return; }

  let ok = 0, gone = 0, failed = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        PAYLOAD,
        { TTL: 6 * 3600, urgency: 'high' },
      );
      ok++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) {
        await sql`delete from push_subscriptions where id = ${s.id}::bigint`;
        gone++;
      } else {
        failed++;
        console.warn('  발송 실패', s.endpoint.slice(0, 60), code);
      }
    }
  }
  console.log(`완료 — 성공 ${ok} · 만료정리 ${gone} · 실패 ${failed}`);
  await sql.end();
}

main().catch(async (e) => { console.error(e); await sql.end(); process.exit(1); });
