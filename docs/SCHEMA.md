# 인생강화 (insaengganghwa) — DB SCHEMA

> Postgres(Supabase) + Drizzle ORM. DB 컬럼 snake_case / TS camelCase(자동 변환).
> 자원·수치는 `bigint`(int32 회피, CLAUDE §5.1). Supabase `auth.users`/`storage`는 별도 — Drizzle은 `public`만.
> 등급/희소성/부가스탯·천장·시즌·자가통계 테이블 **없음**(GDD 설계). 수치 기본값은 `BALANCE.md` 박제값과 1:1.
> 추천 스키마 — 도메인별 검토/조정.

---

## 1. profiles (계정/유저)

`auth.users`(Supabase, Kakao OAuth)와 1:1.

| 컬럼 | 타입 | 비고 |
|------|------|------|
| `id` | uuid PK | = `auth.users.id` FK |
| `nickname` | text UNIQUE NOT NULL | 변경 가능(정책 후속) |
| `diamond` | bigint NOT NULL default 0 | 단일 프리미엄 재화(=보석, BALANCE §6.1) |
| `is_adult` | boolean default false | 본인인증 결과(§9 도메인) |
| `identity_verified_at` | timestamptz null | KMC/PASS 완료 시각 |
| `birth_year_hash` | text null | 해시만(원본 미저장, REGULATORY) |
| `representative_title_code` | text null | 대표 칭호(칭호=social 도메인) |
| `tutorial_step` | int NOT NULL default 0 | Day1 온보딩 진행(GDD §4) |
| `created_at` / `updated_at` | timestamptz default now() | |

- 시즌·자가통계·천장 관련 컬럼 **없음**
- `diamond` 변동은 항상 트랜잭션 + 감사 로그(§감사 도메인). 직접 UPDATE 금지

---

## 2. 카탈로그 & 장비

### 2.1 catalog_items (가변 카탈로그)
모든 아이템 **성능 동일** — 전투력/시간 컬럼 없음. 슬롯 구분 + 외관/도감/초월 동일성 판정용(GDD §3.1).

| 컬럼 | 타입 | 비고 |
|------|------|------|
| `id` | int PK (serial) | catalog_item_id |
| `slot` | enum(`weapon`,`armor`,`accessory`) NOT NULL | 보급 상자 슬롯 일치 키 |
| `code` | text UNIQUE NOT NULL | `sword_iron` 등 스프라이트/식별 키 |
| `name` | text NOT NULL | 표시명 |
| `active` | boolean default true | 지속 추가(가변), 비활성 시 신규 드롭 제외 |
| `created_at` | timestamptz default now() | |

- 박스 개봉 확률 = `1 / (slot별 active 카탈로그 수)` 균등 — 코드 규칙(고정 수치 아님, BALANCE §4.2)

### 2.2 equipment_instances (장비 개체)

| 컬럼 | 타입 | 비고 |
|------|------|------|
| `id` | bigserial PK | 개체 고유 |
| `user_id` | uuid FK→profiles | |
| `catalog_item_id` | int FK→catalog_items | 초월/+100 제물 동일성 = 이 값 일치 |
| `enhance_level` | int NOT NULL default 0 | 강화 레벨(무제한, 하한 0) |
| `transcend_level` | int NOT NULL default 0 | 0..10 (BALANCE §2) |
| `equipped_slot` | enum(slot) null | 장착 시 해당 슬롯, 미장착 null |
| `acquired_at` | timestamptz default now() | |

- **부분 UNIQUE**: `(user_id, equipped_slot) WHERE equipped_slot IS NOT NULL` — 슬롯당 1개 장착
- 인덱스: `(user_id, catalog_item_id)` — 제물 후보/중복 조회 / `(user_id, equipped_slot)`
- 등급·옵션·seed·전투력 컬럼 **없음**. 전투력은 `(enhance_level, transcend_level)`로 런타임 계산(BALANCE §3)

### 2.3 user_codex (도감 — 도감강화합 소스)

