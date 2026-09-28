-- 0220: 강화 누적 반영을 트리거로(2026-09-28) — 0219의 반영을 앱 코드에서 DB로 옮긴다.
--
-- 0219 배포 뒤 확인: Vercel은 이미 열려 있던 화면의 요청을 옛 배포로 계속 보낸다(버전 어긋남 보호). 옛 배포의
-- 수령 코드는 enhance_stats_apply를 부르지 않아, 누적 행이 ready가 된 뒤 옛 화면에서 들어온 수령이 누적에서
-- 빠진다. 트리거는 어느 배포가 기록을 넣든 같은 문장 안에서 반영하므로 이 틈이 없다.
--  - resolve.ts의 호출은 함께 뺀다(둘 다 있으면 두 번 센다). 적용 시점에 ready 행이 없으면(백필 전) 순서 무관.
--  - after insert for each row — 수령 문장이 끝날 때 로그 한 건마다 반영(락 순서는 0219와 같다: 잡·장비 → 누적 행).
begin;

create or replace function enhancement_logs_stats_trg() returns trigger language plpgsql as $$
begin
  perform enhance_stats_apply(new.user_id, new.server_id, new.user_equipment_id, new.id, new.result,
    new.from_level, new.to_level, new.elapsed_ms, new.reduced_ms, new.overdue_ms, new.created_at);
  return null;
end $$;
revoke execute on function enhancement_logs_stats_trg() from public, anon, authenticated;

drop trigger if exists enhancement_logs_stats on enhancement_logs;
create trigger enhancement_logs_stats after insert on enhancement_logs
  for each row execute function enhancement_logs_stats_trg();

commit;
