-- 0203 (2026-09-19) 역사 시대 요약 — 이야기꾼은 제안만 하고, 운영자가 확인해 적용한다.
-- 0202에서는 자정 공개 뒤 크론이 생성문을 곧바로 정본(summary)에 덮어썼다. 이제 생성문은 proposed_*에만 쌓이고,
-- 어드민에서 [제안 적용]을 눌러야 정본이 바뀐다. proposed_facts_hash는 '이 사실표로는 이미 제안했다(또는 버렸다)'는 표시 —
-- 같은 사실표로 다시 생성하지 않는다. locked의 뜻은 '자동 덮어쓰기 금지'에서 '제안 받지 않음'으로 바뀐다(정본은 어차피 크론이 못 건드린다).
-- 컬럼 추가뿐이라 이전 코드와도 호환된다(배포 전에 먼저 적용).
alter table history_era_summaries
  add column if not exists proposed_summary text,
  add column if not exists proposed_closing text,
  add column if not exists proposed_facts_hash text,
  add column if not exists proposed_at timestamptz;
