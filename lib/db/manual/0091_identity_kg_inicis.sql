-- 본인인증 provider에 KG이니시스 통합인증('kg_inicis') 추가.
-- 포트원 V2 본인인증(KG이니시스 통합인증 채널) 결과를 identity_verifications.provider에 기록.
-- ⚠ ADD VALUE는 트랜잭션 밖에서 실행(수동 적용). IF NOT EXISTS로 재적용 안전.
ALTER TYPE identity_provider ADD VALUE IF NOT EXISTS 'kg_inicis';
