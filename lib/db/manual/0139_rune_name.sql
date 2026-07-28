-- 0139: 룬 이름 — 생성 시 AI/어휘풀 명명(그라데이션 이름 카드, 2026-07-28 확정 UI).
alter table runes add column if not exists name text;
