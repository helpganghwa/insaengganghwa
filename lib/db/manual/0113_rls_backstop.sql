-- 0113: RLS deny-all 백스톱(심층방어).
-- 현재 노출은 없다(anon/authenticated에 테이블 grant 0 → PostgREST 전부 permission denied).
-- 그러나 미래에 누군가 실수로 `GRANT ... TO anon`을 하면 그 순간 데이터가 열린다. 이를 막는 최후 그물로
-- 전 public 테이블에 RLS를 켠다(정책 없음 = 비특권 롤 deny-all).
--
-- 앱 무영향: 런타임 연결 롤 postgres는 rolbypassrls=true + 전 테이블 소유자라 RLS를 우회한다(검증됨).
-- FORCE 미사용(불필요) — anon/authenticated만 차단하면 충분.
-- 멱등: 이미 켜진 테이블에 재실행해도 no-op.
-- ⚠ 앞으로 새 테이블을 만드는 manual 파일은 해당 테이블에도 enable row level security를 함께 넣을 것
--    (이 백스톱은 적용 시점의 테이블만 커버 — grant 모델이 신규 테이블도 보호하지만 RLS는 별도).
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;
