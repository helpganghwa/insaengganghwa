// 더미 세계역사 — 피드백/UI 검토용. profiles에서 sample 유저 + catalog 아이템으로
// 다양한 이벤트를 생성, created_at을 과거 7일 분산 적재.
//
// 실행: bun run scripts/seed-dummy-history.ts            # 기본 60건
//       COUNT=120 bun run scripts/seed-dummy-history.ts  # 개수 조정
//
// 멱등 X (매 실행마다 추가). 너무 많이 쌓이면 정리 SQL 별도.

import { config } from 'dotenv';
import postgres from 'postgres';

config({ path: '.env.local' });

const DIRECT = process.env.DIRECT_URL;
if (!DIRECT) {
  console.error('DIRECT_URL 미설정');
  process.exit(1);
}
const COUNT = Number(process.env.COUNT ?? 60);

const sql = postgres(DIRECT, { max: 1, prepare: false, idle_timeout: 5 });

function pick<T>(arr: readonly T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)]!;
}
function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function nightPhrase(d: Date): string {
  const kst = new Date(d.getTime() + 9 * 3600_000);
  return `달의 ${kst.getUTCDate()}번째 밤`;
}

const OPERATOR_NOTICES = [
  '**연대기 작성자**가 알린다 — 새 보스 _드래곤_이 깨어났다. 모험가들이여, 칼날을 갈라.',
  '_보급의 신_이 미소짓는다. 오늘은 평소보다 후한 손이 펼쳐진다.',
  '대장간의 풀무가 거세게 운다. **강화의 밤**이 시작되었다.',
  '_고요한 숲_ 너머에서 새 도감 페이지가 발견되었다 — 곧 공개된다.',
  '서쪽 항구에 새 모험가가 줄지어 도착한다. **세계가 붐빈다**.',
  '_별의 강_이 흐르는 오늘 밤, 초월의 성공이 더 빛난다.',
];

try {
  // sample profiles (admin이 아닌 일반 유저 우선, 닉네임 있는 것만).
  const users = await sql<{ id: string; nickname: string }[]>`
    select id::text id, nickname from profiles
    where nickname is not null and length(nickname) > 0
    order by random()
    limit 50
  `;
  if (users.length === 0) {
    console.error('profiles 비어 있음 — 먼저 seed-dummy-users 실행');
    process.exit(1);
  }
  const items = await sql<{ id: number; name: string }[]>`
    select id, name from catalog_items where active = true order by random() limit 100
  `;
  if (items.length === 0) {
    console.error('catalog 비어 있음 — seed-catalog 먼저 실행');
    process.exit(1);
  }
  console.log(`[seed-dummy-history] users=${users.length}, items=${items.length}, target=${COUNT}`);

  const rng = mulberry32(Date.now());
  const now = Date.now();
  let inserted = 0;

  for (let i = 0; i < COUNT; i++) {
    // 과거 7일 분산 (대부분 최근 24h, 일부 더 옛날)
    const ageMs =
      rng() < 0.6
        ? Math.floor(rng() * 86_400_000) // 0~24h
        : Math.floor(rng() * 7 * 86_400_000); // 0~7d
    const createdAt = new Date(now - ageMs);

    // 이벤트 분포: enhance_99 60% / transcend_max 25% / operator_notice 15%
    const r = rng();
    let eventType: 'enhance_99' | 'transcend_max' | 'operator_notice';
    let payload: Record<string, unknown>;
    let message: string;
    let userId: string | null = null;

    if (r < 0.6) {
      eventType = 'enhance_99';
      const u = pick(users, rng);
      const it = pick(items, rng);
      // 사이클 boundary 99/199/299
      const level = pick([99, 99, 99, 99, 199, 199, 299], rng); // 99 weighted
      userId = u.id;
      payload = { itemKo: it.name, level, nickname: u.nickname };
      message =
        level === 99
          ? `${nightPhrase(createdAt)}, **${u.nickname}**의 손에서 _${it.name}_가 **+99**의 경지에 닿았다.`
          : `${nightPhrase(createdAt)}, **${u.nickname}**이(가) _${it.name}_를 **+${level}** 너머로 이끌었다.`;
    } else if (r < 0.85) {
      eventType = 'transcend_max';
      const u = pick(users, rng);
      const it = pick(items, rng);
      userId = u.id;
      payload = { itemKo: it.name, nickname: u.nickname };
      message = `${nightPhrase(createdAt)}, **${u.nickname}**이(가) _${it.name}_를 10번 초월시켜 신화의 영역으로 보냈다.`;
    } else {
      eventType = 'operator_notice';
      payload = { source: 'admin' };
      message = pick(OPERATOR_NOTICES, rng);
    }

    await sql`
      insert into world_history (user_id, event_type, payload, message, created_at)
      values (
        ${userId === null ? null : sql`${userId}::uuid`},
        ${eventType}::world_event_type,
        ${JSON.stringify(payload)}::jsonb,
        ${message},
        ${createdAt}
      )
    `;
    inserted++;
  }

  console.log(`[seed-dummy-history] inserted ${inserted}건`);
} catch (e) {
  console.error('[seed-dummy-history] FAIL', e);
  process.exit(1);
} finally {
  await sql.end({ timeout: 5 });
}
