-- 0194: 후원 구간 550만 추가(2026-09-05) — 500만→600만에 남아 있던 100만 폭(💎20,000+📦600)을 550만·600만
--  두 구간(각 💎10,000+📦300)으로 쪼개 250만부터 1,000만까지 50만 단위로 통일. 총액·환급률 불변.
--  기존 600만 수령분(💎20,000+📦600)은 새 표의 (550+600)만 합과 같으므로 550만을 "지급됨"으로 표시해
--  소급 우편에서 제외(0190과 같은 방식, 회수 없음). 멱등(on conflict do nothing). 코드 배포 전 적용해도 옛 코드는 무시.
begin;

insert into patron_milestone_grants (user_id, milestone_krw, granted_at)
select user_id, 5500000, granted_at
from patron_milestone_grants
where milestone_krw = 6000000
on conflict (user_id, milestone_krw) do nothing;

commit;
