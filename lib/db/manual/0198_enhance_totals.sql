-- 0198: 누적 강화 통계 스냅샷 (2026-09-12)
--
-- /login·/u 프로필의 "지금 인생강화에서" 카드가 enhancement_logs를 통째로 집계해 왔다.
-- 실측(pg_stat_statements 81일): 95,625회 · 평균 57.6ms · 전체 DB 실행시간의 15.8%로
-- 단일 1위. 테이블은 207MB / 746,222행이라 앞으로도 계속 커진다. 값 자체는 사회적 증거라
-- 분 단위 정밀도가 필요 없으므로 한 행짜리 표에 담고 크론이 10분마다 채운다.
--
-- unstable_cache(10분)가 이미 앞에 있는데도 호출이 하루 1,180회인 이유: 데이터 캐시가
-- 인스턴스·배포 단위로 갈려 기대치(하루 144회)의 8배가 실제로 DB까지 내려왔다. 표에 두면
-- 읽기가 단일 행 select라 캐시가 빗나가도 비용이 없다.
create table if not exists enhance_totals (
  -- 한 행만 존재 — 전역 누적이라 키가 필요 없다.
  id smallint primary key default 1 check (id = 1),
  success bigint not null,
  hold bigint not null,
  down bigint not null,
  computed_at timestamptz not null default now()
);
