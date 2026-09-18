-- 0202 (2026-09-18) 역사 페이지 시대 요약 저장 — 이야기꾼 문장의 정본.
-- 시대(한 길드가 가장 넓은 영토를 쥔 기간)는 시작일로 식별한다. 끝난 시대는 사실이 변하지 않아 한 번 생성하면 그대로,
-- 진행 중인 시대는 사실표 해시가 바뀔 때(날마다) 다시 생성한다. 운영자가 저장·확정하면 locked=true로 자동 갱신을 멈춘다.
-- 검수 없이 자동 공개되던 요약(Next 데이터 캐시)을 연대기처럼 운영자가 통제하기 위해.
create table if not exists history_era_summaries (
  server_id smallint not null,
  start_kst_day date not null,
  guild_id integer not null,
  end_kst_day date not null,
  ongoing boolean not null default true,
  facts_hash text not null,
  summary text not null,
  closing text not null default '',
  -- ai | code(검증 탈락·생성 실패로 집계 문장) | manual(운영자 수정)
  source text not null default 'ai',
  locked boolean not null default false,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (server_id, start_kst_day)
);

-- 역사 페이지의 읽기 전용 역할(스테이징이 프로덕션을 읽는 경로)에도 읽기 권한. 역할이 없는 DB(스테이징 자체)는 건너뛴다.
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'history_reader') then
    grant select on history_era_summaries to history_reader;
  end if;
end $$;
