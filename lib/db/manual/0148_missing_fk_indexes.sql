-- 0148 — 누락된 FK 인덱스 일괄(0147 후속 전수 점검)
--
-- Postgres는 FK 자식 컬럼에 인덱스를 자동으로 만들지 않는다. 없으면 **부모를 지울 때마다
-- 자식 테이블을 통째로 순차 스캔**한다. 0147(gem_time_reductions)이 컷오버에서 터진 뒤
-- FK 102개를 전수 점검했고, 그중 인덱스가 없는 40개를 아래 기준으로 골라냈다.
--
-- 고른 기준 = "부모가 실제로 지워지는가" × "자식이 계속 자라는가".
--   · 부모 삭제가 없는 FK(server_id→servers, catalog_item_id→catalog_items 등)는 제외했다.
--     운영상 서버·카탈로그를 지우지 않으므로 인덱스는 쓰기 비용만 늘린다.
--   · 자식이 작게 유지되는 것(chat_blocks·profile_reports 등)도 제외했다.
--
-- 지금 적용하는 이유: 컷오버 직후라 대상 테이블이 비어 있어 즉시 끝난다. 데이터가 찬 뒤에는
-- CREATE INDEX가 테이블을 잠그므로 CONCURRENTLY가 필요해진다.

-- ── 1) 우편 만료 크론(매일) — 0147과 동일한 실패 패턴 ────────────────────────
-- mail-expire가 만료 우편을 배치 루프로 대량 삭제한다. mail_id가 SET NULL인데 인덱스가
-- 없어 **삭제 1건마다 mail_claim_logs 전체를 스캔**한다. 크론에 TIME_BUDGET이 있어 멈추진
-- 않지만, 규모가 커지면 처리량이 조용히 밀려 만료 우편이 지워지지 않고 쌓인다.
create index if not exists mail_claim_logs_mail_id_idx on mail_claim_logs (mail_id);

-- ── 2) 계정 탈퇴(withdraw) — profiles 삭제가 훑는 대형 자식들 ────────────────
-- 탈퇴는 1건씩이라 자식당 스캔도 1회지만, 이 테이블들은 상한 없이 자라 스캔 비용도 함께 는다.
create index if not exists mail_claim_logs_user_id_idx on mail_claim_logs (user_id);
create index if not exists chat_messages_user_id_idx on chat_messages (user_id);
create index if not exists melee_participants_user_id_idx on melee_participants (user_id);
create index if not exists shares_user_id_idx on shares (user_id);
create index if not exists raid_join_requests_user_id_idx on raid_join_requests (user_id);
create index if not exists raid_invites_inviter_user_id_idx on raid_invites (inviter_user_id);

-- ── 3) 아바타 삭제(user_profiles) — 유저가 수시로 하는 동작 ──────────────────
create index if not exists characters_active_profile_id_idx on characters (active_profile_id);
create index if not exists profile_generation_jobs_user_profile_id_idx
  on profile_generation_jobs (user_profile_id);

-- ── 4) 길드 해산·문양 삭제 ───────────────────────────────────────────────────
create index if not exists guild_battle_deployments_guild_id_idx on guild_battle_deployments (guild_id);
create index if not exists conquest_battles_winner_guild_id_idx on conquest_battles (winner_guild_id);
create index if not exists guilds_active_emblem_id_idx on guilds (active_emblem_id);
