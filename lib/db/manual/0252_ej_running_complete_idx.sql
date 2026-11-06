-- 0252 (2026-11-06 업데이트 18) — enhancement_jobs의 (status, complete_at) 전체 인덱스를 진행 중 잡만 담는 부분 인덱스로 교체.
-- enhancement_jobs는 끝난 잡이 쌓이는 표다(프로덕션 약 480만 행). ej_status_complete_idx(status, complete_at)는 끝난 잡까지 전부 담아
-- 수령마다(running → completed) status가 바뀌어 인덱스에 새 항목이 생겼다. 이 인덱스를 앞 컬럼(status)으로 쓰는 런타임 쿼리는
-- 전부 status = 'running'이다(2026-11-06 전수 확인):
--   · 푸시 크론(push-enhance-ready): running + push_sent=false + complete_at — 부분 인덱스 ej_push_ready_idx가 따로 있다
--   · 관리자 대시보드: count(*) where status = 'running'
--   · 셸·홈의 강화 완료 점: user_id로 찾는다(ej_user_slot_lane_running_uq)
-- 그래서 같은 역할의 부분 인덱스(complete_at) where status = 'running'을 먼저 만들고 옛 전체 인덱스를 지운다.
-- ⚠ ej_user_status_idx(user_id, status)는 바꾸지 않는다 — running이 아닌 조회가 쓴다(도전과제 첫 강화 exists, 튜토리얼 강화 횟수,
--   관리자 취소 잡 목록·보상 처리, 탈퇴·테스트 데이터 삭제의 user_id 조건).
--
-- 프로덕션에는 따로 적용한다. CONCURRENTLY는 트랜잭션 안에서 못 돌린다 — apply-migration.ts(트랜잭션) 대신 **한 문장씩** 단독 실행할 것.
-- 순서: ① 새 부분 인덱스 생성 → ② 같은 EXPLAIN으로 플랜 확인 → ③ 옛 인덱스 삭제. 한 번에 여러 문장을 보내면 암묵 트랜잭션으로 묶여 실패한다.
create index concurrently if not exists ej_running_complete_idx
  on public.enhancement_jobs (complete_at) where status = 'running';
drop index concurrently if exists public.ej_status_complete_idx;
