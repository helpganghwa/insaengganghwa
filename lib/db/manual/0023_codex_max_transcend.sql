-- ───────────────────────────────────────────────────────────────────────────
-- 0023 도감 max_transcend_level / max_transcend_reached_at — 초월 lifetime 기록 (1회 적용)
--
-- 배경: 배틀패스 '최고 초월 도달'은 단조(분해·제물 소모로 인스턴스가 사라져도 안 깎임)
--   여야 한다. 현재 transcend_level은 인스턴스의 *현재값*뿐이라 lifetime 소스가 없음.
--   강화의 max_enhance_level과 대칭으로 user_codex에 카탈로그별 역대 최고 초월을 기록.
--   계정 최고 초월 = MAX(user_codex.max_transcend_level) (SCHEMA §2.3 / BALANCE §2).
--
-- 적용: Supabase SQL Editor에서 DB에 1회 실행(스키마 변경 + 기존 데이터 백필이라 명시적
--   검토 실행). 멱등 — transcend_logs는 append-only 불변(§3.2)이라 재실행해도 동일 값.
--
-- 백필 의미: max_transcend_level = transcend_logs.to_t 의 카탈로그별 최댓값(역대 최고).
--   reached_at = 그 최고를 처음 도달한 로그의 min(created_at). 초월 이력 없음 → 획득 시각.
-- ───────────────────────────────────────────────────────────────────────────

-- 1) 컬럼 추가 ---------------------------------------------------------------
alter table public.user_codex
  add column if not exists max_transcend_level integer not null default 0,
  add column if not exists max_transcend_reached_at timestamptz not null default now();

-- 2) 레벨 백필 (append-only transcend_logs의 카탈로그별 max to_t) -----------------
update public.user_codex uc
set max_transcend_level = coalesce(
  (
    select max(tl.to_t)
    from public.transcend_logs tl
    where tl.user_id = uc.user_id
      and tl.catalog_item_id = uc.catalog_item_id
  ),
  0
);

-- 3) 달성 시각 백필 (결정적·재실행 안전) --------------------------------------
--   to_t >= 현재 max 인 가장 이른 로그 = 그 기록을 처음 세운 시각.
--   max_transcend_level = 0(초월 이력 없는 도감)은 서브쿼리가 NULL → 획득 시각.
update public.user_codex uc
set max_transcend_reached_at = coalesce(
  (
    select min(tl.created_at)
    from public.transcend_logs tl
    where tl.user_id = uc.user_id
      and tl.catalog_item_id = uc.catalog_item_id
      and uc.max_transcend_level > 0
      and tl.to_t >= uc.max_transcend_level
  ),
  uc.first_acquired_at
);
