-- 다이아 증감 원장 (2026-08-10 경제 감사) — 재화가 어디서 들어오고 나갔는지 사후 추적.
--
-- 배경: 지갑 증감이 walletAdd/walletTrySpend 단일 경로를 지나는데 로그가 없어, 사고(익스플로잇·
-- 오지급)가 나도 "누가 얼마를 부당 취득했고 어디까지 되돌려야 하는지" 산정할 수단이 없었다.
-- 경제 감사에서도 우편·강화 로그로 역산해야 했다.
--
-- 규모(CBT 실측 기준): 유입 이벤트는 인당 1.88건/일 → 동접 1,000명 시 1,876행/일, 1년 0.11GB.
-- ⚠ 강화 시간단축은 인당 60건/일로 자릿수가 다르고 enhancement_logs.reduced_ms가 이미 같은
--   정보를 담고 있어 **원장에 기록하지 않는다**(중복 저장 회피 — 코드에서 skipLedger로 제외).
--
-- 순수 추가 — 코드 배포와 순서 무관.
create table if not exists public.diamond_ledger (
  id          bigserial primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  server_id   smallint not null,
  -- 양수=유입, 음수=소모. 지갑에 실제 반영된 값만 기록(차감 실패는 남기지 않는다).
  delta       bigint not null,
  -- 사유 코드(코드 상수 LedgerReason와 1:1). 예: daily_supply · checkin · challenge · iap · admin
  reason      text not null,
  -- 추적 키 — 주문번호·우편 id·레이드 id 등. 사고 시 원인 행위를 되짚는 실마리.
  ref         text,
  created_at  timestamptz not null default now()
);

-- 유저별 조회(분쟁 대응·어드민 확인).
create index if not exists diamond_ledger_user_idx on public.diamond_ledger (user_id, id desc);
-- 사유별 집계(경제 관측 — 일별 faucet/sink 대시보드).
create index if not exists diamond_ledger_reason_idx on public.diamond_ledger (reason, created_at desc);
-- 보존 정리 스캔.
create index if not exists diamond_ledger_created_idx on public.diamond_ledger (created_at);

comment on table public.diamond_ledger is
  '다이아 증감 원장 — 유입 전량 + 소모(강화 시간단축 제외). 보존 180일, mail-expire 크론이 정리.';
