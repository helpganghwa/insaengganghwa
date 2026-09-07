-- 0195: 소규모 업데이트 3(2026-09-07) — 유저 건의 반영.
--  ① raids.host_share_code: 개설자 전용 참여 링크 코드. 이 코드로 들어오면 비공개 레이드도 수락 없이 즉시 참여
--     (일반 share_code 링크는 참가 요청 유지 — 참여자가 링크를 공개해도 개설자가 걸러낼 수 있게). 옛 행은 null(전용 링크 없음).
--  ② friend_request_declines: 친구 요청 거절 기록 — 거절 후 FRIEND_REAPPLY_COOLDOWN_HOURS(24h) 동안 같은 상대에게 재요청 불가
--     (길드 가입 신청 거절 24h와 동일 기준). 수락되면 삭제. 탈퇴 시 삭제(withdraw.ts).
--  둘 다 추가만 — 옛 코드와 호환(코드 배포 전 적용 가능).
begin;

alter table raids add column if not exists host_share_code text;
create unique index if not exists raids_host_share_code_uq on raids (host_share_code) where host_share_code is not null;

create table if not exists friend_request_declines (
  server_id smallint not null,
  decliner_id uuid not null references profiles(id) on delete cascade,
  requester_id uuid not null references profiles(id) on delete cascade,
  declined_at timestamptz not null default now(),
  primary key (server_id, decliner_id, requester_id)
);

commit;
