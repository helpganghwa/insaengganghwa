-- 0085_referral_referrer_idx.sql — 추천수 count 인덱스(스케일 감사 C3). 멱등.
-- /me 통합 SQL의 (select count(*) from referral_attributions where referrer_user_id = ?)가
-- 인덱스 없어 누적 가입수에 비례한 seq scan이던 것을 인덱스 레인지 count로.
create index if not exists referral_attr_referrer_idx on referral_attributions (referrer_user_id);
