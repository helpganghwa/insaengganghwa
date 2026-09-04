-- 0190: 후원 구간 50만 단위 전환(2026-09-04) — 기존 100만 단위 수령분과 새 표의 누적 총액을 같게 맞춘다.
--  새 표: 600만 💎20,000+📦600(500→600만 100만 폭) · 650만~1,000만 50만마다 💎10,000+📦300.
--  전환 전 700/800/900/1,000만을 💎20,000+📦600으로 받은 유저는 그 금액이 새 표의 (650+700), (750+800),
--  (850+900), (950+1,000)만과 같으므로, 짝이 되는 50만 구간을 "지급됨"으로 표시해 소급 우편에서 제외한다.
--  → 새 결제자와 누적 총액 동일, 회수 없음. 배포 직후·소급 스크립트(patron-backfill --apply) 실행 전에 1회 적용.
--  (배포 후 새로 700만에 도달하면 💎10,000이 지급되고 그 행은 이 문에 걸리지 않는다 — granted_at 기준 아님,
--   실행 시점의 기존 행만 대상이므로 반드시 배포 직후 한 번만 실행.)
begin;

insert into patron_milestone_grants (user_id, milestone_krw, granted_at)
select g.user_id, g.milestone_krw - 500000, g.granted_at
from patron_milestone_grants g
where g.milestone_krw in (7000000, 8000000, 9000000, 10000000)
on conflict do nothing;

commit;
