-- 0105: CBT 이월 — 아바타 전체 목록 이월로 확장
-- 정체성 이월 정책: 닉네임 + 아바타 전 목록(비기본) + 추천 보상. 진행도(강화/다이아/장비)는
-- 이월하지 않는다. 단일 keepsake(마지막 착용 1개) 컬럼을 avatars 목록으로 대체.
-- avatars: [{ image_url, was_active, pixellab_character_id, options, equipment_snapshot,
--            description_prompt, created_at }] — image_url은 wipe-생존 cbt-keepsake/ 복사본.
-- 테이블은 스냅샷(컷오버 직전) 전까지 비어 있으므로 컬럼 교체 안전. 멱등.

alter table public.cbt_carryover add column if not exists avatars jsonb;
alter table public.cbt_carryover drop column if exists keepsake;
alter table public.cbt_carryover drop column if exists keepsake_image_url;
