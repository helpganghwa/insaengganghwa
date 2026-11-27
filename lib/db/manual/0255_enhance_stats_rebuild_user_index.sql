-- 0255 (2026-11-27) 강화 누적 재구성이 유저 인덱스를 타게 — 렉 핫픽스.
--
-- 증상: 칭호 판정 진입 때 누적 행이 없는 유저(강화 기록 0건 신규·미강화 유저 포함)마다 enhance_stats_rebuild가
--   44~62초 걸렸다(11-27 13:51~14:07 12분에 5회). 그동안 풀러 연결 하나를 쥐고 디스크를 읽어, 연결 15개를 나눠 쓰던
--   풀러 앞에 줄이 서고 같은 연결에 파이프라인된 다른 요청까지 막혔다(60초 시간 초과의 한 원인).
-- 원인: `select max(id) ... where user_id = ? and server_id = ?`를 플래너가 min/max 최적화로 pkey 역방향 스캔 + 필터로
--   바꾼다. 유저 기록이 없거나 오래전이면 500만 행을 끝까지 훑는다. 루프·count도 일반화 계획에서 같은 위험이 있다.
-- 수정: 유저 조건 조회를 `offset 0` 하위 쿼리로 감싸 유저 인덱스(enh_logs_user_created_idx)를 먼저 타게 한다.
--   계산 순서·결과는 0219와 같다(정렬은 바깥에서 id / user_equipment_id,id로 그대로).
-- 바뀌는 것은 함수 본문뿐 — 데이터·스키마 변경 없음. 코드 배포와 순서 무관.
begin;
set local lock_timeout = '3s';

create or replace function enhance_stats_rebuild(p_user uuid, p_server smallint, p_upto_id bigint default null)
returns int language plpgsql as $$
declare
  s enhance_stats;
  e enhance_equip_stats;
  r record;
  cur_ue bigint;
  n int;
  m bigint;
  seen int;
  locked boolean := false;
begin
  perform pg_advisory_xact_lock(hashtext('enhance_stats_rebuild'), hashtext(p_user::text || ':' || p_server::text));
  if p_upto_id is null and exists(
    select 1 from enhance_stats where user_id = p_user and server_id = p_server and ready) then
    return 0; -- 앞선 재구성이 끝냈다
  end if;

  loop
    -- offset 0: max(id)를 pkey 역방향 스캔으로 바꾸지 못하게 막는 울타리(0255).
    select max(x.id) into m from (
      select id from enhancement_logs
      where user_id = p_user and server_id = p_server and (p_upto_id is null or id <= p_upto_id)
      offset 0
    ) x;
    m := coalesce(m, 0);

    s := enhance_stats_init(p_user, p_server);
    n := 0;
    for r in
      select * from (
        select id, result, from_level, to_level, elapsed_ms, reduced_ms, overdue_ms, created_at
        from enhancement_logs
        where user_id = p_user and server_id = p_server and id <= m
        offset 0
      ) x
      order by x.id
    loop
      s := enhance_stats_next(s, r.result, r.from_level, r.to_level, r.elapsed_ms, r.reduced_ms, r.overdue_ms, r.created_at);
      s.last_log_id := r.id;
      n := n + 1;
    end loop;

    delete from enhance_equip_stats where user_id = p_user and server_id = p_server;
    cur_ue := null;
    for r in
      select ueid, result, from_level, to_level, created_at from (
        select id, user_equipment_id as ueid, result, from_level, to_level, created_at
        from enhancement_logs
        where user_id = p_user and server_id = p_server and id <= m
        offset 0
      ) x
      order by x.ueid, x.id
    loop
      if cur_ue is distinct from r.ueid then
        if cur_ue is not null then perform enhance_equip_save(e); end if;
        e := enhance_equip_init(r.ueid, p_user, p_server);
        cur_ue := r.ueid;
      end if;
      e := enhance_equip_next(e, r.result, r.from_level, r.to_level, r.created_at);
    end loop;
    if cur_ue is not null then perform enhance_equip_save(e); end if;

    if not locked then
      insert into enhance_stats (user_id, server_id, ready) values (p_user, p_server, false)
      on conflict (user_id, server_id) do nothing;
      perform 1 from enhance_stats where user_id = p_user and server_id = p_server for update;
      locked := true;
    end if;
    select count(*) into seen from (
      select 1 from enhancement_logs
      where user_id = p_user and server_id = p_server and id <= m
      offset 0
    ) x;
    exit when seen = n;
  end loop;

  -- ② 락을 쥔 뒤: ① 이후 커밋된 기록을 이어 센다(수령 경로와 같은 순서·같은 함수). id > m은 표 끝 몇 건이라 pkey가 맞다.
  for r in
    select id, user_equipment_id as ueid, result, from_level, to_level, elapsed_ms, reduced_ms, overdue_ms, created_at
    from enhancement_logs
    where user_id = p_user and server_id = p_server and id > m and (p_upto_id is null or id <= p_upto_id)
    order by id
  loop
    s := enhance_stats_next(s, r.result, r.from_level, r.to_level, r.elapsed_ms, r.reduced_ms, r.overdue_ms, r.created_at);
    s.last_log_id := r.id;
    n := n + 1;
    select * into e from enhance_equip_stats where user_equipment_id = r.ueid;
    if not found then e := enhance_equip_init(r.ueid, p_user, p_server); end if;
    e := enhance_equip_next(e, r.result, r.from_level, r.to_level, r.created_at);
    perform enhance_equip_save(e);
  end loop;

  s.ready := true;
  perform enhance_stats_save(s);
  return n;
end $$;
revoke execute on function enhance_stats_rebuild(uuid, smallint, bigint) from public, anon, authenticated;

commit;
