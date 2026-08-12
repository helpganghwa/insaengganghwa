// ⚠️ 파괴적 컷오버 — CBT 종료 → 실운영 전환 wipe. 전체 절차는 docs/CUTOVER-LIVE.md 런북 참조.
// 범위(확정): 계정(profiles) 유지 / 진행·경제·결제·아바타 삭제 / 카탈로그 현행 유지(재시드 없음)
//            / zones 구조 유지(점령상태 리셋) / cbt_carryover·push_subscriptions 등 명시 보존.
// 실행: bun run scripts/cutover-live.ts --db=prod            (드라이런: 삭제될 행 수만 출력)
//       bun run scripts/cutover-live.ts --db=prod --confirm  (실제 실행, 단일 트랜잭션)
// 안전장치: --confirm 없으면 드라이런 / cbt_carryover 스냅샷 선행 필수 / maintenance 선전환 필수
//          / 보존 테이블 오염 가드 / CASCADE 미사용(자식→부모 delete 순서).
import { config } from 'dotenv';
import postgres from 'postgres';

import { ghostTables, unclassifiedTables } from './cutover-tables';

config({ path: '.env.local' });
config({ path: '.env', override: false });

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
const has = (k: string) => process.argv.includes(`--${k}`);
const target = arg('db'); // staging | prod
const confirm = has('confirm');
// 2차 wipe(출시 직전) 전용 — 테스트 기간의 심사 실결제가 존재하므로 결제·본인인증
// 법정 보존 5종(전자상거래법 5년)을 삭제 목록에서 제외한다(2026-07-31 2단계 플로우).
const keepPayments = has('keep-payments');
const PAYMENT_TABLES = new Set([
  'payment_alerts', 'monthly_purchase_limits', 'iap_refunds', 'iap_orders', 'identity_verifications',
]);

const URL =
  target === 'prod' ? process.env.PROD_DATABASE_URL
  : target === 'staging' ? process.env.DATABASE_URL
  : undefined;
if (!target || !URL) {
  console.error('--db=staging|prod 필요 (staging=DATABASE_URL, prod=PROD_DATABASE_URL)');
  process.exit(1);
}
const TARGET: string = target;

