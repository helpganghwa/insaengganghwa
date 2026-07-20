-- 0128: 장비 자랑 태그 철회(item 컬럼 제거) + 유효 멘션 저장(2026-07-21)
-- mentions: 전송 시점에 실제 유저 닉과 일치한 멘션 목록(text[] as jsonb) — 표시 시 @ 제거·강조용.
alter table chat_messages drop column if exists item;
alter table chat_messages add column if not exists mentions jsonb;
