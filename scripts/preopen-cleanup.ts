// 오픈 전 테스트 데이터 수동 청소 — lib/game/account/reset-test-data.ts와 동일 로직을
// 프로덕션에 직접 실행한다(심사 5 + 어드민 계정의 게임 데이터 리셋, 계정·구독 유지).
// 실행: bun run scripts/preopen-cleanup.ts --prod [--confirm]  (기본 드라이런)
// 용도: ① 봉인 기간 테스트 후 즉시 리셋(재로그인 = 신규 캐릭터 = 튜토리얼 재현)
//      ② 8/24 10:15 크론(preopen-cleanup)의 수동 백업 수단
import { config } from 'dotenv';
import postgres from 'postgres';

config({ path: '.env.local' });

const prod = process.argv.includes('--prod');
const confirm = process.argv.includes('--confirm');
const url = prod ? process.env.PROD_DATABASE_URL : process.env.DATABASE_URL;
if (!url) { console.error('DB URL 없음'); process.exit(1); }

const REVIEW_EMAILS = [
  'cbt@ganghwa.app', 'cbt2@ganghwa.app', 'cbt3@ganghwa.app', 'cbt4@ganghwa.app', 'cbt5@ganghwa.app',
];

const sql = postgres(url, { prepare: false, max: 1 });

const targets = (await sql`
  select p.id, (select email from auth.users u where u.id = p.id) as email, p.is_admin
  from profiles p
  where p.is_admin or p.id in (select id from auth.users where email = any(${REVIEW_EMAILS}))
`) as { id: string; email: string | null; is_admin: boolean }[];

console.log(`대상 ${targets.length}계정 (${prod ? 'PROD' : 'staging'}):`);
for (const t of targets) console.log(' ', t.email ?? t.id, t.is_admin ? '(admin)' : '(review)');

const [pre] = await sql`
  select (select count(*) from characters where user_id in ${sql(targets.map((t) => t.id))})::int as chars,
         (select count(*) from guilds where leader_user_id in ${sql(targets.map((t) => t.id))})::int as guilds`;
console.log(`청소 대상: 캐릭터 ${pre.chars} · 리더 길드 ${pre.guilds}`);

if (!confirm) {
  console.log('드라이런 종료 — 실행하려면 --confirm');
  await sql.end();
  process.exit(0);
}

