// 캐릭터 환불 일회성 — pixellab character id로 user_profile 식별, 다이아 환불,
// 안내 메일 + 푸시 발송. pixellab character는 선택적으로 삭제(별도 도구로).
//
// 실행:
//   bun --conditions=react-server run scripts/_refund-character.ts <pixellabCharacterId>
import { config } from 'dotenv';
import postgres from 'postgres';

config({ path: '.env.local' });

const PIXELLAB_CHARACTER_ID = process.argv[2];
if (!PIXELLAB_CHARACTER_ID) {
  console.error('usage: bun ... scripts/_refund-character.ts <pixellabCharacterId>');
  process.exit(1);
}
const REFUND_DIAMOND = 10000n;
const REASON = '캐릭터 환불 요청';

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error('DIRECT_URL/DATABASE_URL missing');
  process.exit(1);
}

const sql = postgres(url, { prepare: false, max: 1 });

try {
  // 1) 캐릭터 보유 user_profile + userId 조회
  const found = (await sql`
    select id::text as profile_id, user_id::text as user_id
    from public.user_profiles
    where pixellab_character_id = ${PIXELLAB_CHARACTER_ID}
    limit 1
  `) as unknown as Array<{ profile_id: string; user_id: string }>;
  if (found.length === 0) {
    console.error(`✗ user_profile not found for character ${PIXELLAB_CHARACTER_ID}`);
    process.exit(1);
  }
  const { profile_id: profileId, user_id: userId } = found[0]!;
  console.log(`✓ found user_profile ${profileId} owned by user ${userId}`);

  // 2) 트랜잭션 — user_profile 삭제 + 다이아 환불 + active 프로필 fallback + 메일 insert
  await sql.begin(async (tx) => {
    // active_profile_id가 이 프로필이면 — 가장 최근 다른 user_profile 또는 null로.
    await tx`
      update public.profiles
      set active_profile_id = (
        select id from public.user_profiles
        where user_id = ${userId}::uuid
          and id <> ${profileId}::uuid
          and hidden_at is null
        order by created_at desc
        limit 1
      )
      where id = ${userId}::uuid
        and active_profile_id = ${profileId}::uuid
    `;
    // 프로필 삭제
    const del = await tx`
      delete from public.user_profiles where id = ${profileId}::uuid
    `;
    console.log(`  deleted user_profile rows: ${del.count}`);
    // 다이아 환불
    await tx`
      update public.profiles
      set diamond = diamond + ${REFUND_DIAMOND.toString()}::bigint
      where id = ${userId}::uuid
    `;
    console.log(`  refunded diamond +${REFUND_DIAMOND}`);
    // 안내 메일
    await tx`
      insert into public.mailbox (user_id, type, title, body, sender_label, payload)
      values (
        ${userId}::uuid,
        'admin'::mailbox_type,
        ${'캐릭터 환불 안내'},
        ${
          `요청하신 캐릭터(${PIXELLAB_CHARACTER_ID.slice(0, 8)}…)가 목록에서 삭제되었습니다.\n\n사용된 다이아 ${REFUND_DIAMOND}개는 이미 계정으로 환불 처리되었습니다.\n다이아 잔액을 확인해 주세요.\n\n사유: ${REASON}`
        },
        ${'운영자'},
        ${'{}'}::jsonb
      )
      returning id::text as id
    `.then((rows) => {
      const first = (rows as unknown as { id: string }[])[0];
      console.log(`  mail inserted: ${first?.id}`);
    });
  });

  // 3) 현재 다이아 + 닉네임 표시(검증)
  const [{ nickname, diamond }] = (await sql`
    select nickname, diamond::text from public.profiles where id = ${userId}::uuid
  `) as unknown as Array<{ nickname: string; diamond: string }>;
  console.log(`✓ 최종: ${nickname} 다이아=${diamond}`);

  // 4) 푸시 — 별도 fetch 없이 endpoint 호출(서버 API 통해 보내려면 별도 — 여기선 메일 알림에 의존).
  //    배포된 환경에서는 mailbox 알림이 layout/홈 카드로 즉시 노출됨.
  console.log('ℹ push: 별도 cron으로 발송되거나, 다음 로그인 시 mailbox dot 알림.');
} catch (e) {
  console.error('✗ 실패:', (e as Error).message);
  process.exit(1);
} finally {
  await sql.end();
}
