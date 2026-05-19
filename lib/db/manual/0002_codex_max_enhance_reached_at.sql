-- ───────────────────────────────────────────────────────────────────────────
-- 0002 도감 max_enhance_reached_at — 아이템별 랭킹 동률 타이브레이크 (1회 적용)
--
-- 배경: 아이템별(catalog_item) 강화 Top10 + 챔피언(1위) 노출. 동률 시 그 레벨을
--   "먼저 달성한 유저" 우선 판정이 필요 → user_codex에 현재 max_enhance_level을
--   최초 달성한 시각 컬럼 추가(SCHEMA §2.3 / BALANCE §3.3 / WIREFRAMES §7.2).
--
-- 적용: Supabase SQL Editor에서 *프로덕션 DB*에 1회 실행(스키마 변경 + 기존 데이터
--   백필이라 명시적 검토 실행). 멱등 — enhancement_logs는 append-only 불변(§3.2)
--   이라 재실행해도 동일 값 산출(안전).
--
-- 백필 의미: 현재 max_enhance_level을 처음 도달한 로그의 min(created_at).
--   해당 로그 없음(예: +0 도감 = 보급 획득만, 강화 이력 없음) → first_acquired_at.
-- ───────────────────────────────────────────────────────────────────────────

-- 1) 컬럼 추가 ---------------------------------------------------------------
alter table public.user_codex
  add column if not exists max_enhance_reached_at timestamptz not null default now();

-- 2) 기존 행 백필 (결정적·재실행 안전) ---------------------------------------
--   to_level >= 현재 max 인 가장 이른 로그 = 그 기록을 처음 세운 시각.
--   max_enhance_level = 0(강화 이력 없는 +0 도감)은 서브쿼리가 NULL → 획득 시각.
update public.user_codex uc
set max_enhance_reached_at = coalesce(
  (
    select min(el.created_at)
    from public.enhancement_logs el
    where el.user_id = uc.user_id
      and el.catalog_item_id = uc.catalog_item_id
      and uc.max_enhance_level > 0
      and el.to_level >= uc.max_enhance_level
  ),
  uc.first_acquired_at
);
