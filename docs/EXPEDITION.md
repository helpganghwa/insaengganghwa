# EXPEDITION — 파견 (v1 설계)

> 상시 콘텐츠 부재("강화 누르고 이제 뭐함?")를 메우는 시간 기반 원정.
> 철학 정합: 모든 판정은 서버 시계·서버 RNG(§3.1·§3.2), 클라이언트는 표시만.
> 강화와 같은 "걸어두고 잊는" 리듬 — 접속을 강요하지 않고, 돌아올 이유를 만든다.

---

## 1. 규칙 요약

- **모델**: 시간 기반 원정. 파견지를 골라 N시간 보내고, 완료 후 수령. 자동 완료 없음(수령 클릭 시 판정 — 강화 §6.1(B)와 동일).
- **슬롯**: 유저당 **3슬롯**(서버별). 각 슬롯 독립 파견·독립 단축.
- **게이트**: 파견지는 전투력 구간별 순차 개방. 전투력은 **파견 시작 시점 스냅샷**으로 검증(등록 후 하락해도 소급 없음 — 환산률 스냅샷 원칙 §6.1(C) 준용).
- **시간 옵션**: 1h / 4h / 8h / 12h. 보상은 시간 비례 + 장시간 소폭 보너스(12h 효율 최고 — "자기 전에 걸어두기" 유도).
- **단축**: 다이아로 남은 시간 즉시 완료 — 강화 시간 단축과 동일 환산률·동일 UX(코드 재사용). 경제 sink의 핵심.
- **일일 상한**: **수령(완료) 기준 하루 6회**(계정×서버, KST 자정 리셋, 즉시완료도 카운트).
  근거 ① 1h 반복이 12h보다 효율 높은 사이클링 숙제화 차단(시간당 효율 역전 방지의 최종 안전망)
  ② 즉시완료 무한 반복 = 상자·이용권 무제한 구매가 되는 구멍 차단(상자 상점 보호)
  ③ 3슬롯 × 8h 2교대(아침/저녁 수령)가 정확히 6회 — 의도한 생활 리듬의 풀가동과 일치
  ④ 일일 경제 유입이 "6회 × 회당 기대값"으로 결정론화 — 튜닝 단순.
  구현: claim 트랜잭션에서 KST 일자 카운터 검증(체크인 kstDateString 패턴), 초과 시 CLAIM_LIMIT.
  UI: 파견 화면에 "오늘 수령 N/6" 표기, 6회 소진 시 시작 버튼에 안내(시작 자체는 허용 — 자정 넘겨 수령).
- **취소**: 진행 중 취소 가능, 보상 없음(자원 선차감이 없으므로 환불도 없음). 취소는 상한 미차감.
- **비용**: 파견 시작 자체는 무료(v1). 진입 장벽 없이 습관 형성이 우선.

## 2. 파견지 — 기존 6지역 재사용

세계관·지역 코드는 zones의 region을 그대로 쓴다(신규 에셋 불필요, 지도 아이콘 재사용).
게이트는 현재 유저 전투력 분포(2026-08-25 대난투 219명: p50 1.6천 / p75 6천 / p90 2.2만 / 최고 77만) 기준.
성장 인플레에 맞춰 BALANCE.md에서 조정한다(코드 상수 = 공시 일치 의무).

| # | 파견지 | region | 개방 전투력 | 티어 |
|---|--------|--------|------------|------|
| 1 | 슬라임 늪 | swamp | 0 | T1 |
| 2 | 오크 부락 | orc | 2,000 | T2 |
| 3 | 왕국 | kingdom | 8,000 | T3 |
| 4 | 잊힌 신전 | temple | 25,000 | T4 |
| 5 | 드래곤 화산 | volcano | 80,000 | T5 |
| 6 | 타락 천사 부유섬 | angel | 250,000 | T6 |

## 3. 보상 (⚠ 전 항목 확률 공시 대상 — 게임산업법 §33)

완료 수령 시 서버 RNG로 롤. 티어·시간에 스케일. **기준표(8h, T1) — 최종 수치는 BALANCE.md 정본**:

| 보상 | 지급량 | 확률 | 비고 |
|------|--------|------|------|
| 📦 보급상자 | 3~6개 (슬롯 랜덤) | 100% | 확정 보상 — "노력의 최소 보상" |
| 💎 다이아 | 10~30 | 25% | 저확률 소액 — 뉴비 다이아 접점 |
| 🎫 레이드 소환권 | 1 | 3% | 신규 아이템 — 레이드 개설 1회 무료(다이아 200 대체) |
| 🎨 아바타 생성권 | 1 | 0.7% | 신규 아이템 — 아바타 생성 1회 무료(500~1,000💎 가치) |

