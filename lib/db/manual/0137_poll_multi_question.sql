-- 0137: 공지 투표 다중 설문 — 한 공지에 질문 그룹 여러 개(그룹당 1인 1표).
-- 기존 행은 question_no=1(단일 설문)로 그대로 유효. PK를 (공지,유저) → (공지,유저,질문)으로 교체.
-- 2026-07-27 점령전 의견수렴 공지(질문 3개) 선행 작업.

alter table announcement_poll_votes
  add column if not exists question_no smallint not null default 1;

do $$
begin
  -- 이미 새 PK면 skip(멱등) — 구성 컬럼 수로 판별.
  if (
    select count(*)
    from information_schema.key_column_usage
    where table_name = 'announcement_poll_votes' and constraint_name = 'announcement_poll_votes_pkey'
  ) < 3 then
    alter table announcement_poll_votes drop constraint announcement_poll_votes_pkey;
    alter table announcement_poll_votes add primary key (announcement_id, user_id, question_no);
  end if;
end $$;
