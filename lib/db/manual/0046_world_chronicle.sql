-- 0046 세계 연대기(AI) — 점령전 전투 종료 후 KST 12:00 발표와 함께 매일 1행 갱신. 멱등.
--   kst_day별 1행. today_text = '오늘' 정세 브리핑, full_narrative = '전체' 통합 서사(그날까지 누적).
--   통합 서사는 롤링: 직전 행의 full_narrative + 그날 점령전 요약을 AI가 이어 써 갱신.

create table if not exists world_chronicle (
  kst_day        date primary key,
  today_text     text not null,
  full_narrative text not null,
  created_at     timestamptz not null default now()
);
