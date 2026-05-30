-- 2026-05-30 실운영 테스트용 DB 초기화
-- 보존: catalog_items(장비 카탈로그), probability_snapshots(법적 §33), system_mode
-- 비움: auth.users CASCADE + 모든 user-data + admin_actions

BEGIN;

TRUNCATE TABLE
  -- avatar (캐릭터 프로필)
  public.user_profiles,
  public.profile_generation_jobs,
  public.profile_reports,
  -- checkin
  public.user_checkin_state,
  public.checkin_claim_logs,
  -- enhance
  public.enhancement_jobs,
  public.enhancement_logs,
  public.gem_time_reductions,
  -- equipment (인스턴스만, 카탈로그 보존)
  public.equipment_instances,
  public.user_codex,
  -- mailbox
  public.mailbox,
  public.mail_claim_logs,
  public.daily_supply_grants,
  -- payment
  public.iap_orders,
  public.iap_refunds,
  public.monthly_purchase_limits,
  public.identity_verifications,
  -- profiles
  public.profiles,
  -- push
  public.push_subscriptions,
  public.push_pending,
  -- raid
  public.raids,
  public.raid_participants,
  public.raid_attacks,
  public.raid_rewards,
  public.raid_daily_counts,
  -- social
  public.shares,
  public.referral_attributions,
  public.share_reward_claims,
  -- supply
  public.user_supply_boxes,
  public.supply_open_logs,
  public.disenchant_logs,
  -- transcend
  public.transcend_logs,
  -- ops (admin_actions만 — probability_snapshots·system_mode 보존)
  public.admin_actions,
  -- auth (Supabase) — CASCADE로 identities/sessions/refresh_tokens 등 자동 정리
  auth.users
CASCADE;

COMMIT;