- 티어 스케일: 상자 수량 +T당 소폭, 다이아 상한 +T당 소폭, 소환권/생성권 확률은 상위 티어에서만 소폭 상승(T6 생성권 ~1.5% 상한).
- 시간 스케일: 1h=×0.15, 4h=×0.55, 8h=×1.0, 12h=×1.6 (12h 시간당 효율 ~7% 보너스).
- **경제 가드**: 3슬롯 × 12h 풀가동 + 파견 레벨·시너지 만렙 기준 기대 다이아 유입 ≤ 일 60~90💎/유저로 설정(현 무료 유입 기준선 454💎/일의 ~15~20% 증분). 배율이 얹히는 만큼 기본값을 그만큼 낮게 시작. 시즌 후 실측으로 재조정.
- 상자 편중 방지: 슬롯(무기/방어구/장신구)은 균등 랜덤.

### 3.1 파견 레벨 (성장축 ①)

- 파견 완료 시 XP 획득: `시간(h) × 티어` (12h T6 = 72 XP). 취소는 0.
- 레벨 곡선: 누적 XP 임계 단조 증가, v1 상한 Lv.50.
- 효과: **상자·다이아 기대값에 레벨당 +1%** (Lv.50 = +50%).
  ⚠ 이용권(소환권·생성권) 확률에는 미적용 — 고가치 보상이 성장축으로 복리 인플레되는 것 차단.
- 표시: 파견 화면 상단 레벨·게이지. 레벨업 순간 토스트(다음 배율 안내).
- 저장: `expedition_levels (user_id, server_id, xp, level)` — 서버별.

### 3.2 지역 시너지 (성장축 ② — 아바타 연계)

- **활성 아바타의 장비 스냅샷**(user_profiles.equipmentSnapshot) 3종 각각의 카탈로그 지역이
  파견지 지역과 일치하면 **일치 1개당 보상 +10% (최대 +30%)**.
- 시간 단축이 아니라 보상업인 이유: 파견 시간이 짧아지면 다이아 즉시완료(sink) 수요를
  잠식한다. 보상업은 sink 중립이면서 "지역 세트 아바타를 만들 이유"를 준다.
- 루프 설계 의도: 파견 → 생성권 드랍 → 지역 장비로 아바타 생성 → 해당 지역 파견 보너스
  → 파견 동기 강화. 아바타 생성(다이아 sink)과 파견이 서로를 끌어준다.
- 기본 아바타·스냅샷 없는 구형 아바타는 보너스 0(불이익 아님 — 기본값이 표준).
- UI: 파견지 카드에 "🎨 시너지 +N%" 배지 + 미보유 시 "이 지역 장비로 아바타를 만들면 보너스" 안내.

## 4. 신규 아이템 — 이용권(voucher)

소환권·생성권 공용의 범용 테이블(추후 이용권류 확장 대비):

```sql
-- user_vouchers: (user, server, kind)당 1행 카운터 — user_supply_boxes 패턴 미러
create table user_vouchers (
  user_id uuid not null references profiles(id) on delete cascade,
  server_id smallint not null default 1,
  kind text not null,          -- 'raid_summon' | 'avatar_gen'
  count integer not null default 0,
  primary key (user_id, server_id, kind)
);
```

- **소환권 사용**: 레이드 개설 시 소환권 보유하면 우선 소모(다이아 200 미차감). 개설 UI에 "소환권 1 보유" 표시.
- **생성권 사용**: 아바타 생성 시 보유하면 우선 소모(profileGenPrice 미차감). escrow 로직은 diamond 0·voucher 1로 원장 기록(분쟁 추적 가능해야 — job:<id> ref 규약 유지).
- 소모·지급 전부 원장성 기록(audit) — 기존 diamond_ledger 패턴의 voucher 버전은 v1에선 mail/파견 로그로 갈음, 남용 신고 시 파견 수령 로그로 추적.

## 5. 스키마 — expeditions

