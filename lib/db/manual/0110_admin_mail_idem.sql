-- 0110: 전체우편 발송 멱등키 (2026-07-07 전수감사 E-묶음)
-- broadcast는 tx 커밋 후 응답 유실 → 어드민 재클릭 시 전 유저 이중 발송을 막을 장치가
-- 클라 pending 가드뿐이었다. 발송 로그에 클릭 의도당 UUID 키를 unique로 걸어,
-- 같은 키 재시도는 로그 선점(insert on conflict do nothing) 실패로 no-op이 된다.
alter table admin_mail_logs add column if not exists idempotency_key uuid;
create unique index if not exists admin_mail_logs_idem_uq
  on admin_mail_logs (idempotency_key) where idempotency_key is not null;
