-- 귓속말(1:1 대화) v1 (2026-08-07 설계 확정본) — SCHEMA §18 확장.
-- 대화방 테이블 없음: (server_id, 유저쌍)이 곧 대화. 서버별 완전 분리(SERVER.md §1).
-- 보존: 30일 + 대화당 최근 500건(cleanupChat 크론). 순수 추가 — 코드 배포와 순서 무관.

create table if not exists public.whisper_messages (
  id            bigserial primary key,
  server_id     smallint not null,
  from_user_id  uuid not null references public.profiles(id) on delete cascade,
  to_user_id    uuid not null references public.profiles(id) on delete cascade,
  -- 필터 통과 본문(전체 채팅과 동일 100자 상한 — 코드 검증).
  body          text not null,
  -- 유효 멘션 [{n,c}] — 전체 채팅과 동일 구조(강조·프로필 링크). 푸시는 상대 멘션 시만.
  mentions      jsonb,
  created_at    timestamptz not null default now(),
  -- 모더레이션 숨김(어드민 검수) — null=노출.
  hidden_at     timestamptz
);

-- 스레드 조회 — 쌍 정규화 표현식 인덱스(방향 무관 한 대화).
create index if not exists whisper_pair_idx on public.whisper_messages
  (server_id, (least(from_user_id, to_user_id)), (greatest(from_user_id, to_user_id)), id desc);
-- 수신함 — 미니바 노티점(최신 1행)·미읽음 계산.
create index if not exists whisper_to_idx on public.whisper_messages (server_id, to_user_id, id desc);
-- 보존 정리(30일) 스캔용.
create index if not exists whisper_created_idx on public.whisper_messages (created_at);

-- 읽음 포인터 + '대화 나가기'(내 쪽만 숨김 — 상대 기록·어드민 열람은 유지).
create table if not exists public.whisper_reads (
  user_id          uuid not null references public.profiles(id) on delete cascade,
  server_id        smallint not null,
  peer_user_id     uuid not null,
  last_read_id     bigint not null default 0,
  -- 나가기 시점의 최신 메시지 id — 이 id 이하가 내 목록·스레드에서 제외된다.
  hidden_before_id bigint not null default 0,
  updated_at       timestamptz not null default now(),
  primary key (user_id, server_id, peer_user_id)
);