| 컬럼 | 타입 | 비고 |
|------|------|------|
| `user_id` | uuid FK→profiles | |
| `catalog_item_id` | int FK→catalog_items | |
| `max_enhance_level` | int NOT NULL default 0 | 해당 아이템 역대 최고 강화 |
| `max_enhance_reached_at` | timestamptz NOT NULL default now() | 현재 `max_enhance_level`을 **최초 달성한 시각** — 아이템별 랭킹 동률 타이브레이크 |
| `first_acquired_at` | timestamptz | 도감 해금(미획득=row 없음) |

- PK `(user_id, catalog_item_id)`
- **도감강화합** = `Σ max_enhance_level`(전 카탈로그) → 총 전투력·합산 강화 랭킹(BALANCE §3.2/3.3)
- 강화 완료 트랜잭션에서 `GREATEST(max_enhance_level, 신규레벨)` upsert. **신규레벨 > 기존 max**일 때만 `max_enhance_reached_at = now()` 동시 갱신(달성 시각 = 그 기록을 처음 세운 때, 이후 하락·재달성과 무관). 신규 row insert 시 default `now()`.
- **아이템별 랭킹/챔피언**: catalog_item 단위로 `max_enhance_level` DESC, `max_enhance_reached_at` ASC, `user_id` ASC 정렬 → Top10. 1위 = 그 아이템 **챔피언**(단, `max_enhance_level > 0`). 결정적 정렬 — 확률 없음(BALANCE §3.3)

---

## 3. 강화 큐 & 감사 로그 (CLAUDE §6 — 서버 권위·멱등)

### 3.1 enhancement_jobs (진행 중 큐)

| 컬럼 | 타입 | 비고 |
|------|------|------|
| `id` | bigserial PK | |
| `user_id` | uuid FK→profiles | |
| `equipment_instance_id` | bigint FK→equipment_instances | |
| `slot` | enum(slot) NOT NULL | lane 그룹 키 |
| `slot_lane` | smallint NOT NULL | 1\|2 — 부위당 2 lane(GDD §3.2) |
| `from_level` / `target_level` | int | target = from+1 |
| `base_rate_bp` | int NOT NULL | 등록 시점 baseRate 스냅샷(만분율, 공시·감사) |
| `duration_ms` | bigint NOT NULL | 등록 시점 산정 `d(target)`(BALANCE §1.1) |
| `started_at` | timestamptz default now() | |
| `complete_at` | timestamptz NOT NULL | 단축 시 갱신. 완료 판정 = `now() >= complete_at` |
| `total_reduced_ms` | bigint default 0 | 보석 단축 누적 |
| `fodder_instance_id` | bigint null FK | target ≥ +100 시 소모 제물 1개체(BALANCE §1.1) |
| `status` | enum(`running`,`completed`,`cancelled`) default `running` | 조건부 전이 |
| `created_at` | timestamptz default now() | |

- **부분 UNIQUE** `(user_id, slot, slot_lane) WHERE status='running'` → lane 점유(SLOT_BUSY). 추가 `(equipment_instance_id) WHERE status='running'` 중복 큐 차단
- 인덱스 `(status, complete_at)` — lazy/cron 정산. `(user_id, status)`
- 환산률·base_rate **등록 시점 스냅샷 영구**(소급 금지, CLAUDE §6.3)
- (A)등록→(B)완료(`for update`+`status='running'`조건부→`completed`)→(C)단축→(D)취소→(D+A)교체 단일 tx

### 3.2 enhancement_logs (감사 — append-only, 5년)

| 컬럼 | 타입 | 비고 |
|------|------|------|
| `id` | bigserial PK | |
| `user_id`·`equipment_instance_id`·`catalog_item_id` | FK | |
| `from_level`·`to_level` | int | 결과 반영 |
| `result` | enum(`success`,`hold`,`down`) | 성공+1 / 유지 / −1 하락 (파괴 없음) |
| `base_rate_bp`·`effective_rate_bp` | int | 공시값 / 실제(base×경과÷총, BALANCE §1.2) |
| `elapsed_ms`·`duration_ms`·`reduced_ms` | bigint | |
| `fodder_instance_id` | bigint null | +100 제물 |
| `rng_seed`·`rolled` | text/int | 사후 검증(클라 변조 불가) |
| `created_at` | timestamptz | = 완료 판정 시각 |

