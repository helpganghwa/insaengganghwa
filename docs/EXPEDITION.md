# EXPEDITION — 파견 (v1 설계)

> 상시 콘텐츠 부재("강화 누르고 이제 뭐함?")를 메우는 시간 기반 원정.
> 철학 정합: 모든 판정은 서버 시계·서버 RNG(§3.1·§3.2), 클라이언트는 표시만.
> 강화와 같은 "걸어두고 잊는" 리듬 — 접속을 강요하지 않고, 돌아올 이유를 만든다.

---

## 1. 규칙 요약

- **모델**: 시간 기반 원정. 파견지를 골라 N시간 보내고, 완료 후 수령. 자동 완료 없음(수령 클릭 시 판정 — 강화 §6.1(B)와 동일).
- **슬롯**: 유저당 **3슬롯**(서버별). 각 슬롯 독립 파견·독립 단축.
- **게이트 없음**: 전 파견지 즉시 개방(2026-08-25 사용자 결정 — 전투력 게이트 제거). 지역 선택의 의미는
  시너지(§3.2)와 지역별 상자 슬롯 가중(§2)이 만든다.
- **시간 옵션**: 1h / 4h / 8h / 12h / **24h**. 보상은 시간 비례 + 장시간 소폭 보너스(24h 효율 최고 — "하루 한 번" 유저 배려).
- **단축**: 다이아로 남은 시간 즉시 완료 — 강화 시간 단축과 동일 환산률·동일 UX(코드 재사용). 경제 sink의 핵심.
- **일일 상한**: **파견 시작(투입) 기준 하루 6회**(계정×서버, KST 자정 리셋 — 2026-08-25 사용자 결정: 수령이 아닌 투입 차감).
  근거 ① 1h 반복 사이클링 숙제화·즉시완료 무한 파밍 차단(상자 상점 보호)
  ② 3슬롯 × 8h 2교대가 정확히 6회 — 의도한 생활 리듬의 풀가동과 일치(24h 위주 유저는 하루 3회만 씀)
  ③ 일일 경제 유입 상한이 "6회 × 회당 기대값"으로 결정론화.
  구현: start 트랜잭션에서 KST 일자 카운터 검증(체크인 kstDateString 패턴), 초과 시 START_LIMIT.
  수령은 카운트와 무관(자정 넘김 수령 이슈 자체가 없음).
  UI: 파견 화면에 "오늘 파견 N/6" 표기.
- **취소**: 진행 중 취소 가능, 보상 없음. **취소해도 일일 횟수는 반환하지 않는다**(반환 시 시작→취소
  반복으로 카운터가 무의미해짐 — 신중히 보내는 긴장감 유지).
- **비용**: 파견 시작 자체는 무료(v1). 진입 장벽 없이 습관 형성이 우선.

## 2. 파견지 — 기존 6지역 재사용 (전부 즉시 개방)

세계관·지역 코드는 zones의 region을 그대로 쓴다(신규 에셋 불필요, 지도 아이콘 재사용).
게이트가 없으므로 **기본 보상은 전 지역 동일**(티어 스케일 없음 — 없애지 않으면 최상위 지역만
선택되는 단일 지배가 생긴다). 지역 선택의 의미는 두 가지로 만든다:

1. **상자 슬롯 가중**: 지역마다 잘 나오는 상자 종류가 다르다(가중 60/20/20).
2. **아바타 지역 시너지**(§3.2).

| # | 파견지 | region | 상자 가중(60%) |
|---|--------|--------|---------------|
| 1 | 슬라임 늪 | swamp | 방어구 |
| 2 | 오크 부락 | orc | 무기 |
| 3 | 왕국 | kingdom | 장신구 |
| 4 | 잊힌 신전 | temple | 장신구 |
| 5 | 드래곤 화산 | volcano | 무기 |
| 6 | 타락 천사 부유섬 | angel | 방어구 |

## 3. 보상 (⚠ 전 항목 확률 공시 대상 — 게임산업법 §33)

