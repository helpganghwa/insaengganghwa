-- generate_korean_nickname() 함수 제거(2026-07-03).
-- 자동 닉네임은 앱 코드에서 '대장장이'+4자리(8자)를 로컬 생성한다 — DB 함수 경유 없음.
-- (함수 반환 10자가 앱 상한 8자와 불일치해 항상 거절 후 fallback으로만 동작하던 죽은 경로.)
DROP FUNCTION IF EXISTS public.generate_korean_nickname();