- 분쟁 재현용. 절대 UPDATE/DELETE 안 함

### 3.3 gem_time_reductions (보석 단축 이력)

| 컬럼 | 타입 | 비고 |
|------|------|------|
| `id` | bigserial PK | |
| `job_id` FK→enhancement_jobs · `user_id` FK | | |
| `gems_spent` | bigint | 차감 다이아 |
| `reduced_ms` | bigint | 단축 ms |
| `conversion_rate` | text/int | 등록 시점 환산률 스냅샷(1다이아=1분, BALANCE §6.2) |
| `created_at` | timestamptz | |

- 보석 인플레이션·어뷰징 추적(GDD §8)

---

## 4. 초월 (즉시·무RNG)

`equipment_instances.transcend_level` 직접 증가 + 제물 개체 **영구 삭제** + 로그 = 단일 tx(CLAUDE §3.3).

### 4.1 transcend_logs (append-only)

| 컬럼 | 타입 | 비고 |
|------|------|------|
| `id` | bigserial PK | |
| `user_id`·`equipment_instance_id`·`catalog_item_id` | FK | 대상 |
| `from_t`·`to_t` | smallint | to = from+1, ≤10 |
| `fodder_count` | int | 해당 단계 제물 수(BALANCE §2.1) |
| `fodder_instance_ids` | bigint[] | 소모(삭제)된 개체 id 기록 |
| `created_at` | timestamptz | |

- 제물 조건: `catalog_item_id` 일치 + 미장착 + 비강화중 개체(강화/초월 레벨 무관, +0 가능)
- `transcend_level` 상한 10 — CHECK 제약 `transcend_level BETWEEN 0 AND 10`

---

## 5. 보급 (보급 상자)

### 5.1 user_supply_boxes (미개봉 인벤토리, 슬롯별 집계)

| 컬럼 | 타입 | 비고 |
|------|------|------|
| `user_id` | uuid FK→profiles | PK 일부 |
| `slot` | enum(slot) | PK 일부 — 무기/방어구/장신구 |
| `count` | bigint NOT NULL default 0 | 보유 미개봉 수 |

- PK `(user_id, slot)`. 개봉 = count−1 + 장비 개체 생성 + 보석 드롭(20%→1~3) + 로그, 단일 tx

### 5.2 supply_open_logs (append-only 감사·공시 정합)

| 컬럼 | 타입 | 비고 |
|------|------|------|
| `id` | bigserial PK | |
| `user_id` FK · `slot` | | |
| `catalog_item_id` | int FK | 균등 추첨 결과(BALANCE §4.2) |
| `is_new` | boolean | 도감 신규 해금 여부 |
| `gem_drop` | smallint | 0~3 (20% 확률, BALANCE §4.3) |
| `created_at` | timestamptz | |

### 5.3 disenchant_logs

| 컬럼 | 타입 | 비고 |
|------|------|------|
| `id` | bigserial PK | |
| `user_id`·`catalog_item_id`·`equipment_instance_id` | | 개체 영구 삭제 |
| `diamond_granted` | bigint | 고정 2(BALANCE §4.4), 강화/초월 무관 |
| `created_at` | timestamptz | |

- 분해 = 개체 DELETE + diamond += 고정값 + 로그, 단일 tx (장착·강화중·제물중 개체 불가)

---

## 6. 레이드 (플레이어 호스팅 co-op)

### 6.1 raids

| 컬럼 | 타입 | 비고 |
|------|------|------|
| `id` | bigserial PK | |
| `host_user_id` | uuid FK→profiles | |
| `boss_code` | enum(`slime_king`,`orc_chief`,`stone_golem`,`dragon_west`,`fallen_angel`) | 난이도 동일 |
| `phase1_hp` | bigint NOT NULL | 생성 시 `U(8000,12000)` 고정. phase n = `phase1·1.5^(n-1)` |
| `share_code` | text UNIQUE NOT NULL | 카톡 공유 링크 |
| `opened_at` | timestamptz default now() | |
| `expire_at` | timestamptz NOT NULL | = opened_at + 6h(BALANCE §5.1) |
| `phases_cleared` | int default 0 | 정산 시 확정 |
| `status` | enum(`active`,`settled`) default `active` | |
| `settled_at` | timestamptz null | |

