-- 0175 후원 구간 보상 지급 원장 (2026-08-26)
-- 누적 결제 구간(정본 lib/game/patron/milestones.ts — 2026-09-04부터 650만~ 50만 단위 40구간) 도달 시 1회 감사 우편(💎/📦)을
-- 지급한다. 이 표가 멱등 원장 — (user_id, milestone_krw) PK라 웹훅 중복·recon 재실행·소급 스크립트
-- 재실행에도 한 구간은 한 번만 지급된다. 환불로 구간 아래로 내려가도 회수하지 않는다(분쟁 방지).
-- 구간 정의·보상 수치는 lib/game/patron/milestones.ts가 정본.

create table if not exists patron_milestone_grants (
  user_id uuid not null references profiles(id) on delete cascade,
  milestone_krw integer not null,
  granted_at timestamptz not null default now(),
  primary key (user_id, milestone_krw)
);
