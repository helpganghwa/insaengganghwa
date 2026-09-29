-- 0223: 칭호 조건 강화 시 기존 보유자 잠금(2026-09-29, docs/TITLES.md 무한의 탑 절).
--  오관왕(pentagon)이 육관왕(랭킹 6종 모두 10위 이내)으로 바뀌며, 5종 기준으로 얻은 기존 보유자는
--  발견 상태는 유지하되 새 조건을 한 번 채우기 전까지 비활성(목록 '비활성', 대표로 달아도 표시 안 함).
--  judge가 새 조건 달성을 확인하면 행을 지워 잠금을 푼다. 행이 없으면 평소대로(영구형).
-- 신설 표라 코드보다 먼저 적용해도 무해. 기존 보유자 등록은 멱등(on conflict do nothing).
begin;

create table if not exists title_legacy_locks (
  user_id uuid not null references profiles(id) on delete cascade,
  server_id smallint not null,
  title_code text not null,
  locked_at timestamptz not null default now(),
  primary key (user_id, server_id, title_code)
);
alter table title_legacy_locks enable row level security;

insert into title_legacy_locks (user_id, server_id, title_code)
select user_id, server_id, 'pentagon' from user_titles where title_code = 'pentagon'
on conflict do nothing;

commit;