- 인덱스 `(status, expire_at)` — lazy/cron 정산. 개설 시 host diamond −1,000(환불 없음)

### 6.2 raid_participants

| 컬럼 | 타입 | 비고 |
|------|------|------|
| `id` | bigserial PK | |
| `raid_id` FK · `user_id` FK | | UNIQUE `(raid_id, user_id)` |
| `attacks_used` | int default 0 | 기본 10 한도 |
| `extra_attacks` | int default 0 | 다이아 추가 구매분(50+10·(n−1)) |
| `total_damage` | bigint default 0 | **표시용만** — 보상 가중 아님(GDD §3.5) |
| `joined_at` | timestamptz | |

### 6.3 raid_attacks (append-only)

`id` · `raid_id` · `user_id` · `seq` · `damage` bigint · `is_crit` bool · `is_extra` bool · `diamond_cost` bigint(추가공격 비용, 기본=0) · `created_at`. 데미지 = 총전투력×1.0×U(0.7,1.3)×(crit?1.5)(BALANCE §5.3).

### 6.4 raid_rewards (정산 — 멱등)

| 컬럼 | 타입 | 비고 |
|------|------|------|
| `id` | bigserial PK | |
| `raid_id` FK · `user_id` FK | | UNIQUE `(raid_id, user_id)` — 멱등 |
| `base_diamond` | bigint | 100(1회+ 공격) |
| `phase_diamond` | bigint | 페이즈 추첨 50%→100 합 |
| `boxes` | jsonb | 슬롯별 지급 보급 상자 수(50%→슬롯 1/3) |
| `created_at` | timestamptz | |

- 페이즈 돌파마다 1회 추첨 → **전원 동일 적용**. 정산은 6h 만료 시 lazy + cron, `(raid_id,user_id)` UNIQUE로 멱등(CLAUDE §3.4)

### 6.5 raid_daily_counts (일일 5회 한도)

`user_id` · `kst_date` date · `started_count` int — PK `(user_id, kst_date)`. 동시 3개는 `raids`/`raid_participants`에서 active 카운트로 검사.

---

## 7. 우편함 (mailbox)

| 컬럼 | 타입 | 비고 |
|------|------|------|
| `id` | bigserial PK | |
| `user_id` | uuid FK→profiles | |
| `type` | enum(`enhance_result`,`raid_settlement`,`reward`,`notice`) | |
| `payload` | jsonb | 다이아/보급상자(slot)/아이템/문구 등 |
| `claimed_at` | timestamptz null | 수령 시각(null=미수령) |
| `created_at` | timestamptz default now() | |

- 인덱스 `(user_id, claimed_at)` — 미수령 조회
- 적재: 오프라인 강화 cron 정산 · 레이드 6h 정산 · 비동기 보상 · 운영 공지(GDD §3.10)
- 우편 만료 정리는 cron (`/api/cron/mail-expire`)이 매일 KST 03시(UTC 18시) `claimed_at IS NULL AND expires_at < now()` 행 삭제. claim 경로는 이미 `gt(expiresAt, now())` lazy 만료 — cron은 누적 정리용.

---

## 8. 공유 / 추천 (referral)

### 8.1 shares

| 컬럼 | 타입 | 비고 |
|------|------|------|
| `id` | bigserial PK | |
| `user_id` | uuid FK→profiles | 공유자 |
| `unit` | enum(`single`,`full`) | 장비 단위 / 장비 전체+프로필(GDD §3.6) |
| `trigger` | enum(`enh30`,`enh50`,`enh99`,`first_transcend`,`transcend_max`,`manual`) | |
| `share_code` | text UNIQUE NOT NULL | `/s/{share_code}` |
| `snapshot` | jsonb | OG 렌더 스냅샷(닉/강화/초월/전투력/3슬롯) |
| `created_at` | timestamptz | |

