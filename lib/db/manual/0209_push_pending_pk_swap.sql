-- 0209 (2026-09-21) 알림 묶음 키에 서버 추가 — **2단계(신코드 배포 후)**. 0206의 짝.
--
-- 신코드(on conflict (user_id, category, server_id))가 실서버에 올라간 **뒤에** 적용한다.
-- 먼저 적용하면 구코드의 on conflict (user_id, category)가 arbiter를 잃어 묶음 알림 적재가 실패한다.
-- 옛 PK를 내리고, 0206이 만들어 둔 유니크 인덱스를 PK로 승격한다(인덱스 재생성 없음).
alter table push_pending drop constraint if exists push_pending_pkey;
alter table push_pending
  add constraint push_pending_pkey primary key using index push_pending_user_cat_server_uq;
