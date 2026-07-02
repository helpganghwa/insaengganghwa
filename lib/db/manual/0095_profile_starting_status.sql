-- 0095: 아바타 생성 동시성 캡(5) 도입 — 'starting' 예약 상태 추가
-- drainQueue가 queued→starting으로 슬롯을 원자 선점(advisory lock)한 뒤 Pixellab 호출.
-- 'starting'은 poll(downloading만 조회) 대상이 아니어서 characterId 없이도 오작동 없음.
-- 유저당 활성 1건 UNIQUE 인덱스를 '비종단 전체'(NOT IN 종단)로 재정의해 starting도 자동 포함.
-- 멱등: enum 값·인덱스 모두 존재 가드.

-- 1) enum 값 추가. NOT IN(종단) 술어는 새 값 'starting'을 참조하지 않으므로 같은 트랜잭션에서 안전(PG12+).
alter type public.profile_job_status add value if not exists 'starting';

-- 2) 활성 UNIQUE 인덱스 재정의 — 종단(accepted/rejected_ai/failed)이 아닌 모든 상태 = 활성.
--    (기존: queued/downloading/ai_reviewing 명시 → starting 추가 위해 종단 부정형으로 전환)
drop index if exists public.profile_gen_one_active_per_user;
create unique index profile_gen_one_active_per_user
  on public.profile_generation_jobs (user_id)
  where status not in ('accepted', 'rejected_ai', 'failed');
