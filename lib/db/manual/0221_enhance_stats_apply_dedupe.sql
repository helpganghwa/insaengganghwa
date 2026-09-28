-- 0221: 강화 누적 반영 중복 방지(2026-09-28).
--
-- 0219 첫 배포판(09:42)은 수령 코드가 enhance_stats_apply를 직접 부른다. 0220 트리거가 들어간 뒤에도 그 배포판을
-- 열어 둔 화면(Vercel 버전 어긋남 보호)의 수령은 코드 호출 + 트리거로 같은 기록이 두 번 반영됐다(백필 뒤 1명 +5 확인).
-- 두 호출은 같은 문장 안에서 행 락을 쥔 채 연달아 일어나므로 "직전에 반영한 기록 = 이 기록"이면 건너뛴다.
-- 동시 수령의 순서 역전(낮은 id가 뒤에 반영)과 부딪히지 않게 대소가 아니라 같은지만 본다.
begin;

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
    -- 같은 기록을 연달아 두 번 받으면 두 번째는 무시(0221). 0219 첫 배포판의 수령 코드 호출 + 0220 트리거가
    -- 같은 문장 안에서 행 락을 쥔 채 연달아 부르므로, 직전 반영 기록과 같은지만 보면 된다.
    if s.last_log_id = p_log_id then return true; end if;

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
revoke execute on function enhance_stats_apply(uuid, smallint, bigint, bigint, enhance_result, int, int, bigint, bigint, bigint, timestamptz) from public, anon, authenticated;

commit;
