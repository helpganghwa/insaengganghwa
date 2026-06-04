// 환불 안내 푸시 발송 — sendPushToUser 직접 호출.
// 실행: bun --conditions=react-server run scripts/_push-refund-notice.ts <userId>
import { config } from 'dotenv';
config({ path: '.env.local' });

import { sendPushToUser } from '../lib/push/send';

const userId = process.argv[2];
if (!userId) {
  console.error('usage: bun ... scripts/_push-refund-notice.ts <userId>');
  process.exit(1);
}

const result = await sendPushToUser(userId, {
  title: '캐릭터 환불 안내',
  body: '요청하신 캐릭터가 삭제되었고 다이아 10,000개가 환불되었습니다.',
  url: '/mail',
  tag: 'admin-refund',
  category: 'profile',
});
console.log('result:', result);