// FK 안전 순서(자식 → 부모). CASCADE 사용 안 함.
// CBT 종료 시 아바타(user_profiles)는 삭제하고 이월하지 않는다(2026-07-24 보존 철회) —
// 유저는 컷오버 후 기본 아바타 2종으로 새 시작. cbt-snapshot도 avatars를 스냅샷하지 않는다.
const WIPE_TABLES = [
  // gem_time_reductions가 enhancement_jobs보다 **먼저** 와야 한다 — 부모를 먼저 지우면
  // CASCADE가 35만 행을 한 건씩 걷어내며 statement_timeout을 넘긴다(2026-08-01 실측).
  // 자식을 벌크로 먼저 비우면 뒤이은 부모 삭제에 걷어낼 것이 남지 않는다.
  'gem_time_reductions', 'enhancement_jobs', 'enhancement_logs',
  'transcend_logs',
  'supply_open_logs', 'user_supply_boxes',
  'user_equipment',
  'raid_attacks', 'raid_rewards', 'raid_participants', 'raid_join_requests', 'raid_invites', 'raid_daily_counts', 'raids',
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
  // user_milestones: 개인 기록 단조 워터마크(0103). profiles FK CASCADE는 profiles 보존이라
  // 안 터짐 — 남기면 CBT 고점을 넘을 때까지 마일스톤 피드가 침묵한다.
  'ranking_leaders', 'world_events', 'user_milestones',
  // ad_views: 광고 보상 v1 미도입(빈 테이블 예상)이나 0000에서 생성돼 물리 존재 — 유저 귀속 데이터.
  'ad_views',
  'payment_alerts', 'monthly_purchase_limits', 'iap_refunds', 'iap_orders', 'identity_verifications',
  'client_errors', 'admin_actions',
  'support_inquiries', // CBT 문의 — 실운영 첫날 오탐 배지 방지
  'push_pending', 'daily_supply_broadcasts',
  // 누락분 보강(2026-07-31 전수 대조 — 80개 테이블 vs WIPE/PROTECTED 차집합):
  //  · 채팅 3종: CBT 대화·차단·신고가 오픈 월드에 그대로 남았다(chat_messages 256행 확인).
  //  · 도전과제 2종: 진행/보상 이력 — 유저 데이터.
  //  · guild_emblem_escrows: 문양 생성 에스크로(다이아 보류분) — 길드 wipe 후 고아가 된다.
  //  · admin_scheduled_mails: CBT용 예약 우편이 오픈 후 발송되는 사고 방지.
  //  · user_daily_stats: 일자별 개인 집계.
  'chat_reports', 'chat_blocks', 'chat_messages',
  'whisper_reads', 'whisper_reports', 'whisper_messages', // 귓속말(0155) — 1:1 대화·읽음 포인터·신고도 유저 데이터
  'challenge_claims', 'challenge_events',
  'guild_emblem_escrows',
  'admin_scheduled_mails',
  'user_daily_stats',
  // 2026-08-12 감사 보강 — 07-31 대조 **이후에** 생긴 테이블이라 목록에서 빠져 있었다.
  //  · user_titles(0149·0152): 칭호 발견 원장. 진행도는 전부 지워지는데 이것만 남으면 진행도 0인
  //    계정이 발견형·업적형 칭호를 그대로 달고 출시를 맞는다(조건부만 표시 시점에 재검증된다).
  //  · diamond_ledger(0159): 다이아 증감 원장. 잔액·진행이 사라진 뒤 지급 기록만 남으면 원장이
  //    대조 근거로서의 의미를 잃는다.
  //  · announcement_poll_votes: 공지(보존)의 자식이라 CASCADE로도 안 지워진다 — CBT 투표 결과가
  //    출시 후 공지에 그대로 남는다.
  'user_titles', 'diamond_ledger', 'announcement_poll_votes',
  'characters', // active_profile_id → user_profiles 참조라 아바타 3종보다 먼저
  'profile_reports', 'profile_generation_jobs', 'user_profiles',
];

// 절대 삭제 금지 — 목록 편집 실수를 런타임에 차단한다.
//  - profiles: cbt_carryover가 CASCADE FK로 매달려 있고(0096), handle_new_user 트리거는
//    auth.users INSERT에만 발화해 profiles만 지우면 계정이 영영 재생성되지 않는다.
//  - cbt_carryover / (storage) cbt-keepsake: 이월 보상 원장 — wipe 생존이 존재 이유.
//  - cron_heartbeats: 크론 dead-man 원장. 지우면 전 크론이 '한 번도 성공한 적 없음'으로 읽혀
//    출시 직후 워치독이 전부 정지로 오탐한다.
//  - schema_migrations: 마이그레이션 적용 원장. 지우면 재적용 판정이 무너진다.
const PROTECTED = [
  'profiles', 'cbt_carryover', 'servers', 'zones', 'zone_adjacency',
  'probability_snapshots', 'system_mode', 'announcements', 'push_subscriptions', 'catalog_items',
  'cron_heartbeats', 'schema_migrations',
];

const sql = postgres(URL, { prepare: false, max: 1 });