### 8.2 referral_attributions (가입 전환)

| 컬럼 | 타입 | 비고 |
|------|------|------|
| `id` | bigserial PK | |
| `referrer_user_id` | uuid FK | 공유자 |
| `new_user_id` | uuid FK UNIQUE | 신규 가입자(1회 귀속) |
| `share_code` | text | |
| `rewarded` | boolean default false | 멱등 — 공유자 +300 다이아(BALANCE §6.3) |
| `created_at` | timestamptz | |

- 클릭/펀널 상세는 PostHog. DB는 전환·보상 멱등만 보장

### 8.3 share_reward_claims (1일 1회 100다이아)

`user_id` · `kst_date` date — PK `(user_id, kst_date)`. 존재 = 당일 수령 완료(BALANCE §6.3)

---

## 9. 결제 / IAP / 본인인증 (REGULATORY)

### 9.1 iap_orders

| 컬럼 | 타입 | 비고 |
|------|------|------|
| `id` | bigserial PK | |
| `user_id` | uuid FK | |
| `portone_order_id` | text UNIQUE NOT NULL | **webhook 멱등 키**(CLAUDE §3.4) |
| `product_code` | text | 다이아 패키지 등 |
| `amount_krw` | bigint | |
| `diamond_granted` | bigint | |
| `status` | enum(`pending`,`paid`,`refunded`) | |
| `paid_at`·`created_at` | timestamptz | |

### 9.2 iap_refunds

`id` · `order_id` FK · `user_id` · `reason` enum(`user`,`minor_protection`,`error`) · `amount_krw` · `clawback_done` boolean · `created_at`. 환불 시 재화 자동 회수(GDD §8).

### 9.3 monthly_purchase_limits (미성년 월 7만원)

`user_id` · `kst_month` char(6) `YYYYMM` · `total_krw` bigint — PK `(user_id, kst_month)`. 한도 도달 시 결제 차단 + 우편 안내(REGULATORY).

### 9.4 identity_verifications (append-only 감사)

`id` · `user_id` · `provider` enum(`kmc`,`pass`) · `birth_year_hash` · `is_adult` bool · `verified_at`. 결과 요약은 `profiles`에 반영(§1, 원본 미저장).

---

## 10. 운영 / 감사 / 안티치트

### 10.1 probability_snapshots (게임산업법 §33)

`id` · `effective_at` timestamptz · `payload` jsonb(baseRate 표·보급 균등 규칙·환산률 등 공시 전문) · `created_at`. 확률/수치 변경 시 **영구 기록 + 24h 사전 고지**(CLAUDE §3.5).

### 10.2 system_mode (점검 모드, GDD §3.9)

단일 키 행: `mode` enum(`live`,`read_only`,`maintenance`,`emergency_stop`) · `note` · `updated_by` · `updated_at`. 모든 게임 API 진입 미들웨어가 참조.

### 10.3 ad_views — v1 미도입

보상형 광고 v1 폐기(GDD §3.7, BALANCE §6.4)에 따라 테이블·enum 모두 제거.
0000 마이그레이션에 남아있는 `ad_views` / `ad_reward` enum은 과거 기록일 뿐 코드에서
참조하지 않으며, v2 도입 시 별도 마이그레이션으로 재정의한다.

레이트리밋(강화/단축/초월/보급)은 **Upstash Redis**(DB 아님, GDD §8).

### 10.4 admin_actions (운영 감사 로그)

`id` · `admin_user_id` · `action` · `target_type`·`target_id` · `payload` jsonb · `created_at`. 모드 전환·지급·정정 등 운영 행위 추적.

---

> 모든 도메인 = Drizzle 도메인별 스키마 파일(`lib/db/schema/*.ts`)로 1:1. 수치 기본값은 `BALANCE.md`, 행위 트랜잭션 규칙은 `CLAUDE.md §3·§6`.