완료 수령 시 서버 RNG로 롤(2026-08-25 개편 — 본상 3분기 + 희귀 별도 롤). **기준표(8h) — 최종 수치는 BALANCE.md 정본**:

**본상 롤(1회, 셋 중 하나 확정)** — 수량은 2026-08-25 사용자 확정(일 최대 기대 ≈500💎)

| 분기 | 확률 | 내용(8h 기준) |
|------|------|--------------|
| 📦 상자만 | 55% | 보급상자 4~6개(지역 슬롯 가중) |
| 💎 다이아만 | 20% | 120~240 |
| 📦+💎 둘 다 | 25% | 상자 3~4개 + 다이아 20~48 |

- ~~희귀 롤(레이드 소환권·아바타 생성권)~~ — **v1.5 보류**(2026-08-25 사용자 결정). §4 이용권
  설계는 재개 대비 보존하되 v1 구현 범위에서 제외(스키마 user_vouchers·P4 통합 미구현).
- 지역 간 기본 수치 동일(§2 — 티어 스케일 없음).
- 시간 스케일(수량에 적용): 1h=×0.15, 4h=×0.55, 8h=×1.0, 12h=×1.6, 24h=×3.4
  (24h 시간당 효율 최고 — 하루 1회 유저 배려).
- **경제 가드**: 일 6회(시작 기준) 풀가동 + 파견 레벨·시너지 만렙 기준 기대 다이아 유입 ≤ 일 60~90💎/유저로 설정(현 무료 유입 기준선 454💎/일의 ~15~20% 증분). 배율이 얹히는 만큼 기본값을 그만큼 낮게 시작. 시즌 후 실측으로 재조정.
- 상자 슬롯: 지역 가중 60/20/20(§2) — 원하는 슬롯 상자를 노린 지역 선택이 가능.

### 3.1 파견 레벨 (성장축 ①)

- 파견 완료 시 XP 획득: `시간(h)` 그대로 (24h = 24 XP — 티어 폐지로 시간만이 기준). 취소는 0.
- 레벨 곡선: 누적 XP 임계 단조 증가, v1 상한 Lv.50.
- 효과: **상자·다이아 기대값에 레벨당 +1%** (Lv.50 = +50%).
  ⚠ 이용권(소환권·생성권) 확률에는 미적용 — 고가치 보상이 성장축으로 복리 인플레되는 것 차단.
- 표시: 파견 화면 상단 레벨·게이지. 레벨업 순간 토스트(다음 배율 안내).
- 저장: `expedition_levels (user_id, server_id, xp, level)` — 서버별.

### 3.2 지역 시너지 (성장축 ② — 아바타 연계)

- **활성 아바타의 장비 스냅샷**(user_profiles.equipmentSnapshot) 3종 각각의 카탈로그 지역 기준:
  - **지역 장비**: 파견지와 일치하면 **개당 +10%** (특화 — 최대 +30%)
  - **"일반" 장비**(카탈로그 region=일반, 현 18종): 어느 파견지든 **개당 +5%** (범용 — 최대 +15%)
  - 불일치 지역 장비: 0% (감소·패널티 없음 — 기본 0이 표준이고, 깎으면 파견이 "손해 보는 콘텐츠"로 체감됨)
- 일반 장비에 범용 절반 효율을 주는 이유: 감소 없이도 "일반=어디든 무난, 지역=특화 최강"의
  트레이드오프가 생겨 일반 타입이 손해가 아니게 된다(2026-08-25 사용자 지적 반영).
- 시간 단축이 아니라 보상업인 이유: 파견 시간이 짧아지면 다이아 즉시완료(sink) 수요를
  잠식한다. 보상업은 sink 중립이면서 "지역 세트 아바타를 만들 이유"를 준다.
- 루프 설계 의도: 파견 → 생성권 드랍 → 지역 장비로 아바타 생성 → 해당 지역 파견 보너스
  → 파견 동기 강화. 아바타 생성(다이아 sink)과 파견이 서로를 끌어준다.
