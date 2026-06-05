/**
 * 실운영 전 DB 초기화 — 닉네임·아바타(user_profiles)만 유지, 나머지 게임 진행 데이터 전부 비움.
 * 보존: profiles(컬럼만 리셋), user_profiles, push_subscriptions, catalog_items,
 *       daily_supply_broadcasts, system_mode, probability_snapshots, 법적테이블(iap·identity, 현재 0).
 * 스타터: 💎10,000 + 슬롯별 보급상자 100개, tutorial_step=1(신규처럼 튜토리얼 노출).
 *
 * 실행: bun run scripts/_reset-db.ts CONFIRM
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });

if (process.argv[2] !== 'CONFIRM') {
  console.error('안전장치: 실제 초기화하려면 →  bun run scripts/_reset-db.ts CONFIRM');
  process.exit(1);
}

const sql = postgres(process.env.DIRECT_URL ?? process.env.DATABASE_URL!, { prepare: false, max: 1 });

// 비울 테이블(유저별 게임 진행 데이터). user_profiles(아바타)·push_subscriptions·전역/법적 테이블은 제외.
const WIPE = [
  'ad_views',
  'battlepass_segments',
  'battlepass_state',
  'checkin_claim_logs',
  'daily_supply_grants',
  'enhancement_jobs',
  'enhancement_logs',
  'gem_time_reductions',
  'mail_claim_logs',
  'mailbox',
  'melee_participants',
  'melee_battles',
  'monthly_purchase_limits',
  'profile_generation_jobs',
  'profile_reports',
  'push_pending',
  'raid_attacks',
  'raid_rewards',
  'raid_participants',
  'raid_daily_counts',
  'raids',
  'shares',
  'supply_open_logs',
  'transcend_logs',
  'user_checkin_state',
  'user_equipment',
  'user_supply_boxes',
];

try {
  const [pre] = await sql<{ users: number; eq: number; profilesAvatar: number }[]>`
    select (select count(*) from profiles)::int as users,
           (select count(*) from user_equipment)::int as eq,
           (select count(*) from user_profiles)::int as "profilesAvatar"`;
  console.log(`초기화 전: 유저 ${pre.users} · 장비 ${pre.eq} · 아바타(유지) ${pre.profilesAvatar}`);

  await sql.begin(async (tx) => {
    // 한 문장 TRUNCATE — 상호 FK는 함께 비워 처리(외부 참조 있으면 에러로 안전 중단).
    await tx.unsafe(
      `truncate table ${WIPE.map((t) => `"${t}"`).join(', ')} restart identity`,
    );

    await tx`update profiles set
      diamond = 10000,
      tutorial_step = 1,
      nickname_changed_count = 0,
      representative_title_code = null,
      active_background = null,
      push_enhance = true, push_raid = true, push_supply = true,
      push_profile = true, push_referral = true, push_melee = true,
      push_enhance_mode = 'instant',
      updated_at = now()`;

    // 스타터 보급상자 재지급(슬롯별 100개).
    await tx.unsafe(`
      insert into user_supply_boxes (user_id, slot, count)
      select p.id, sl::slot, 100
      from profiles p, unnest(array['weapon','armor','accessory']) as sl`);
  });

  const post = await sql`
    select nickname, diamond, tutorial_step,
      (select count(*) from user_equipment e where e.user_id = profiles.id)::int as eq,
      (select coalesce(sum(count),0) from user_supply_boxes b where b.user_id = profiles.id)::int as boxes,
      (select count(*) from user_profiles up where up.user_id = profiles.id)::int as avatars
    from profiles order by created_at`;
  console.log('✓ 초기화 완료. 계정 상태:');
  for (const u of post)
    console.log(
      `  ${u.nickname}: 💎${u.diamond} · 장비 ${u.eq} · 보급상자 ${u.boxes} · 아바타 ${u.avatars} · tutorial_step ${u.tutorial_step}`,
    );
} catch (e) {
  console.error('✗ 초기화 실패(롤백됨):', (e as Error).message);
  process.exit(1);
} finally {
  await sql.end();
}
