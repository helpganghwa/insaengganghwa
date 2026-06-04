/**
 * 우승 아바타 우편 재발송 — avatarGrant 페이로드(8방향 rotations) + 수정 푸시(우편함).
 * 수령 시 트로피 아바타가 아바타 목록에 추가됨(claimMail avatarGrant). bun run scripts/_trophy-apply.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { asc, eq, sql } from 'drizzle-orm';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import webpush from 'web-push';

import * as schema from '../lib/db/schema';
import { meleeBattles } from '../lib/db/schema/melee';
import { pushSubscriptions } from '../lib/db/schema/push';

const TROPHY_CHAR = '5261f9a4-82cf-4035-887f-d39faf265165'; // onehand(한손 들기)

const client = postgres(process.env.DIRECT_URL ?? process.env.DATABASE_URL!, {
  max: 1,
  prepare: false,
  idle_timeout: 5,
});
const db = drizzle(client, { schema });

async function main() {
  const key = process.env.PIXELLAB_API_KEY!;

  // 1) 트로피 8방향 rotations(snake_case 키 — DB activeDirection enum과 일치).
  const res = await fetch(`https://api.pixellab.ai/v2/characters/${TROPHY_CHAR}`, {
    headers: { authorization: `Bearer ${key}` },
  });
  const char = (await res.json()) as { rotation_urls?: Record<string, string | null> };
  const rotations: Record<string, string> = {};
  for (const [k, v] of Object.entries(char.rotation_urls ?? {})) {
    if (typeof v === 'string' && v.length > 0) rotations[k.replace(/-/g, '_')] = v;
  }
  console.log(`rotations: ${Object.keys(rotations).length}방향`, Object.keys(rotations).join(','));
  if (!rotations.south) throw new Error('south rotation 없음');

  // 2) 제3회 챔피언.
  const battles = await db
    .select({ champ: meleeBattles.championUserId, date: meleeBattles.battleDate })
    .from(meleeBattles)
    .where(eq(meleeBattles.status, 'revealed'))
    .orderBy(asc(meleeBattles.battleDate));
  const champId = battles[2]?.champ;
  if (!champId) throw new Error('제3회 챔피언 없음');
  console.log(`제3회 champ=${champId}`);

  // 3) avatarGrant 우편(7일 만료) — payload에 rotations + characterId.
  const payload = JSON.stringify({ avatarGrant: { rotations, characterId: TROPHY_CHAR } });
  await db.execute(sql`
    insert into mailbox (user_id, type, title, body, sender_label, payload, expires_at)
    values (
      ${champId}::uuid, 'reward'::mailbox_type, '🏆 대난투 우승 아바타',
      ${'제3회 대난투 우승을 축하합니다! 받기를 누르면 우승컵을 든 우승 아바타가 아바타 목록에 추가됩니다. (대난투에서 우승 아바타로 등장)'},
      '대난투', ${payload}::jsonb, now() + interval '7 days'
    )
  `);
  console.log('✅ avatarGrant 우편 재발송');

  // 4) 푸시 — 우편함 안내(클릭 시 /mail).
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (pub && priv) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? 'mailto:contact@insaengganghwa.com', pub, priv);
    const subs = await db
      .select({ endpoint: pushSubscriptions.endpoint, p256dh: pushSubscriptions.p256dh, auth: pushSubscriptions.auth })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, champId));
    const body = JSON.stringify({
      title: '🏆 대난투 우승!',
      body: '우승 아바타가 도착했어요 — 우편함에서 확인하세요',
      url: '/mail',
      tag: 'melee',
      category: 'melee',
      renotify: true,
    });
    let ok = 0;
    for (const s of subs) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body);
        ok += 1;
      } catch (e) {
        console.warn('push fail', (e as { statusCode?: number }).statusCode);
      }
    }
    console.log(`✅ 푸시: ${ok}/${subs.length} 디바이스 (우편함 안내)`);
  } else {
    console.log('⚠ VAPID 키 없음 — 푸시 스킵');
  }

  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
