-- 0135 구역명 개명 — temple 지역의 구역 '잊힌 신전'이 지역명과 동일해 연대기 마커 검증 실패·
-- LLM 혼동을 유발. 구역명을 '설원 신전'으로 변경(지역명 '잊힌 신전'은 유지). 전 서버 대상.
update zones set name = '설원 신전' where region = 'temple' and name = '잊힌 신전';
