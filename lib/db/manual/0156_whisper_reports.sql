-- 귓속말 메시지 신고 (2026-08-07 피드백) — 전체/길드와 동일하게 본문 탭 = 메시지 단위 신고.
-- chat_reports는 FK가 chat_messages라 재사용 불가 — 동형 테이블 분리.
-- 자동 숨김 임계는 없다: 1:1 대화는 신고 가능자가 상대 1명뿐이라 3건 임계가 성립하지 않고,
-- 신고 1건 자동 숨김은 어뷰징 지렛대가 된다. 처리는 어드민 검수(신고 건수 노출)에서.
create table if not exists public.whisper_reports (
  message_id       bigint not null references public.whisper_messages(id) on delete cascade,
  reporter_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at       timestamptz not null default now(),
  primary key (message_id, reporter_user_id)
);
