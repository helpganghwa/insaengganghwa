-- 0114: 본인인증 replay 방지 — identity_verification_id 저장 + 전역 UNIQUE
-- 문제(보안감사 S1): verifyAndStoreIdentity가 클라 전달 identityVerificationId로 포트원
-- 재조회해 VERIFIED·생년만 확인하고 그 인증 ID를 저장하지 않아, 성인 1명의 인증 ID를
-- 여러 미성년 계정이 재사용해 is_adult=true를 얻어 미성년 월한도(₩70,000)를 우회할 수 있었다.
-- 해결: 인증 ID를 저장하고 전역 UNIQUE로 1회용 소비(재사용 시 insert 실패 → 앱이 거부).
-- 같은 사람이 정상 재인증하면 포트원이 매번 새 ID를 발급하므로 정상 흐름엔 영향 없다.
alter table public.identity_verifications
  add column if not exists identity_verification_id text;

-- 부분 UNIQUE — 기존 행(ID 미기록=null)은 replay 대상이 아니라 제약에서 제외, 신규만 강제.
create unique index if not exists identity_verifications_ivid_uq
  on public.identity_verifications (identity_verification_id)
  where identity_verification_id is not null;
