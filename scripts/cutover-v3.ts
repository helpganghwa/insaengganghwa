// ⚠️ 파괴적 컷오버 — 108 카탈로그 → 3차 60종(CATALOG_V3) 전환 + CBT식 진행 초기화.
// 범위(확정): 계정 유지 / 결제·본인인증 삭제 / 아바타 유지(WIPE_AVATARS로 토글) / zones 구조 유지(점령상태 리셋).
// 실행: bun run scripts/cutover-v3.ts --db=staging            (드라이런: 삭제될 행 수만 출력)
//       bun run scripts/cutover-v3.ts --db=staging --confirm  (실제 실행, 단일 트랜잭션)
//       bun run scripts/cutover-v3.ts --db=prod    --confirm
// 안전: --db 필수, --confirm 없으면 드라이런. 전부 한 트랜잭션(중간 실패=전체 롤백). CASCADE 미사용.
import { config } from 'dotenv';
import postgres from 'postgres';
import { CATALOG_V3 } from '../lib/game/equipment/catalog-v3';

config({ path: '.env.local' });
config({ path: '.env', override: false });

const WIPE_AVATARS = false; // 아바타(user_profiles 등) — Pixellab 비용이라 기본 유지. true면 함께 삭제.

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
const has = (k: string) => process.argv.includes(`--${k}`);
const target = arg('db'); // staging | prod
const confirm = has('confirm');

const URL =
  target === 'prod' ? process.env.PROD_DATABASE_URL
  : target === 'staging' ? process.env.DATABASE_URL
  : undefined;
if (!target || !URL) {
  console.error('--db=staging|prod 필요 (staging=DATABASE_URL, prod=PROD_DATABASE_URL)');
  process.exit(1);
}
const TARGET: string = target; // main() 클로저에서 narrowing 유지용

// FK 안전 순서(자식 → 부모). CASCADE 사용 안 함.
const WIPE_TABLES = [
  'enhancement_jobs', 'enhancement_logs', 'gem_time_reductions',
  'transcend_logs',
  'supply_open_logs', 'user_supply_boxes',
  'user_equipment',
  'raid_attacks', 'raid_rewards', 'raid_participants', 'raid_join_requests', 'raid_daily_counts', 'raids',
  'melee_participants', 'melee_battles',
  'guild_audit_log', 'world_chronicle', 'guild_tax_distributions', 'conquest_battles',
  'guild_battle_deployments', 'guild_leave_log', 'guild_join_requests', 'guild_members',
  'guild_emblems', 'guilds', // zones.owner_guild_id → set null 자동
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
  'characters',
  ...(WIPE_AVATARS ? ['profile_reports', 'profile_generation_jobs', 'user_profiles'] : []),
  // catalog_items 는 마지막에 삭제 후 재시드(아래 별도 처리)
];

// 유지(삭제 안 함): profiles, servers, zones(+점령리셋), zone_adjacency, probability_snapshots,
//   system_mode, announcements, push_subscriptions, (아바타 3종: WIPE_AVATARS=false 기본 유지)

const sql = postgres(URL, { prepare: false, max: 1 });

async function main() {
  console.log(`\n=== 컷오버 대상: ${TARGET.toUpperCase()} ${confirm ? '(실행)' : '(드라이런)'} ===`);
  console.log(`아바타 삭제: ${WIPE_AVATARS} · 결제기록 삭제: 예 · 계정 유지: 예\n`);

  // 현재 행 수
  for (const t of [...WIPE_TABLES, 'catalog_items', 'zones', 'profiles']) {
    const [{ c }] = await sql.unsafe(`select count(*)::int as c from ${t}`);
    console.log(`  ${t.padEnd(28)} ${c}`);
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
    // zones 점령상태 리셋(행 구조는 유지)
    await tx.unsafe(`update zones set owner_guild_id=null, executor_user_id=null, tax_points=0, tax_diamond=0, last_tax_collected_at=null, captured_at=null`);
    // 카탈로그 교체: 108 삭제 → 60 재시드
    await tx.unsafe(`delete from catalog_items`);
    for (const c of CATALOG_V3) {
      await tx`insert into catalog_items (code, name, slot, active) values (${c.key}, ${c.nameKo}, ${c.slot}, true)`;
    }
  });

  const [{ c: cat }] = await sql.unsafe(`select count(*)::int as c from catalog_items`);
  console.log(`\n완료. catalog_items = ${cat}종 (CATALOG_V3 ${CATALOG_V3.length})`);
  await sql.end();
}

main().catch(async (e) => { console.error(e); await sql.end(); process.exit(1); });
