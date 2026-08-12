-- 유저 단위 조회 인덱스 2종 (2026-08-12 칭호·성능 감사)
--
-- 둘 다 지금은 Seq Scan이다. 행이 적어 티가 안 날 뿐, 접근 경로가 이미 여러 곳이고
-- 출시 규모에서 자란다.
--
-- 1) gem_time_reductions(user_id, server_id)
--    유저당 하루 60행 규모로 이 게임에서 가장 빨리 자라는 테이블인데 인덱스가 pkey(id)와
--    job_id뿐이었다(0147은 삭제 경로용으로 job_id만 붙였다). user_id로 훑는 곳이 6군데다:
--      · 칭호 판정 3곳(누적 단축 시간·일자별 소비·최근 10일 소비)
--      · 오늘의 인생강화 2곳(횟수·소비 합)
--      · 도전과제 상태 1곳
--    여기에 탈퇴의 `delete ... where user_id`도 같은 스캔을 탄다. 0147 주석이 기록한
--    "356,464행을 매번 훑어 20분을 넘겨도 끝나지 않았다"가 정확히 이 형태의 사고였다.
--
-- 2) guild_audit_log(actor_user_id, action, created_at desc)
--    기존 인덱스는 (guild_id, created_at)뿐이라 "이 유저의 길드 이력"은 전부 훑는다.
--    스테이징 1,405행에서 이미 단건 조회 15.7ms — 칭호 판정(귀향·무소속)이 매번 두 번 탄다.
--    created_at desc를 포함해 "마지막 탈퇴 시각"이 인덱스만으로 끝난다.
--
-- 순수 추가 — 코드 배포와 순서 무관하고, 없어도 동작은 같다(느릴 뿐).

create index if not exists gem_time_reductions_user_idx
  on public.gem_time_reductions (user_id, server_id);

create index if not exists guild_audit_actor_idx
  on public.guild_audit_log (actor_user_id, action, created_at desc);
