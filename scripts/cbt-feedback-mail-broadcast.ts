// CBT 피드백 감사 저녁 보상 — 기존 유저 일괄 발송(2026-07-13, 1회성).
//   cbt-thanks-mail-broadcast(참여 감사)와 동일 패턴. 제목 기반 NOT EXISTS 디듀프로
//   재실행 안전. 대상 = 탈퇴 안 한 계정의 서버별 캐릭터.
//
// 지급: 캐릭터(서버) 1건당 다이아 3,000 + 보급상자 각 슬롯 50개. 만료 = 기본 30일.
//
// 실행: bun run scripts/cbt-feedback-mail-broadcast.ts --db=prod            (드라이런)
//       bun run scripts/cbt-feedback-mail-broadcast.ts --db=prod --confirm  (실행)
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

const TITLE = 'CBT 피드백 감사 보상';
const BODY =
  '소중한 피드백 감사합니다! 보내주신 의견들은 하나씩 게임에 반영되고 있어요. 감사의 마음을 담아 보상을 보내드립니다. 오늘 저녁도 즐거운 강화 되세요. ⚒️';
const SENDER = '인생강화';
const PAYLOAD = { diamond: 3000, boxes: { weapon: 50, armor: 50, accessory: 50 } };

const sql = postgres(URL, { prepare: false, max: 1 });

try {
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
  console.log(`[${target}] 발송 대상: ${count}건`);

  if (!confirm) {
    console.log('드라이런 — 실제 발송하려면 --confirm 추가.');
    process.exit(0);
  }

  const inserted = await sql`
    INSERT INTO mailbox (server_id, user_id, type, title, body, sender_label, payload)
    SELECT c.server_id, c.user_id, 'reward', ${TITLE}, ${BODY}, ${SENDER}, ${sql.json(PAYLOAD)}
    FROM characters c
    JOIN profiles p ON p.id = c.user_id
    WHERE p.withdrawn_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM mailbox m
        WHERE m.user_id = c.user_id AND m.server_id = c.server_id AND m.title = ${TITLE}
      )
    RETURNING id
  `;
  console.log(`✅ [${target}] ${inserted.length}건 발송 완료(다이아 3,000 + 상자 각 50).`);
} finally {
  await sql.end();
}
