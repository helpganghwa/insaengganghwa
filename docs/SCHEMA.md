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

- 박스 열기 확률 = `1 / (slot별 active 카탈로그 수)` 균등 — 코드 규칙(고정 수치 아님, BALANCE §4.2)

### 2.2 user_equipment (보유 장비 — 카탈로그당 1레코드)

유저가 보유한 카탈로그 아이템 1종당 1행. 같은 카탈로그 중복 획득(박스)은 별도 보관되지 않고
`transcend_progress`로 누적 → 임계 도달 시 **자동 초월**(§4).

| 컬럼 | 타입 | 비고 |
|------|------|------|
| `id` | bigserial PK | |
| `user_id` | uuid FK→profiles | |
| `catalog_item_id` | int FK→catalog_items | |
| `enhance_level` | int NOT NULL default 0 | 강화 레벨(무제한, 하한 0) |
| `transcend_level` | int NOT NULL default 0 | 초월 레벨(무제한, 하한 0, BALANCE §2) |
| `transcend_progress` | int NOT NULL default 0 | 다음 초월까지 누적 중복(선형 T→T+1 = T+1개) |
| `max_enhance_level` / `max_enhance_reached_at` | int / timestamptz | 역대 최고 강화(lifetime) + 최초 달성 시각 |
| `max_transcend_level` / `max_transcend_reached_at` | int / timestamptz | 역대 최고 초월(lifetime) + 최초 달성 시각 |
| `equipped_slot` | enum(slot) null | 장착 시 해당 슬롯, 미장착 null |
| `first_acquired_at` | timestamptz default now() | 도감 해금(획득) 시각 |

- **UNIQUE** `(user_id, catalog_item_id)` — 카탈로그당 1레코드. 부분 인덱스 `(user_id, equipped_slot) WHERE equipped_slot IS NOT NULL`
- 등급·옵션·seed·전투력 컬럼 **없음**. 전투력은 `(enhance_level, transcend_level)`로 런타임 계산(BALANCE §3)
- **계정 '최고 도달'**(배틀패스 진행 기준) = `MAX(max_enhance_level)` / `MAX(max_transcend_level)`. 강화 완료 시 `GREATEST(max_enhance_level, 신규)` upsert(신규>기존일 때만 `reached_at=now()`), 자동 초월도 동일 패턴. 단조(강화 하락과 무관) — `lib/game/codex/max-reached.ts`.
- **아이템별 랭킹/챔피언**: catalog_item 단위 `max_enhance_level` DESC, `max_enhance_reached_at` ASC, `user_id` ASC → Top10. 1위 = 챔피언(`max_enhance_level > 0`). 결정적·확률 없음(BALANCE §3.3).
- 전역 랭킹 3종(최고·합산·전투력)·총 전투력은 현재 레코드의 `enhance_level`/전투력 기준(강화 하락 즉시 반영) — lifetime(max_*)과 분리.

---

## 3. 강화 큐 & 감사 로그 (CLAUDE §6 — 서버 권위·멱등)

### 3.1 enhancement_jobs (진행 중 큐)

| 컬럼 | 타입 | 비고 |
|------|------|------|
| `id` | bigserial PK | |
| `user_id` | uuid FK→profiles | |
| `user_equipment_id` | bigint FK→user_equipment | 강화 대상 |
| `slot` | enum(slot) NOT NULL | lane 그룹 키 |
| `slot_lane` | smallint NOT NULL | 1\|2 — 부위당 2 lane(GDD §3.2) |
| `from_level` / `target_level` | int | target = from+1 |
| `base_rate_bp` | int NOT NULL | 등록 시점 baseRate 스냅샷(만분율, 공시·감사) |
| `duration_ms` | bigint NOT NULL | 등록 시점 산정 `d(target)`(BALANCE §1.1) |
| `started_at` | timestamptz default now() | |
| `complete_at` | timestamptz NOT NULL | 단축 시 갱신. 완료 판정 = `now() >= complete_at` |
| `total_reduced_ms` | bigint default 0 | 보석 단축 누적 |
| `status` | enum(`running`,`completed`,`cancelled`) default `running` | 조건부 전이 |
| `created_at` | timestamptz default now() | |

- **부분 UNIQUE** `(user_id, slot, slot_lane) WHERE status='running'` → lane 점유(SLOT_BUSY). 추가 `(user_equipment_id) WHERE status='running'` 중복 큐 차단
- 인덱스 `(status, complete_at)` — lazy/cron 정산. `(user_id, status)`
- 환산률·base_rate **등록 시점 스냅샷 영구**(소급 금지, CLAUDE §6.3)
- (A)등록→(B)완료(`for update`+`status='running'`조건부→`completed`)→(C)단축→(D)취소→(D+A)교체 단일 tx

### 3.2 enhancement_logs (감사 — append-only, 5년)