// 실행은 서버 코드와 동일 로직 — 여기서는 라우트를 재구현하지 않고 SQL 시퀀스를 직접 수행
// (lib는 server-only라 스크립트에서 import 불가). ⚠ lib/game/account/reset-test-data.ts와
// 목록을 항상 동기화할 것.
const ids = targets.map((t) => t.id);
await sql.begin(async (tx) => {
  // 공유 테이블 전체 삭제 — 2차 wipe 이후 생성분은 전부 테스트 파생(lib/reset-test-data와 동기).
  await tx`delete from guild_emblem_escrows`;
  await tx`delete from guild_audit_log`;
  await tx`delete from guild_tax_distributions`;
  await tx`delete from conquest_battles`;
  await tx`delete from guild_battle_deployments`;
  await tx`delete from guild_join_requests`;
  await tx`delete from guild_leave_log`;
  await tx`delete from guild_members`;
  // zones는 점령 상태 전체 리셋(전수 감사 2026-08-21) — lib/reset-test-data와 동기.
  await tx`update zones set owner_guild_id = null, executor_user_id = null, tax_points = 0,
    tax_diamond = 0, last_tax_collected_at = null, captured_at = null, tax_bonus = 1
    where owner_guild_id is not null or executor_user_id is not null
       or tax_points <> 0 or tax_diamond <> 0 or tax_bonus <> 1 or captured_at is not null`;
  await tx`delete from guild_emblems`;
  await tx`delete from guilds`;
  await tx`delete from world_chronicle`;
  await tx`delete from world_events`;
  await tx`delete from chat_messages`;
  await tx`delete from raid_invites`;
  await tx`delete from raid_attacks`;
  await tx`delete from raid_rewards`;
  await tx`delete from raid_participants`;
  await tx`delete from raid_join_requests`;
  await tx`delete from raid_daily_counts`;
  await tx`delete from raids`;
  await tx`delete from melee_participants`;
  await tx`delete from melee_battles`;
  await tx`delete from ranking_leaders`;
  await tx`delete from support_inquiries`;
  await tx`delete from client_errors`;
  await tx`delete from admin_mail_logs`;
  await tx`delete from profile_reports where reporter_user_id in ${tx(ids)} or profile_id in (select id from user_profiles where user_id in ${tx(ids)})`;
  await tx`delete from mail_claim_logs where user_id in ${tx(ids)}`;
  await tx`delete from mailbox where user_id in ${tx(ids)}`;
  await tx`delete from checkin_claim_logs where user_id in ${tx(ids)}`;
  await tx`delete from user_checkin_state where user_id in ${tx(ids)}`;
  await tx`delete from battlepass_segments where user_id in ${tx(ids)}`;
  await tx`delete from battlepass_state where user_id in ${tx(ids)}`;
  await tx`delete from enhancement_logs where user_id in ${tx(ids)}`;
  await tx`delete from gem_time_reductions where user_id in ${tx(ids)}`;
  await tx`delete from enhancement_jobs where user_id in ${tx(ids)}`;
  await tx`delete from transcend_logs where user_id in ${tx(ids)}`;
  await tx`delete from supply_open_logs where user_id in ${tx(ids)}`;
  await tx`delete from user_supply_boxes where user_id in ${tx(ids)}`;
  await tx`delete from user_equipment where user_id in ${tx(ids)}`;
  await tx`delete from daily_supply_grants where user_id in ${tx(ids)}`;
  await tx`delete from premium_daily_grants where user_id in ${tx(ids)}`;
  await tx`delete from shop_free_claims where user_id in ${tx(ids)}`;
  await tx`delete from shop_purchases where user_id in ${tx(ids)}`;
  await tx`delete from friend_links where requester_id in ${tx(ids)} or addressee_id in ${tx(ids)}`;
  await tx`delete from shares where user_id in ${tx(ids)}`;
  await tx`delete from ad_views where user_id in ${tx(ids)}`;
  await tx`delete from push_pending where user_id in ${tx(ids)}`;
  await tx`delete from whisper_reads where user_id in ${tx(ids)} or peer_user_id in ${tx(ids)}`;
  await tx`delete from whisper_messages where from_user_id in ${tx(ids)} or to_user_id in ${tx(ids)}`;
  await tx`delete from chat_blocks where user_id in ${tx(ids)} or blocked_user_id in ${tx(ids)}`;
  await tx`delete from chat_reports where reporter_user_id in ${tx(ids)}`;
  await tx`delete from diamond_ledger where user_id in ${tx(ids)}`;
  await tx`delete from leaderboard_ranks where user_id in ${tx(ids)}`;
  await tx`delete from codex_champions where user_id in ${tx(ids)}`;
  await tx`delete from user_milestones where user_id in ${tx(ids)}`;
  await tx`delete from user_daily_stats where user_id in ${tx(ids)}`;
  await tx`delete from challenge_claims where user_id in ${tx(ids)}`;
  await tx`delete from challenge_events where user_id in ${tx(ids)}`;
  await tx`delete from user_titles where user_id in ${tx(ids)}`;
  await tx`delete from announcement_poll_votes where user_id in ${tx(ids)}`;
  await tx`delete from profile_generation_jobs where user_id in ${tx(ids)}`;
  await tx`delete from user_profiles where user_id in ${tx(ids)}`;
  await tx`delete from characters where user_id in ${tx(ids)}`;
});
console.log(`청소 완료: ${targets.length}계정 · 리더 길드 ${pre.guilds}개`);
await sql.end();