async function main() {
  console.log(`\n=== CBT 종료 컷오버 대상: ${TARGET.toUpperCase()} ${confirm ? '(실행)' : '(드라이런)'} ===\n`);

  // 가드 0 — 보존 테이블이 wipe 목록에 섞이지 않았는지.
  for (const p of PROTECTED) {
    if (WIPE_TABLES.includes(p)) {
      console.error(`중단: 보존 테이블 '${p}'가 WIPE_TABLES에 들어 있음`);
      process.exit(1);
    }
  }

  // 가드 1~3 — 드라이런에서는 경고만(현황 파악용), --confirm에서는 하나라도 걸리면 중단.
  const guardFails: string[] = [];

  // 가드 0.5 — 분류 누락. public 테이블은 전부 삭제 또는 보존으로 분류돼 있어야 한다.
  // 수작업 대조는 잊힌다: 2026-07-31에 같은 누락을 전수 대조로 보강했는데 12일 만에 재발했다
  // (user_titles·diamond_ledger가 그 뒤에 생겨 컷오버를 살아남을 상태였다). 새 테이블을 만든
  // 사람이 그 자리에서 결정하도록 스크립트가 막는다.
  const unclassified = await unclassifiedTables(sql, WIPE_TABLES, PROTECTED);
  if (unclassified.length > 0) {
    guardFails.push(
      `미분류 테이블 ${unclassified.length}종 — WIPE_TABLES/PROTECTED 중 하나에 넣을 것: ${unclassified.join(', ')}`,
    );
  }
  const ghosts = await ghostTables(sql, WIPE_TABLES, PROTECTED);
  if (ghosts.length > 0) {
    guardFails.push(`목록에만 있고 DB엔 없는 테이블 ${ghosts.length}종(오타·드랍 잔재): ${ghosts.join(', ')}`);
  }

  // 이월 스냅샷 선행(cbt-snapshot --confirm). 미지급(granted_at null) 행이 있어야 정상.
  const [{ c: carry }] = await sql.unsafe(
    `select count(*)::int as c from cbt_carryover where granted_at is null`,
  );
  if (carry === 0 && !has('allow-empty-carryover')) {
    guardFails.push('cbt_carryover 미지급 행 0 — cbt-snapshot --confirm 선행 필요(우회: --allow-empty-carryover)');
  }

  // maintenance 선전환. 단일 트랜잭션이라 실행 중에도 유저는 옛 상태를 읽으며 플레이한다.
  const [mode] = await sql.unsafe(`select mode from system_mode where key = 'global'`);
  if (mode?.mode !== 'maintenance' && !has('skip-maintenance-check')) {
    guardFails.push(`system_mode='${mode?.mode ?? '(행 없음)'}' — 점검 모드 선전환 필요(우회: --skip-maintenance-check)`);
  }

  // 카탈로그는 재시드하지 않는다(현행이 정본). 비어 있으면 NO_CATALOG 소프트락.
  const [{ c: cat }] = await sql.unsafe(`select count(*)::int as c from catalog_items where active = true`);
  if (cat === 0) guardFails.push('catalog_items active 0 — 카탈로그 시드 필요');

  if (guardFails.length > 0) {
    for (const g of guardFails) console.warn(`  ⚠ 가드: ${g}`);
    if (confirm) {
      console.error('\n중단: 위 가드를 해소한 뒤 다시 실행하세요.');
      process.exit(1);
    }
  }

  console.log(`  cbt_carryover 미지급 ${carry}건 · catalog active ${cat}종 · system_mode=${mode?.mode}\n`);
  for (const t of [...WIPE_TABLES, 'zones', 'profiles', 'cbt_carryover']) {
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
    // Supabase 기본 statement_timeout(2min)으로는 대량 CASCADE 삭제가 중간에 잘린다 —
    // enhancement_jobs(45만) 삭제가 gem_time_reductions(35만)를 행 단위로 걷어내며 넘겼다
    // (2026-08-01 컷오버 1차 시도, 트랜잭션이라 전부 롤백). 이 트랜잭션에만 해제한다.
    await tx.unsafe(`set local statement_timeout = 0`);
    const effectiveTables = keepPayments
      ? WIPE_TABLES.filter((t) => !PAYMENT_TABLES.has(t))
      : WIPE_TABLES;
    if (keepPayments) console.log(`--keep-payments: 결제·본인인증 ${PAYMENT_TABLES.size}종 보존`);
    for (const t of effectiveTables) {
      await tx.unsafe(`delete from ${t}`);
    }
    // zones 점령상태 리셋(행 구조는 유지)
    await tx.unsafe(
      `update zones set owner_guild_id=null, executor_user_id=null, tax_points=0, tax_diamond=0, last_tax_collected_at=null, captured_at=null`,
    );
  });

  console.log('\n완료. 다음 단계는 docs/CUTOVER-LIVE.md 런북 §4 이후를 따르세요.');
  await sql.end();
}

main().catch(async (e) => { console.error(e); await sql.end(); process.exit(1); });
