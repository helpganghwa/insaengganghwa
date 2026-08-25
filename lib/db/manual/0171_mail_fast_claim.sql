-- 0171: mail_claim_logs.fast_claim — 신속 배달부(fast_courier) 판정 정본화(2026-08-25 칭호 감사 발견 1).
-- 종전 판정은 mailbox join 재계산이라 ① 수령 우편 30일 삭제 시 진행도가 후퇴(슬라이딩 창)
-- ② 서버 필터 누락으로 타 서버 실적 합산. 수령 시점에 "생성 5분 내 수령" 여부를 박제한다.
alter table mail_claim_logs add column if not exists fast_claim boolean not null default false;

-- 백필 — 현존 우편과 join 가능한 로그 전량. 서비스가 우편 30일 삭제 시점(첫 삭제 9/23+) 전이라
-- 삭제로 유실된 로그가 없어 완전 백필이다.
update mail_claim_logs l
set fast_claim = true
from mailbox m
where m.id = l.mail_id
  and l.claimed_at <= m.created_at + interval '5 minutes'
  and l.fast_claim = false;
