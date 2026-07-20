-- 0127: 채팅 장비 태그 + 멘션 푸시 옵트아웃(2026-07-21)
-- item: 전송 시점 장비 스냅샷 {n,c,s,e,t,cp} — 이후 강화해도 메시지는 당시 값 유지.
alter table chat_messages add column if not exists item jsonb;
-- 멘션 푸시 토글(기본 ON) — 설정 > 알림.
alter table profiles add column if not exists push_chat_mention boolean not null default true;
