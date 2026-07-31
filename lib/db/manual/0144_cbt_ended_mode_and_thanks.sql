-- 0144: CBT 종료 모드 + 감사 보상 이월(2026-07-31)
--
-- ① system_mode에 'cbt_ended' 추가 — CBT 종료(8/1 00:30)부터 정식 오픈까지의 상태.
--    maintenance와 달리 admin + 심사(cbt) 계정은 통과한다(카드사 심사 결제 테스트 지속).
--    일반 유저는 레이아웃에서 로그아웃 처리되고 로그인 화면이 종료 안내로 바뀐다.
-- ② cbt_carryover: 아바타 이월 기획 삭제(사용자 결정 2026-07-31 — 아바타는 초기화),
--    대신 감사 보상(합산강화 비례 다이아) 필드 추가. 수식은 스냅샷 시점에 확정 저장.
alter type system_mode_value add value if not exists 'cbt_ended';

alter table cbt_carryover drop column if exists avatars;
alter table cbt_carryover add column if not exists total_enhance integer not null default 0;
alter table cbt_carryover add column if not exists thanks_diamond integer not null default 0;
