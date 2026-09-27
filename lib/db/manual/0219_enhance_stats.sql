-- 0219: 강화 누적 지표(2026-09-28) — 칭호 판정이 enhancement_logs를 통째로 훑지 않게.
--
-- 칭호 판정(lib/game/titles/judge.ts collectMetrics)은 강화 지표 약 40개를 매번 그 유저의 강화 기록
-- 전체에서 다시 셌다. 기록 199만 건 유저의 판정이 20초로 칭호 화면 제한(8초)을 넘어 화면이 영영
-- 열리지 않았다(2026-09-28 문의 #348). 판정에 필요한 값을 수령 시점에 누적해 두고 판정은 한 행만 읽는다.
--
--  - enhance_stats: 유저·서버 한 행. 횟수·시간대 횟수·최장 연속·하루 최다·연속 강화일·최초 +100 시각 등.
--    연속·일 단위 지표는 "직전 결과·현재 연속 길이·오늘 날짜" 같은 상태값으로 이어 센다.
--  - enhance_equip_stats: 장비 한 행. 장비 단위 순서 조건(칠전팔기·환생·무하락 90→100·무단축 +50)과 장비별 누적.
--  - 한 로그를 반영하는 규칙은 enhance_stats_next / enhance_equip_next 두 함수에만 있다. 수령(resolve.ts의
--    RT2 문장)과 재구성(enhance_stats_rebuild)이 같은 함수를 쓴다 — 두 경로의 결과가 갈리지 않게.
--  - ready=false면 누적값을 믿지 않는다. 기존 유저는 첫 수령 때 ready=false 행이 생기고, 재구성(백필 스크립트
--    또는 칭호 판정 진입 시 자가 복구)이 전체 기록으로 다시 세워 ready=true로 만든다. 기록이 없는 신규 유저는
--    첫 수령부터 ready=true.
--  - 동시성: 반영·재구성 모두 enhance_stats 행 락을 먼저 잡는다. 재구성 중 들어온 수령은 락을 기다렸다가
--    재구성 결과 위에 반영된다(재구성이 못 본 미커밋 로그 = 그 수령 자신).
--  - 반영이 실패해도 강화 수령은 실패하지 않는다 — 예외를 삼키고 그 행을 ready=false로 돌려 다음 판정 때 재구성.
--
-- 순서: 0219 적용 → 코드 배포(resolve.ts가 enhance_stats_apply를 부른다 — 함수가 없으면 수령이 실패하므로
-- 반드시 먼저 적용) → scripts/enhance-stats-backfill.ts --apply.
begin;

create table if not exists enhance_stats (
  user_id uuid not null references profiles(id) on delete cascade,
  server_id smallint not null,
  ready boolean not null default false,
  -- 횟수
  total int not null default 0,
  ok int not null default 0,          -- success + mega
  mega int not null default 0,
  down int not null default 0,
  down9 int not null default 0,       -- 끝자리 9에서 하락
  cliff int not null default 0,       -- +199에서 하락
  crown int not null default 0,       -- 대성공으로 +100 도달
  owl int not null default 0,         -- KST 3~4시
  early int not null default 0,       -- KST 5~6시
  weekend int not null default 0,     -- 토·일
  friday int not null default 0,      -- 금 20시 이후
  monday_down int not null default 0, -- 월요일 하락
  evening int not null default 0,     -- 18~20시
  lunch int not null default 0,       -- 12시
  five_min int not null default 0,    -- 실대기 5분 이내
  aging int not null default 0,       -- 만기 후 1일 이상 방치
  carefree int not null default 0,    -- 만기 후 7일 이상 방치
  lightning int not null default 0,   -- 1분 이내 + 보석 단축
  -- 최장 연속(같은 결과끼리 — 성공과 대성공은 서로 끊는다)
  last_result enhance_result,
  cur_run int not null default 0,
  succ_run_max int not null default 0,
  mega_run_max int not null default 0,
  down_run_max int not null default 0,
  hold_run_max int not null default 0,
  nodown_run int not null default 0,  -- 끝에서부터 하락 없는 연속(최근 20회 무하락)
  -- 하락 직후 10연속 성공(성공·대성공 합산 연속)
  ok_run int not null default 0,
  ok_after_down boolean not null default false,
  phoenix_ok boolean not null default false,
  -- 일 단위(KST)
  cur_day date,
  day_cnt int not null default 0,
  day_night_cnt int not null default 0,  -- 오늘 0~5시 강화 수
  day_all_night boolean not null default false, -- 오늘 강화가 전부 0~5시
  day_has9 boolean not null default false,
  day_has18 boolean not null default false,
  day_max int not null default 0,
  night_day_max int not null default 0,
  insomnia_closed int not null default 0, -- 지난날 중 전부 0~5시였던 날 수(오늘 제외)
  commuter_closed int not null default 0, -- 지난날 중 9시·18시 둘 다 있던 날 수(오늘 제외)
  day_run int not null default 0,
  day_run_max int not null default 0,
  -- 최초 +100
  first100_at timestamptz,
  beginner_ok boolean not null default false, -- 최초 +100 이후 +1에서 시작한 강화
  last_log_id bigint,
  updated_at timestamptz not null default now(),
  primary key (user_id, server_id)
);
alter table enhance_stats enable row level security;

-- 장비는 FK를 걸지 않는다 — enhancement_logs도 장비 FK가 없어 지워진 장비의 기록이 남을 수 있다.
create table if not exists enhance_equip_stats (
  user_equipment_id bigint primary key,
  user_id uuid not null,
  server_id smallint not null,
  log_cnt int not null default 0,
  down_pre100 int not null default 0,  -- 최초 +100 이전 하락 수
  reached50_at timestamptz,
  reached100_at timestamptz,
  down199 boolean not null default false,
  seen90 boolean not null default false,       -- +90 도달(마지막 +90 이후를 본다)
  down_since90 boolean not null default false, -- 마지막 +90 이후 하락
  seven_falls_ok boolean not null default false,
  reinc_ok boolean not null default false,
  flawless_ok boolean not null default false
);
create index if not exists enhance_equip_stats_user_idx on enhance_equip_stats (user_id, server_id);
alter table enhance_equip_stats enable row level security;

-- ── 빈 상태 ──
create or replace function enhance_stats_init(p_user uuid, p_server smallint)
returns enhance_stats language plpgsql immutable as $$
declare s enhance_stats;
begin
  s.user_id := p_user; s.server_id := p_server; s.ready := false;
  s.total := 0; s.ok := 0; s.mega := 0; s.down := 0; s.down9 := 0; s.cliff := 0; s.crown := 0;
  s.owl := 0; s.early := 0; s.weekend := 0; s.friday := 0; s.monday_down := 0; s.evening := 0; s.lunch := 0;
  s.five_min := 0; s.aging := 0; s.carefree := 0; s.lightning := 0;
  s.last_result := null; s.cur_run := 0;
  s.succ_run_max := 0; s.mega_run_max := 0; s.down_run_max := 0; s.hold_run_max := 0; s.nodown_run := 0;
  s.ok_run := 0; s.ok_after_down := false; s.phoenix_ok := false;
  s.cur_day := null; s.day_cnt := 0; s.day_night_cnt := 0; s.day_all_night := false;
  s.day_has9 := false; s.day_has18 := false; s.day_max := 0; s.night_day_max := 0;
  s.insomnia_closed := 0; s.commuter_closed := 0; s.day_run := 0; s.day_run_max := 0;
  s.first100_at := null; s.beginner_ok := false; s.last_log_id := null; s.updated_at := null; -- 저장 시 now()
  return s;
end $$;

create or replace function enhance_equip_init(p_ueid bigint, p_user uuid, p_server smallint)
returns enhance_equip_stats language plpgsql immutable as $$
declare e enhance_equip_stats;
begin
  e.user_equipment_id := p_ueid; e.user_id := p_user; e.server_id := p_server;
  e.log_cnt := 0; e.down_pre100 := 0; e.reached50_at := null; e.reached100_at := null;
  e.down199 := false; e.seen90 := false; e.down_since90 := false;
  e.seven_falls_ok := false; e.reinc_ok := false; e.flawless_ok := false;
  return e;
end $$;

-- ── 로그 한 건 반영(유저) — 판정 쿼리였던 것의 정의를 그대로 옮긴다(judge.ts 옛 collectMetrics). ──
create or replace function enhance_stats_next(
  s enhance_stats, p_result enhance_result, p_from int, p_to int,
  p_elapsed bigint, p_reduced bigint, p_overdue bigint, p_at timestamptz
) returns enhance_stats language plpgsql stable as $$
declare
  lt timestamp := p_at at time zone 'Asia/Seoul';
  h int := extract(hour from lt)::int;
  dow int := extract(isodow from lt)::int;
  d date := lt::date;
  is_ok boolean := p_result in ('success', 'mega');
  is_down boolean := p_result = 'down';
  prev_first100 timestamptz := s.first100_at;
begin
  -- 횟수
  s.total := s.total + 1;
  if is_ok then s.ok := s.ok + 1; end if;
  if p_result = 'mega' then
    s.mega := s.mega + 1;
    if p_to = 100 then s.crown := s.crown + 1; end if;
  end if;
  if is_down then
    s.down := s.down + 1;
    if p_from % 10 = 9 then s.down9 := s.down9 + 1; end if;
    if p_from = 199 then s.cliff := s.cliff + 1; end if;
    if dow = 1 then s.monday_down := s.monday_down + 1; end if;
  end if;
  if h between 3 and 4 then s.owl := s.owl + 1; end if;
  if h between 5 and 6 then s.early := s.early + 1; end if;
  if dow in (6, 7) then s.weekend := s.weekend + 1; end if;
  if dow = 5 and h >= 20 then s.friday := s.friday + 1; end if;
  if h between 18 and 20 then s.evening := s.evening + 1; end if;
  if h = 12 then s.lunch := s.lunch + 1; end if;
  if p_elapsed <= 300000 then s.five_min := s.five_min + 1; end if;
  if coalesce(p_overdue, 0) >= 86400000 then s.aging := s.aging + 1; end if;
  if coalesce(p_overdue, 0) >= 604800000 then s.carefree := s.carefree + 1; end if;
  if p_elapsed <= 60000 and p_reduced > 0 then s.lightning := s.lightning + 1; end if;

  -- 같은 결과 최장 연속
  if s.last_result is not distinct from p_result then s.cur_run := s.cur_run + 1; else s.cur_run := 1; end if;
  case p_result
    when 'success' then s.succ_run_max := greatest(s.succ_run_max, s.cur_run);
    when 'mega' then s.mega_run_max := greatest(s.mega_run_max, s.cur_run);
    when 'down' then s.down_run_max := greatest(s.down_run_max, s.cur_run);
    else s.hold_run_max := greatest(s.hold_run_max, s.cur_run);
  end case;
  -- 하락 직후 성공 연속(성공·대성공 합산)
  if is_ok then
    if s.last_result in ('success', 'mega') then
      s.ok_run := s.ok_run + 1;
    else
      s.ok_run := 1;
      s.ok_after_down := coalesce(s.last_result = 'down', false);
    end if;
    if s.ok_after_down and s.ok_run >= 10 then s.phoenix_ok := true; end if;
  else
    s.ok_run := 0;
    s.ok_after_down := false;
  end if;
  s.nodown_run := case when is_down then 0 else s.nodown_run + 1 end;
  s.last_result := p_result;

  -- 일 단위. 날짜가 앞서는 로그(자정 경계 동시 수령)는 오늘 칸에 합친다.
  if s.cur_day is null or d > s.cur_day then
    if s.cur_day is not null then
      if s.day_all_night then s.insomnia_closed := s.insomnia_closed + 1; end if;
      if s.day_has9 and s.day_has18 then s.commuter_closed := s.commuter_closed + 1; end if;
      s.day_run := case when d = s.cur_day + 1 then s.day_run + 1 else 1 end;
    else
      s.day_run := 1;
    end if;
    s.cur_day := d;
    s.day_cnt := 1;
    s.day_night_cnt := case when h < 6 then 1 else 0 end;
    s.day_all_night := h < 6;
    s.day_has9 := h = 9;
    s.day_has18 := h = 18;
  else
    s.day_cnt := s.day_cnt + 1;
    if h < 6 then s.day_night_cnt := s.day_night_cnt + 1; end if;
    s.day_all_night := s.day_all_night and h < 6;
    s.day_has9 := s.day_has9 or h = 9;
    s.day_has18 := s.day_has18 or h = 18;
  end if;
  s.day_max := greatest(s.day_max, s.day_cnt);
  s.night_day_max := greatest(s.night_day_max, s.day_night_cnt);
  s.day_run_max := greatest(s.day_run_max, s.day_run);

  -- 최초 +100 · 초심(+100 이후 +1에서 시작)
  if prev_first100 is not null and p_from = 1 and p_at > prev_first100 then s.beginner_ok := true; end if;
  if prev_first100 is null and p_to >= 100 then s.first100_at := p_at; end if;
  return s;
end $$;

-- ── 로그 한 건 반영(장비) ──
create or replace function enhance_equip_next(
  e enhance_equip_stats, p_result enhance_result, p_from int, p_to int, p_at timestamptz
) returns enhance_equip_stats language plpgsql immutable as $$
declare is_down boolean := p_result = 'down';
begin
  e.log_cnt := e.log_cnt + 1;
  if is_down and e.reached100_at is null then e.down_pre100 := e.down_pre100 + 1; end if;
  if e.reached100_at is null and p_to >= 100 then
    -- 칠전팔기 = 최초 +100 이전 하락 7회 · 무하락 = 마지막 +90부터 최초 +100까지 하락 없음
    if e.down_pre100 >= 7 then e.seven_falls_ok := true; end if;
    if e.seen90 and not e.down_since90 then e.flawless_ok := true; end if;
    e.reached100_at := p_at;
  end if;
  -- 환생 = +199에서 하락한 그 장비가 뒤에 +200 도달
  if e.down199 and p_to >= 200 then e.reinc_ok := true; end if;
  if is_down and p_from = 199 then e.down199 := true; end if;
  if e.reached50_at is null and p_to >= 50 then e.reached50_at := p_at; end if;
  if p_to = 90 then
    e.seen90 := true;
    e.down_since90 := is_down;
  elsif is_down then
    e.down_since90 := true;
  end if;
  return e;
end $$;

-- ── 저장 ──
create or replace function enhance_stats_save(s enhance_stats) returns void language plpgsql as $$
begin
  update enhance_stats t set
    ready = s.ready, total = s.total, ok = s.ok, mega = s.mega, down = s.down, down9 = s.down9,
    cliff = s.cliff, crown = s.crown, owl = s.owl, early = s.early, weekend = s.weekend, friday = s.friday,
    monday_down = s.monday_down, evening = s.evening, lunch = s.lunch, five_min = s.five_min,
    aging = s.aging, carefree = s.carefree, lightning = s.lightning,
    last_result = s.last_result, cur_run = s.cur_run, succ_run_max = s.succ_run_max,
    mega_run_max = s.mega_run_max, down_run_max = s.down_run_max, hold_run_max = s.hold_run_max,
    nodown_run = s.nodown_run, ok_run = s.ok_run, ok_after_down = s.ok_after_down, phoenix_ok = s.phoenix_ok,
    cur_day = s.cur_day, day_cnt = s.day_cnt, day_night_cnt = s.day_night_cnt, day_all_night = s.day_all_night,
    day_has9 = s.day_has9, day_has18 = s.day_has18, day_max = s.day_max, night_day_max = s.night_day_max,
    insomnia_closed = s.insomnia_closed, commuter_closed = s.commuter_closed,
    day_run = s.day_run, day_run_max = s.day_run_max,
    first100_at = s.first100_at, beginner_ok = s.beginner_ok, last_log_id = s.last_log_id,
    updated_at = now()
  where t.user_id = s.user_id and t.server_id = s.server_id;
end $$;

create or replace function enhance_equip_save(e enhance_equip_stats) returns void language plpgsql as $$
begin
  insert into enhance_equip_stats values (e.*)
  on conflict (user_equipment_id) do update set
    user_id = excluded.user_id, server_id = excluded.server_id, log_cnt = excluded.log_cnt,
    down_pre100 = excluded.down_pre100, reached50_at = excluded.reached50_at,
    reached100_at = excluded.reached100_at, down199 = excluded.down199, seen90 = excluded.seen90,
    down_since90 = excluded.down_since90, seven_falls_ok = excluded.seven_falls_ok,
    reinc_ok = excluded.reinc_ok, flawless_ok = excluded.flawless_ok;
end $$;

-- ── 수령 시 반영(resolve.ts RT2가 로그 insert와 같은 문장에서 부른다) ──
-- p_log_id = 이 수령이 방금 넣은 로그. 같은 문장의 insert가 보일지 보이지 않을지에 기대지 않으려고
-- "다른 로그가 있는가"를 이 id를 빼고 본다.
create or replace function enhance_stats_apply(
  p_user uuid, p_server smallint, p_ueid bigint, p_log_id bigint, p_result enhance_result,
  p_from int, p_to int, p_elapsed bigint, p_reduced bigint, p_overdue bigint, p_at timestamptz
) returns boolean language plpgsql as $$
declare
  s enhance_stats;
  e enhance_equip_stats;
begin
  begin
    select * into s from enhance_stats where user_id = p_user and server_id = p_server for update;
    if not found then
      insert into enhance_stats (user_id, server_id, ready)
      values (p_user, p_server, not exists(
        select 1 from enhancement_logs where user_id = p_user and server_id = p_server and id <> p_log_id))
      on conflict (user_id, server_id) do nothing;
      select * into s from enhance_stats where user_id = p_user and server_id = p_server for update;
    end if;
    if not s.ready then return false; end if; -- 재구성 전 — 재구성이 이 로그까지 센다

    s := enhance_stats_next(s, p_result, p_from, p_to, p_elapsed, p_reduced, p_overdue, p_at);
    s.last_log_id := p_log_id;
    perform enhance_stats_save(s);

    select * into e from enhance_equip_stats where user_equipment_id = p_ueid for update;
    if not found then e := enhance_equip_init(p_ueid, p_user, p_server); end if;
    e := enhance_equip_next(e, p_result, p_from, p_to, p_at);
    perform enhance_equip_save(e);
    return true;
  exception when others then
    -- 강화 수령을 막지 않는다. 누적이 한 건 빠졌을 수 있으니 재구성 대상으로 돌린다.
    raise warning 'enhance_stats_apply failed user=% log=%: %', p_user, p_log_id, sqlerrm;
  end;
  begin
    update enhance_stats set ready = false where user_id = p_user and server_id = p_server;
  exception when others then
    null;
  end;
  return false;
end $$;

-- ── 전체 기록으로 재구성(백필·자가 복구). p_upto_id는 검증용(그 id까지만 센다). 반환 = 센 로그 수. ──
create or replace function enhance_stats_rebuild(p_user uuid, p_server smallint, p_upto_id bigint default null)
returns int language plpgsql as $$
declare
  s enhance_stats;
  e enhance_equip_stats;
  r record;
  cur_ue bigint := null;
  n int := 0;
begin
  -- 행 락을 먼저 잡는다 — 이 동안 들어오는 수령은 기다렸다가 재구성 결과 위에 반영된다.
  insert into enhance_stats (user_id, server_id, ready) values (p_user, p_server, false)
  on conflict (user_id, server_id) do update set ready = false;

  s := enhance_stats_init(p_user, p_server);
  for r in
    select id, result, from_level, to_level, elapsed_ms, reduced_ms, overdue_ms, created_at
    from enhancement_logs
    where user_id = p_user and server_id = p_server and (p_upto_id is null or id <= p_upto_id)
    order by id
  loop
    s := enhance_stats_next(s, r.result, r.from_level, r.to_level, r.elapsed_ms, r.reduced_ms, r.overdue_ms, r.created_at);
    s.last_log_id := r.id;
    n := n + 1;
  end loop;
  s.ready := true;
  perform enhance_stats_save(s);

  delete from enhance_equip_stats where user_id = p_user and server_id = p_server;
  for r in
    select user_equipment_id as ueid, result, from_level, to_level, created_at
    from enhancement_logs
    where user_id = p_user and server_id = p_server and (p_upto_id is null or id <= p_upto_id)
    order by user_equipment_id, id
  loop
    if cur_ue is distinct from r.ueid then
      if cur_ue is not null then perform enhance_equip_save(e); end if;
      e := enhance_equip_init(r.ueid, p_user, p_server);
      cur_ue := r.ueid;
    end if;
    e := enhance_equip_next(e, r.result, r.from_level, r.to_level, r.created_at);
  end loop;
  if cur_ue is not null then perform enhance_equip_save(e); end if;
  return n;
end $$;

-- 외부 API(RPC)로 부를 이유가 없다 — 앱은 서버 롤로만 부른다.
revoke execute on function enhance_stats_init(uuid, smallint) from public, anon, authenticated;
revoke execute on function enhance_equip_init(bigint, uuid, smallint) from public, anon, authenticated;
revoke execute on function enhance_stats_next(enhance_stats, enhance_result, int, int, bigint, bigint, bigint, timestamptz) from public, anon, authenticated;
revoke execute on function enhance_equip_next(enhance_equip_stats, enhance_result, int, int, timestamptz) from public, anon, authenticated;
revoke execute on function enhance_stats_save(enhance_stats) from public, anon, authenticated;
revoke execute on function enhance_equip_save(enhance_equip_stats) from public, anon, authenticated;
revoke execute on function enhance_stats_apply(uuid, smallint, bigint, bigint, enhance_result, int, int, bigint, bigint, bigint, timestamptz) from public, anon, authenticated;
revoke execute on function enhance_stats_rebuild(uuid, smallint, bigint) from public, anon, authenticated;

commit;
