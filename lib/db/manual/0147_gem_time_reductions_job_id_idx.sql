-- 0147 — gem_time_reductions.job_id 인덱스(누락된 FK 인덱스)
--
-- 왜 필요한가: job_id는 enhancement_jobs(id)를 ON DELETE CASCADE로 참조하는데 인덱스가
-- 없었다. Postgres는 부모를 지울 때마다 `delete from gem_time_reductions where job_id = $1`을
-- 실행하는데, 인덱스가 없으면 **부모 한 행마다 자식 테이블 전체를 순차 스캔**한다.
--
-- 실제로 터진 곳(2026-08-01 CBT 컷오버): enhancement_jobs 458,804행 삭제가
-- gem_time_reductions 356,464행을 매번 훑어 20분을 넘겨도 끝나지 않았다. 자식을 먼저
-- 비워도 죽은 튜플이 남아 스캔 비용은 그대로였다. 인덱스 생성(0.2초) 후 즉시 통과.
--
-- 평시에도 같은 경로가 있다: 계정 탈퇴(withdraw)와 강화 잡 정리가 부모를 지운다.
-- 데이터가 쌓일수록 느려지는 구조라 컷오버 밖에서도 고쳐 두어야 한다.
create index if not exists gem_time_reductions_job_id_idx
  on gem_time_reductions (job_id);