- 기본 아바타·스냅샷 없는 구형 아바타는 보너스 0(불이익 아님 — 기본값이 표준).
- UI: 파견지 카드에 "🎨 시너지 +N%" 배지 + 미보유 시 "이 지역 장비로 아바타를 만들면 보너스" 안내.

## 4. 신규 아이템 — 이용권(voucher) ⏸ v1.5 보류(2026-08-25 사용자 결정 — v1은 상자+다이아만)

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
  duration_ms bigint not null,          -- 옵션 스냅샷
  started_at timestamptz not null default now(),
  complete_at timestamptz not null,     -- 서버 시계 stamping(§3.2)
  reduced_ms bigint not null default 0, -- 다이아 단축 누적
  status text not null default 'running',  -- running | claimed | cancelled
  reward jsonb,                          -- 수령 시 서버 롤 결과 스냅샷(분쟁·공시 검증)
  claimed_at timestamptz
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

- `startExpeditionAction(slot, region, durationH)` — 일일 횟수 차감(6회), running 유니크, complete_at stamping.
- `claimExpeditionAction(id)` — 시계 검증 → RNG 롤 → 지급 → claimed. 멱등(조건부 전이).
- `cancelExpeditionAction(id)` — running→cancelled.
- `reduceExpeditionAction(id, diamond)` — 다이아 차감 + complete_at 단축(강화 단축 미러).
- 레이트리밋: 시작/수령 계열은 기존 인메모리 창 재사용.

## 7. UI

- **진입**: 홈 메뉴 카드 1개 추가(게시판 카드 계열) + 하단 네비는 변경 없음.
- **화면**: `/expedition` — 상단 3슬롯 카드(진행/비어있음), 하단 파견지 6종 목록(전부 개방 — 카드에 상자 가중 아이콘·시너지 배지 표시).
- 슬롯 카드: 남은 시간(Ticker 격리), [💎 즉시 완료](강화 단축과 동일 표기), 완료 시 [수령] 강조.
- 수령 연출: 보상 롤 결과 팝업(공통 ModalShell/ModalLayout, 상자/다이아/이용권 아이콘 나열).
- 튜토리얼 연계는 v1 제외(오픈 후 추가 검토).

## 8. 공시·법규

- 파견 보상 확률표를 확률 공시 페이지에 **출시와 동시에** 추가(§33 — BALANCE 상수와 1:1).
- 소환권·생성권은 "무료 지급 확률형"이지만 공시 대상에 포함(보수 원칙).

## 9. 구현 순서 (작은 단계, 각 단계 확인 후 진행)

1. **P1 밸런스·상수**: BALANCE.md 추가 + `lib/game/balance.ts` 상수(본상 3분기·희귀 롤·시간 스케일·상자 가중·레벨 곡선·시너지 배율·일 6회) + 확률 공시 payload(배율 표기 포함 — "표기 확률은 기본값, 파견 레벨·시너지는 수량 기대값에만 적용" 명시).
2. **P2 UI/UX 아티팩트 검증**: 화면 시안 복수 안을 아티팩트로 제시 → 사용자 선택·피드백 →
   확정 시안 아티팩트 갱신. **확정 전 구현 착수 금지**(2026-08-25 사용자 지시 — UI/UX 최우선).
   범위: 홈 진입 카드 · /expedition(3슬롯+지역 목록+N/6+레벨 게이지) · 파견 보내기 시트(시간 선택
   ·예상 보상) · 수령 팝업(일반/대성공) · 시너지 배지.
3. **P3 스키마**: Drizzle 스키마 + 수동 SQL(017x — expeditions·expedition_levels·부분 유니크).
   (user_vouchers는 이용권 보류로 v1 제외)
4. **P4 서버**: start/claim/cancel/reduce 액션 + RNG 롤(레벨·시너지·대성공) + 지급 트랜잭션 + 단위 테스트.
5. **P5 UI 구현**: 확정 시안대로 /expedition + 홈 카드 + 수령 팝업 + 완료 푸시 + 도전 과제 3종 + 위키.
6. **P6 검수**: 적대 검수(멱등·시계·경제 상한) → 스테이징 → 배포(공시 §6 동시 공개).
