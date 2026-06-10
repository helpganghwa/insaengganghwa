-- 0047 세계 연대기 구조 변경 — '전체'를 롤링 통합서사 → 날짜별 핵심사건 리스트로.
--   full_narrative(롤링 서사) 폐기 → headline(그날 핵심 사건 한 줄). today_text(긴 사관 스토리)는 유지.
--   큰 사건 있는 날만 1행(별일 없으면 행 없음 = cron이 skip). 멱등.

alter table world_chronicle rename column full_narrative to headline;
