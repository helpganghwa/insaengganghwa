-- 0174 익명 초대 코드 (2026-08-26)
-- 친구 초대 '링크 복사'가 공개 코드(/s/<public_code>)를 노출해 링크를 뿌리기 꺼려진다는
-- 피드백 — 링크 복사만 유저를 역추적할 수 없는 별도 코드(/i/<invite_code>)로 분리한다.
-- 카카오톡 공유(자랑 카드·프로필 착지)는 기존 /s 경로 유지.
-- ⚠ 0172·0173은 파견(feat/expedition, 스테이징만 적용)에 예약 — 번호 충돌 방지로 0174 사용.

alter table profiles add column if not exists invite_code text;

-- 백필 — gen_public_code()(0021) 재사용: 같은 알파벳의 8자 랜덤. public_code와 값 공간이
-- 겹쳐도 컬럼이 달라 무관. 유니크 충돌은 8자 랜덤 대비 행 수(수백)라 실질 0 — 실패 시 재실행.
update profiles set invite_code = gen_public_code() where invite_code is null;

alter table profiles alter column invite_code set not null;
alter table profiles alter column invite_code set default gen_public_code();
create unique index if not exists profiles_invite_code_key on profiles (invite_code);
