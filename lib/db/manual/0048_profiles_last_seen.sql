-- 0048 profiles.last_seen_at — 쿠키 게이트 하트비트(2분 스로틀)로 갱신, 길드원·친구 목록 접속 상태 표시용.
--   nullable(과거 유저는 미접속으로 시작). 인덱스 불필요(목록은 유저ID로 batch 조회). 멱등.

alter table profiles add column if not exists last_seen_at timestamptz;
