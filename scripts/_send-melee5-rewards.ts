/**
 * 일회성 — 더미 배틀(#5, 2026-06-02)은 직접 revealed로 시드돼 우편/푸시가 안 나감.
 * 참가자(실유저 1·2위)에게 결과 보상 우편 + 대난투 푸시를 revealMelee와 동일하게 전송.
 * 멱등: 같은 '대난투 결과' 우편이 이미 있으면 우편은 skip. 실행: bun run scripts/_send-melee5-rewards.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import postgres from 'postgres';
import webpush from 'web-push';

const BATTLE_DATE = '2026-06-02';
const sql = postgres(process.env.DIRECT_URL!, { max: 1, prepare: false, idle_timeout: 5 });

async function main() {
  const [b] = await sql`
    select id, champion_user_id::text champ from melee_battles
    where battle_date = ${BATTLE_DATE} and status = 'revealed' limit 1`;
  if (!b) {
    console.error('발표된 배틀 없음:', BATTLE_DATE);
    process.exit(1);
  }
  let champNick = '챔피언';
  if (b.champ) {
    const [c] = await sql`select nickname from profiles where id = ${b.champ}`;
    if (c?.nickname) champNick = c.nickname;
  }

  // 1) 결과 우편(reward) — 참가자 전원(실유저). 이미 있으면 skip(멱등).
  const mailed = await sql`
    insert into mailbox (user_id, type, title, body, sender_label, payload, expires_at)
    select mp.user_id,
           'reward'::mailbox_type,
           '대난투 결과',
           '오늘 대난투 ' || mp.final_rank || '위! 👑 챔피언: ' || ${champNick},
           '대난투',
           jsonb_build_object('diamond', mp.reward_diamond::text, 'boxes', mp.reward_boxes),
           now() + interval '7 days'
    from melee_participants mp
    where mp.battle_id = ${b.id}
      and not exists (
        select 1 from mailbox m
        where m.user_id = mp.user_id and m.sender_label = '대난투' and m.title = '대난투 결과'
      )
    returning user_id`;
  console.log(`[mail] 신규 발송 ${mailed.length}건`);

  // 2) 푸시 — 참가자 중 push_melee ON. 구독 전부에 전송.
  const users = (await sql`
    select mp.user_id::text uid, p.nickname nick from melee_participants mp
    join profiles p on p.id = mp.user_id
    where mp.battle_id = ${b.id} and p.push_melee = true`) as { uid: string; nick: string }[];
  if (users.length === 0) {
    console.log('[push] 대상 없음(토글 OFF)');
  } else {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT ?? 'mailto:contact@insaengganghwa.com',
      process.env.VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!,
    );
    const body = JSON.stringify({
      title: '대난투 결과 발표',
      body: `👑 오늘의 챔피언: ${champNick} · 내 순위 확인하기`,
      url: '/melee',
      tag: 'melee',
      category: 'melee',
      renotify: true,
    });
    const subs = (await sql`
      select endpoint, p256dh, auth, user_id::text uid from push_subscriptions
      where user_id in ${sql(users.map((u) => u.uid))}`) as {
      endpoint: string;
      p256dh: string;
      auth: string;
      uid: string;
    }[];
    let ok = 0,
      fail = 0;
    for (const s of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
        );
        ok++;
      } catch (e) {
        fail++;
        console.warn('  push fail', (e as Error).message);
      }
    }
    console.log(
      `[push] 대상 유저 ${users.length}(${users.map((u) => u.nick).join(',')}) · 구독 ${subs.length} · ok ${ok} fail ${fail}`,
    );
  }
}

main()
  .then(() => sql.end({ timeout: 5 }))
  .then(() => process.exit(0))
  .catch(async (e) => {
    console.error(e);
    await sql.end({ timeout: 5 });
    process.exit(1);
  });
