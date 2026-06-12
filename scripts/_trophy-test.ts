/**
 * 우승컵 포즈 테스트 생성 — 3회(제3회) 대난투 우승자의 프로필 pixellab 캐릭터를
 * source로 create-character-state(A안: 텍스트 edit_description)로 우승컵 포즈 파생.
 * 일회성: bun run scripts/_trophy-test.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { and, asc, eq, isNotNull } from 'drizzle-orm';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';

import * as schema from '../lib/db/schema';
import { meleeBattles } from '../lib/db/schema/melee';
import { characters } from '@/lib/db/schema/server';
import { userProfiles } from '../lib/db/schema/avatar';

const client = postgres(process.env.DIRECT_URL ?? process.env.DATABASE_URL!, {
  max: 1,
  prepare: false,
  idle_timeout: 5,
});
const db = drizzle(client, { schema });

const PIXELLAB_BASE = 'https://api.pixellab.ai/v2';
// A안 — 텍스트 프롬프트. 컵 디자인 일관성은 추후(B안) 검토. 우선 생성 가능성/품질 점검.
const EDIT_DESCRIPTION =
  'both hands raising a large golden trophy cup high overhead, triumphant victory celebration pose, joyful proud expression';

async function main() {
  const key = process.env.PIXELLAB_API_KEY;
  if (!key) throw new Error('PIXELLAB_API_KEY missing');

  // 발표된 배틀 날짜 오름차순 = 회차. 3번째(index 2) = 제3회.
  const battles = await db
    .select({ id: meleeBattles.id, champ: meleeBattles.championUserId, date: meleeBattles.battleDate })
    .from(meleeBattles)
    .where(and(eq(meleeBattles.status, 'revealed'), isNotNull(meleeBattles.championUserId)))
    .orderBy(asc(meleeBattles.battleDate));

  console.log(`revealed battles: ${battles.length}`);
  battles.forEach((b, i) => console.log(`  제${i + 1}회  date=${b.date}  champ=${b.champ}`));

  const third = battles[2];
  if (!third) {
    console.log('⚠ 제3회 배틀이 없습니다. 발표된 배틀이 3회 미만.');
    await client.end();
    return;
  }
  const championUserId = third.champ!;

  // 우승자 닉 + 현재 활성 프로필의 pixellab 캐릭터(없으면 가장 최근 프로필).
  const [prof] = await db
    .select({ nick: characters.nickname, activeProfileId: characters.activeProfileId })
    .from(characters)
    .where(eq(characters.userId, championUserId))
    .limit(1);

  let sourceCharacterId: string | null = null;
  if (prof?.activeProfileId) {
    const [ap] = await db
      .select({ cid: userProfiles.pixellabCharacterId })
      .from(userProfiles)
      .where(eq(userProfiles.id, prof.activeProfileId))
      .limit(1);
    sourceCharacterId = ap?.cid ?? null;
  }
  if (!sourceCharacterId) {
    const [anyProf] = await db
      .select({ cid: userProfiles.pixellabCharacterId })
      .from(userProfiles)
      .where(eq(userProfiles.userId, championUserId))
      .limit(1);
    sourceCharacterId = anyProf?.cid ?? null;
  }

  console.log(`\n제3회 우승자: ${prof?.nick ?? '(닉 없음)'}  user=${championUserId}`);
  console.log(`source pixellab character_id: ${sourceCharacterId ?? '(없음)'}`);

  if (!sourceCharacterId) {
    console.log('⚠ 우승자 프로필 pixellab 캐릭터가 없어 생성 불가.');
    await client.end();
    return;
  }

  console.log(`\nedit_description: "${EDIT_DESCRIPTION}"`);
  console.log('POST /v2/create-character-state …');

  const res = await fetch(`${PIXELLAB_BASE}/create-character-state`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      character_id: sourceCharacterId,
      edit_description: EDIT_DESCRIPTION,
      no_background: true,
      use_color_palette_from_reference: false,
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    console.log(`❌ HTTP ${res.status}: ${text.slice(0, 500)}`);
    await client.end();
    return;
  }
  const json = JSON.parse(text) as { character_id: string; background_job_id: string; status?: string };
  console.log('\n✅ 생성 요청 성공');
  console.log(`  new character_id: ${json.character_id}`);
  console.log(`  background_job_id: ${json.background_job_id}`);
  console.log(`  status: ${json.status ?? '(none)'}`);
  console.log(`\n진행 확인: GET ${PIXELLAB_BASE}/characters/${json.character_id} (rotation_urls 8개 채워지면 완료)`);

  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