```sql
create table expeditions (
  id bigserial primary key,
  server_id smallint not null default 1,
  user_id uuid not null references profiles(id) on delete cascade,
  slot smallint not null,               -- 1..3
  region zone_region not null,          -- 파견지
  tier smallint not null,               -- 시작 시점 티어 스냅샷(공시·분쟁 추적)
  duration_ms bigint not null,          -- 옵션 스냅샷
  combat_snapshot bigint not null,      -- 시작 시점 전투력(게이트 검증 증빙)
  started_at timestamptz not null default now(),
  complete_at timestamptz not null,     -- 서버 시계 stamping(§3.2)
  reduced_ms bigint not null default 0, -- 다이아 단축 누적
  status text not null default 'running',  -- running | claimed | cancelled
  reward jsonb,                          -- 수령 시 서버 롤 결과 스냅샷(분쟁·공시 검증)
  claimed_at timestamptz,
  unique (user_id, server_id, slot, status) -- 부분 유니크: status='running'만 (슬롯당 1건)
);
-- 실제 부분 유니크는 수동 SQL: create unique index expeditions_one_running
--   on expeditions (user_id, server_id, slot) where status = 'running';
```

- 수령: `for update` + `complete_at <= now()` + `status='running'→'claimed'` 조건부 전이(§6.3).
- 단축: 강화 `reduceTime.ts` 패턴 — 남은 시간 환산, min(요청, 잔여) 캡, 등록 시점 환산률 스냅샷.
- 보상 지급은 수령 트랜잭션 안에서 원자적(상자 upsert + 다이아 walletAdd + voucher upsert + XP 가산 + reward 스냅샷).
- 시너지 배율은 **수령 시점의 활성 아바타** 기준으로 계산해 reward 스냅샷에 함께 기록
  (`synergy: 0~3`) — 시작 후 아바타를 바꿔도 수령 시점 기준 하나로 단순·일관.

```sql
create table expedition_levels (
  user_id uuid not null references profiles(id) on delete cascade,
  server_id smallint not null default 1,
  xp bigint not null default 0,
  level integer not null default 0,
  primary key (user_id, server_id)
);
```

## 6. 서버 API (Server Actions)

- `startExpeditionAction(slot, region, durationH)` — 게이트 검증(전투력), running 유니크, complete_at stamping.
- `claimExpeditionAction(id)` — 시계 검증 → RNG 롤 → 지급 → claimed. 멱등(조건부 전이).
- `cancelExpeditionAction(id)` — running→cancelled.
- `reduceExpeditionAction(id, diamond)` — 다이아 차감 + complete_at 단축(강화 단축 미러).
- 레이트리밋: 시작/수령 계열은 기존 인메모리 창 재사용.

## 7. UI

- **진입**: 홈 메뉴 카드 1개 추가(게시판 카드 계열) + 하단 네비는 변경 없음.
- **화면**: `/expedition` — 상단 3슬롯 카드(진행/비어있음), 하단 파견지 목록(게이트 잠금 표시 — 미달 시 "전투력 N 필요", 다이아 게이트 스타일의 성장 유도).
- 슬롯 카드: 남은 시간(Ticker 격리), [💎 즉시 완료](강화 단축과 동일 표기), 완료 시 [수령] 강조.
- 수령 연출: 보상 롤 결과 팝업(공통 ModalShell/ModalLayout, 상자/다이아/이용권 아이콘 나열).
- 튜토리얼 연계는 v1 제외(오픈 후 추가 검토).

## 8. 공시·법규

- 파견 보상 확률표를 확률 공시 페이지에 **출시와 동시에** 추가(§33 — BALANCE 상수와 1:1).
- 소환권·생성권은 "무료 지급 확률형"이지만 공시 대상에 포함(보수 원칙).

## 9. 구현 순서 (작은 단계, 각 단계 확인 후 진행)

1. **P1 밸런스·상수**: BALANCE.md 추가 + `lib/game/balance.ts` 상수(티어·게이트·보상표·시간 스케일·레벨 곡선·시너지 배율) + 확률 공시 payload(배율 표기 포함 — "표기 확률은 기본값, 파견 레벨·시너지는 수량 기대값에만 적용" 명시).
2. **P2 스키마**: Drizzle 스키마 + 수동 SQL(017x — expeditions·expedition_levels·user_vouchers·부분 유니크).
3. **P3 서버**: start/claim/cancel/reduce 액션 + RNG 롤(레벨·시너지 배율) + 지급 트랜잭션 + 단위 테스트(밸런스 시뮬 포함).
4. **P4 이용권 소비**: 레이드 개설·아바타 생성에 voucher 우선 소모 통합.
5. **P5 UI**: /expedition 화면 + 홈 카드 + 수령 팝업.
6. **P6 검수**: 적대 검수(멱등·시계·경제 상한) → 스테이징 → 배포.
