-- 0009 enhance_result enum에 'mega' 추가 (1회 적용)
-- 2단계 상승 강화(+2). success의 5% 확률.
-- ADD VALUE는 트랜잭션 외부에서 단일 statement.
alter type enhance_result add value if not exists 'mega';
