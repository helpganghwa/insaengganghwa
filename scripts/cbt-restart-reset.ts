// ⚠️ 파괴적 — CBT 모집 전 진행도 전체 리셋(2026-07-13). cutover-v3와 동일 wipe 목록·FK 순서를
//   재사용하되 **카탈로그는 건드리지 않는다**(현행 106종 유지). cutover-v3는 108→60 전환 전용이라
//   지금 돌리면 카탈로그를 60종으로 되돌려 46종을 파괴하므로 쓰면 안 됨(이 스크립트가 대체).
//
// 범위(사용자 확정): 진행/경제/장비/강화·초월/보급/우편/길드/레이드/대난투/랭킹/도감 삭제 +
//   캐릭터 삭제(재로그인=새 시작·닉네임 해방) + 결제·본인인증 기록 삭제 + zones 점령상태 리셋.
// 보존: 계정(profiles·auth) · 아바타(user_profiles) · 카탈로그 106종 · zones 구조 · zone_adjacency ·
//   servers · system_mode · announcements(CBT 공지) · probability_snapshots · push_subscriptions.
// 부수: 계정은 남기되 본인인증 파생 필드(is_adult·identity_verified_at·birth_year_hash)를 리셋
//   (identity_verifications를 지우므로 정합 유지).
//
// 실행: bun run scripts/cbt-restart-reset.ts --db=staging            (드라이런: 삭제될 행 수만)
//       bun run scripts/cbt-restart-reset.ts --db=staging --confirm  (실행, 단일 트랜잭션)
//       bun run scripts/cbt-restart-reset.ts --db=prod    --confirm
// 안전: --db 필수 · --confirm 없으면 드라이런 · 전부 한 트랜잭션(중간 실패=전체 롤백) · CASCADE 미사용.
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
const TARGET: string = target;

// FK 안전 순서(자식 → 부모). CASCADE 사용 안 함. cutover-v3 검증본 재사용(카탈로그·아바타 제외).
const WIPE_TABLES = [
  'enhancement_jobs', 'enhancement_logs', 'gem_time_reductions',
  'transcend_logs',
  'supply_open_logs', 'user_supply_boxes',
  'user_equipment',
  'raid_attacks', 'raid_rewards', 'raid_participants', 'raid_join_requests', 'raid_daily_counts', 'raids',
  'melee_participants', 'melee_battles',
  'guild_audit_log', 'world_chronicle', 'guild_tax_distributions', 'conquest_battles',
  'guild_battle_deployments', 'guild_leave_log', 'guild_join_requests', 'guild_members',
  'guild_emblems', 'guilds', // zones.owner_guild_id → 아래 update로 null
  'friend_links',
  'shares', 'referral_attributions',
  'codex_champions', 'leaderboard_ranks',
  'shop_free_claims', 'shop_purchases',
  'mail_claim_logs', 'admin_mail_logs', 'daily_supply_grants', 'premium_daily_grants', 'mailbox',
  'checkin_claim_logs', 'user_checkin_state',
  'battlepass_segments', 'battlepass_state',
  'ranking_leaders', 'world_events',
  'payment_alerts', 'monthly_purchase_limits', 'iap_refunds', 'iap_orders', 'identity_verifications',
  'client_errors', 'admin_actions',
  'push_pending',
  'characters', // 재로그인 시 새 캐릭터로 시작(닉네임 해방). 아바타(user_profiles)는 userId 키라 보존.
];

// 유지(삭제 안 함): profiles, auth.users, user_profiles(아바타), catalog_items, servers,
//   zones(+점령리셋), zone_adjacency, probability_snapshots, system_mode, announcements, push_subscriptions.

const sql = postgres(URL, { prepare: false, max: 1 });

async function main() {
  console.log(`\n=== CBT 재시작 리셋: ${TARGET.toUpperCase()} ${confirm ? '(실행)' : '(드라이런)'} ===`);
  console.log('아바타 유지 · 카탈로그 유지(106) · 계정 유지 · 결제/본인인증 삭제 · 캐릭터 삭제(새 시작)\n');

  for (const t of [...WIPE_TABLES, 'catalog_items', 'zones', 'profiles', 'user_profiles']) {
    const [{ c }] = await sql.unsafe(`select count(*)::int as c from ${t}`);
    const tag = t === 'catalog_items' || t === 'zones' || t === 'profiles' || t === 'user_profiles' ? ' (유지)' : '';
    console.log(`  ${t.padEnd(28)} ${String(c).padStart(5)}${tag}`);
  }

  if (!confirm) {
    console.log('\n드라이런 종료. 실제 실행하려면 --confirm 추가.');
    await sql.end();
    return;
  }

  console.log('\n--confirm 감지 → 트랜잭션 실행...');
  await sql.begin(async (tx) => {
    for (const t of WIPE_TABLES) {
      await tx.unsafe(`delete from ${t}`);
    }
    // zones 점령상태만 리셋(행 구조·인접 유지).
    await tx.unsafe(
      `update zones set owner_guild_id=null, executor_user_id=null, tax_points=0, tax_diamond=0, last_tax_collected_at=null, captured_at=null`,
    );
    // 계정은 남기되 본인인증 파생 필드 리셋(identity_verifications 삭제와 정합).
    await tx.unsafe(
      `update profiles set is_adult=false, identity_verified_at=null, birth_year_hash=null`,
    );
  });

  const [{ c: cat }] = await sql.unsafe(`select count(*)::int as c from catalog_items`);
  const [{ c: acc }] = await sql.unsafe(`select count(*)::int as c from profiles`);
  const [{ c: chars }] = await sql.unsafe(`select count(*)::int as c from characters`);
  console.log(`\n완료. 카탈로그 ${cat}종 유지 · 계정 ${acc}개 유지 · 캐릭터 ${chars}(전부 삭제됨→재로그인시 생성)`);
  await sql.end();
}

main().catch(async (e) => {
  console.error(e);
  await sql.end();
  process.exit(1);
});
