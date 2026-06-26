-- 0087 mailbox_type enum에 'enhance_result' 추가 (1회 적용, 양쪽 DB 적용 완료)
-- ⚠️ 예약·미사용(inert): 강화 결과 우편 기획은 철회됨(인페이지 토스트 + 완료 푸시로 통지).
-- enum 값은 Postgres에서 제거가 까다로워 inert로 잔존(phaseDiamond 컬럼과 동일 처리).
-- ADD VALUE는 트랜잭션 외부 단일 statement(0009 선례).
alter type mailbox_type add value if not exists 'enhance_result';
