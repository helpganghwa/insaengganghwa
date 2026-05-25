// 세계역사 창세 시드 — 출시 시점/빈 상태 완화용. 멱등(이미 있으면 skip).
// 실행: bun run scripts/seed-world-history.ts
//
// genesis 이벤트로 적재. 실시간 트래픽이 적을 때 홈 카드/${'/history'}가 비지 않도록.

import { config } from 'dotenv';
import postgres from 'postgres';

config({ path: '.env.local' });

const SEEDS = [
  '이 세계의 시간이 천천히 흐르기 시작했다.',
  '_연대기 작성자_가 펜을 들었다 — 첫 모험가의 발자취가 곧 새겨질 것이다.',
  '대장간의 불꽃이 다시 타오른다. **첫 망치질**이 멀지 않았다.',
  '하늘이 갈라지고 별이 떨어진다 — _초월의 길_이 열렸다.',
  '바람이 도감의 빈 페이지를 넘긴다. 150개의 자리가 누군가를 기다린다.',
  '깊은 숲 너머, **다섯 보스**가 잠에서 깨어날 채비를 한다.',
  '대장장이의 노래가 들려온다 — _쇠가 잠들고 깨어나는 곳_에서.',
  '시간의 강이 흐른다. 매 시도는 한 페이지의 기록이 된다.',
  '_보급의 신_이 매일 새벽 작은 선물을 보낸다.',
  '이 세계는 모험가들의 손끝에서 다시 쓰여진다.',
];

const url = process.env.DIRECT_URL;
if (!url) {
  console.error('DIRECT_URL 미설정');
  process.exit(1);
}
const sql = postgres(url, { max: 1, prepare: false, idle_timeout: 5 });

try {
  // genesis 이벤트 중복 방지 — 이미 있으면 skip(message 매칭).
  const existing = await sql<{ message: string }[]>`
    select message from world_history where event_type = 'genesis'
  `;
  const exist = new Set(existing.map((r) => r.message));
  let added = 0;
  for (const m of SEEDS) {
    if (exist.has(m)) continue;
    await sql`
      insert into world_history (user_id, event_type, payload, message)
      values (
        null,
        'genesis'::world_event_type,
        '{"source":"seed"}'::jsonb,
        ${m}
      )
    `;
    added++;
  }
  console.log(`[seed-world-history] added ${added} / ${SEEDS.length}`);
} catch (e) {
  console.error('[seed-world-history] FAIL', e);
  process.exit(1);
} finally {
  await sql.end({ timeout: 5 });
}
