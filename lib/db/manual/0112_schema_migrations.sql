-- 0112: manual SQL 마이그레이션 원장.
-- "이 DB에 어떤 manual 파일이 적용됐는가"를 쿼리 가능하게 한다. drizzle-kit migrate/push는
-- 폐기(진실원천=lib/db/manual)라 이 원장이 유일한 상태 추적 수단. apply-migration·db-rebuild가
-- 적용과 같은 트랜잭션에서 filename+checksum(sha256)을 기록. checksum으로 적용 후 파일 편집(drift) 감지.
create table if not exists schema_migrations (
  filename   text primary key,
  checksum   text,               -- sha256(파일 본문). 레거시 백필분은 null 허용.
  applied_at timestamptz not null default now()
);

comment on table schema_migrations is 'manual SQL 적용 이력(filename/checksum). apply-migration·db-rebuild가 기록, migration-status가 pending/drift 검사.';
