-- 0212 (2026-09-21) RLS deny-all 백스톱 재실행 — 0113의 후속.
--
-- 0113은 "적용 시점의 표"만 덮는다. 그 뒤 표를 만든 마이그레이션 21개가 RLS를 함께 켜지 않아
-- 실서버에 RLS가 꺼진 표가 27개 쌓였다(2026-09-21 조회). 지금도 노출은 없다 — 공개 역할(anon·authenticated)에
-- 표 grant가 하나도 없다. 이 파일은 누군가 실수로 grant를 주는 순간을 막는 두 번째 그물을 다시 친다.
--
-- 앱 무영향: 접속 역할 postgres는 전 표의 소유자이고 bypassrls라 RLS를 우회한다(0113과 같은 근거).
--
-- ⚠ **history_reader는 우회하지 못한다**(스테이징 역사 위키가 실서버를 읽는 읽기 전용 역할, bypassrls 아님).
--   그 역할이 읽는 표에 정책 없이 RLS만 켜면 0행이 된다. 기존 8개 표는 `history_reader_select` 정책으로 읽고
--   있고, 0202가 만든 history_era_summaries만 grant뿐이었다 → **정책을 먼저 만들고** RLS를 켠다.
--   역할이 없는 DB(스테이징 자체)는 정책 단계를 건너뛴다.
--
-- ⚠ 접속자가 있는 DB에는 이 파일을 **그대로 돌리지 말 것** — 한 트랜잭션에서 표마다 ACCESS EXCLUSIVE를 잡고
--   커밋까지 들고 있어, 앱 트랜잭션과 잠금 순서가 엇갈리면 멈춤·교착이 날 수 있다. 실서버는 같은 내용을
--   표 하나씩(각자 커밋, lock_timeout) 적용한 뒤, 이 파일을 돌려 원장만 남긴다(그때는 할 일이 없어 잠금도 없다).
-- 멱등 — RLS가 꺼진 표·정책이 없는 표만 건드린다.
-- ⚠ 앞으로 새 표를 만드는 manual 파일은 그 표에 `enable row level security`를 함께 넣을 것(0113 규칙).

-- 1) history_reader가 읽는 표 중 정책이 없는 곳에 읽기 정책.
do $$
declare t record;
begin
  if exists (select 1 from pg_roles where rolname = 'history_reader') then
    for t in
      select c.relname
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'
         and has_table_privilege('history_reader', c.oid, 'select')
         and not exists (select 1 from pg_policies p
                          where p.schemaname = 'public' and p.tablename = c.relname
                            and p.policyname = 'history_reader_select')
    loop
      execute format('create policy history_reader_select on public.%I for select to history_reader using (true)', t.relname);
    end loop;
  end if;
end $$;

-- 2) RLS가 꺼진 표만 켠다.
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' and not rowsecurity
  loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;
