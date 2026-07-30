-- 0143: 본인인증에서 검증된 휴대폰 번호 저장(2026-07-31)
--
-- 이니시스 V2 일반결제는 customer.phoneNumber가 필수인데 유저 전화번호를 수집하지 않아
-- 사업자 연락처를 고정 전달 중. 본인인증(포트원 통합인증) 응답의 verifiedCustomer.phoneNumber를
-- 저장해 인증 유저는 본인 번호로 결제하게 한다.
--
-- 저장 위치가 identity_verifications(5년 법정 보존 원장)가 아니라 profiles인 이유:
-- 전화번호는 법정 보존 항목이 아니라 "탈퇴 시 지체 없이 파기" 대상 — profiles의
-- birth_year_hash·is_adult와 같은 라이프사이클(탈퇴 시 null 클리어)을 따른다.
alter table profiles add column if not exists verified_phone text;