| 컬럼 | 타입 | 비고 |
|------|------|------|
| `id` | bigserial PK | |
| `user_id`·`user_equipment_id`·`catalog_item_id` | FK | |
| `from_level`·`to_level` | int | 결과 반영 |
| `result` | enum(`success`,`hold`,`down`,`mega`) | 성공+1 / 메가+2 / 유지 / −1 하락 (파괴 없음) |
| `base_rate_bp`·`effective_rate_bp` | int | 공시값 / 실제(base×경과÷총, BALANCE §1.2) |
| `elapsed_ms`·`duration_ms`·`reduced_ms` | bigint | |
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

## 4. 초월 (자동·무RNG)

박스로 같은 카탈로그 중복 획득 시 `user_equipment.transcend_progress` 누적 → 임계(선형 T→T+1 =
T+1개) 도달 시 **자동으로** `transcend_level +1`(다중 가능) + `max_transcend_level` 갱신 + 로그 =
박스 열기 단일 tx(CLAUDE §3.3). 상한 없음.

### 4.1 transcend_logs (append-only)

| 컬럼 | 타입 | 비고 |
|------|------|------|
| `id` | bigserial PK | |
| `user_id`·`user_equipment_id`·`catalog_item_id` | FK | 대상 |
| `from_t`·`to_t` | int | to = from+1 |
| `fodder_count` | int | 해당 단계 소모 중복 수 = to_t(BALANCE §2.1) |
| `created_at` | timestamptz | |

- 자동 초월 1단계당 1행. 박스 1개로 여러 단계 동시 발동 시 단계별 다행.

---

## 5. 보급 (보급 상자)

### 5.1 user_supply_boxes (미열기 인벤토리, 슬롯별 집계)

| 컬럼 | 타입 | 비고 |
|------|------|------|
| `user_id` | uuid FK→profiles | PK 일부 |
| `slot` | enum(slot) | PK 일부 — 무기/방어구/장신구 |
| `count` | bigint NOT NULL default 0 | 보유 미열기 수 |

- PK `(user_id, slot)`. 열기 = count−1 + 카탈로그 획득 or `transcend_progress+1`(자동초월) + 로그, 단일 tx

### 5.2 supply_open_logs (append-only 감사·공시 정합)

| 컬럼 | 타입 | 비고 |
|------|------|------|
| `id` | bigserial PK | |
| `user_id` FK · `slot` | | |
| `catalog_item_id` | int FK | 균등 추첨 결과(BALANCE §4.2) |
| `is_new` | boolean | 도감 신규 해금 여부 |
| `created_at` | timestamptz | |

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

## 12. 출석 캘린더 (28일 누적·반복)

GDD §7 · BALANCE §7. 1일 1회(KST 자정) 수령 — 누적 출석, 끊겨도 자리 유지.

### 12.1 user_checkin_state (1행/유저)

| 컬럼 | 타입 | 비고 |
|------|------|------|
| `user_id` | uuid PK FK→profiles ON DELETE CASCADE | |
| `day_progress` | smallint NOT NULL default 0 | 다음 받을 칸의 0-index 직전값(0~27). 1수령 후 +1, 28 → 0 롤 |
| `last_claimed_kst_day` | date null | KST 일자. 같은 KST day 재수령 차단 |
| `total_claimed_count` | bigint NOT NULL default 0 | 누적 수령 횟수(통계·표시) |
| `updated_at` | timestamptz default now() | |

- **PK = user_id** — 1행/유저 (UPSERT로 첫 수령 시 생성)
- **수령 다음 칸 계산**: 다음 칸 1-index = `(day_progress % 28) + 1`. claim 시 `day_progress = (day_progress + 1) % 28`
- 멱등 가드: `last_claimed_kst_day = (now() at time zone 'Asia/Seoul')::date` 비교(`for update` + WHERE 조건부)

### 12.2 checkin_claim_logs (append-only 감사)

| 컬럼 | 타입 | 비고 |
|------|------|------|
| `id` | bigserial PK | |
| `user_id` | uuid FK→profiles | |
| `kst_day` | date NOT NULL | (user_id, kst_day) UNIQUE — 일일 멱등 키 |
| `cycle_day` | smallint NOT NULL | 1~28 — 이 수령에서 매핑된 캘린더 칸 |
| `diamond_granted` | bigint NOT NULL default 0 | 다이아 지급 분량 |
| `boxes_granted` | jsonb NOT NULL default `'{}'::jsonb` | `{weapon?,armor?,accessory?}` |
| `claimed_at` | timestamptz default now() | |

- `UNIQUE (user_id, kst_day)` — DB 레벨 중복 수령 차단(보조 가드, 1차 가드는 state.last_claimed_kst_day)
- 5년 보관(감사 정책, GDD §8)

---

> 모든 도메인 = Drizzle 도메인별 스키마 파일(`lib/db/schema/*.ts`)로 1:1. 수치 기본값은 `BALANCE.md`, 행위 트랜잭션 규칙은 `CLAUDE.md §3·§6`.
