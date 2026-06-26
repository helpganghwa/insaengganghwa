-- 0087 mailbox_type enum에 'enhance_result' 추가 (1회 적용)
-- 강화 큐 (B) cron 자동정산분(24h+ 방치)의 결과를 우편으로 통지(GDD §3.10). lazy 정산은
-- 페이지 토스트로 충분하므로 우편 없음. 정보성 우편(보상 payload 없음, profile_accepted 패턴).
-- ADD VALUE는 트랜잭션 외부에서 단일 statement(0009 선례).
alter type mailbox_type add value if not exists 'enhance_result';
