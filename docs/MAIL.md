# MAIL — 우편함 시스템

> 운영자 공지·이벤트·시즌 보상의 통일 채널. 1인 운영 5년을 견디는 최소 복잡도 설계.

## 1. 목적

- **운영자 ↔ 유저** 비동기 보상·공지(점검 사과, 시즌 결과, 이벤트 등).
- **시스템 자동 알림**(레이드 6h 정산, 오프라인 강화 결과 — 별도 type 사용).
- 친구 선물 등 P2P는 v2.

## 2. 데이터 모델

### 2.1 `mailbox` (SCHEMA §7 확장)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | bigserial PK | |
| `user_id` | uuid FK profiles | 수신자 |
| `type` | enum | `enhance_result` / `raid_settlement` / `reward` / `notice` / `admin` |
| `title` | text | 카드 제목(짧게) |
| `body` | text | 본문(긴 설명) |
| `sender_label` | text | UI 발신자(`'운영자'` / `'시스템'` 등) |
| `payload` | jsonb | `{ diamond?: string|number, boxes?: { weapon?, armor?, accessory? } }` |
| `claimed_at` | timestamptz nullable | 수령 시점 — **null = 미수령**(멱등 키) |
| `expires_at` | timestamptz | 만료 시점 — default = `sent_at + 7d`(통일) |
| `created_at` | timestamptz | 발송 시점 |

인덱스: `(user_id, claimed_at)`, `(user_id, expires_at)`.

### 2.2 `mail_claim_logs` (감사)

| 컬럼 | 타입 |
|---|---|
| `id` | bigserial PK |
| `mail_id` | bigint FK mailbox |
| `user_id` | uuid FK profiles |
| `diamond_granted` | bigint default 0 |
| `boxes_granted` | jsonb default '{}' |
| `claimed_at` | timestamptz default now() |

claim 발생 시 1행 insert. mailbox 데이터가 cron으로 삭제되더라도 분배 추적 가능.

### 2.3 `profiles.is_admin` boolean default false

어드민 권한 1컬럼. 본인 계정만 SQL로 직접 true 설정.

## 3. 첨부 종류 (v1)

- **다이아**: 정수 ≥ 0 (bigint).
- **슬롯별 보급 상자**: `weapon`/`armor`/`accessory` 각자 정수 ≥ 0.
- (v2 후속) 초월석·제물·아이템 직접 지급 등.

payload 예시:
```json
{ "diamond": "500", "boxes": { "weapon": 5, "armor": 5, "accessory": 5 } }
```

## 4. 라이프사이클 / 트랜잭션

### 4.1 발송 (insert)

운영자(`/admin/mail`) 또는 시스템 트리거가 1 row insert. broadcast는 audience 기반 fan-out — 큰 발송은 청크(500/배치).

### 4.2 수령 (claim)

**멱등성 핵심** — 단일 SQL UPDATE 멱등 게이트:

```sql
UPDATE mailbox
   SET claimed_at = now()
 WHERE id = $1 AND user_id = $2
   AND claimed_at IS NULL
   AND expires_at > now()
 RETURNING payload;
```

- 0행 반환 = 이미 수령 / 만료 / 본인 아님 → `MAIL_NOT_AVAILABLE` (멱등 no-op).
- 1행 반환 시 payload 분배:
  - `update profiles set diamond = diamond + $diamond where id = $userId`
  - `insert into user_supply_boxes (user_id, slot, count) values ... on conflict do update set count = count + excluded.count`
  - `insert into mail_claim_logs (...)`
- 위 모든 작업 단일 트랜잭션(부분 실패 없음, CLAUDE §3.3).

### 4.3 일괄 수령

`claimAllUnclaimed()` — 미수령·미만료 mail 전부 위 절차 한 번에. 단일 SQL `UPDATE ... RETURNING *` + JS fold(diamond 합·boxes 슬롯별 합) → 단일 트랜잭션.

### 4.4 만료

v1: lazy — 모든 조회에 `expires_at > now()` 필터. cron 없음.
v2: daily cron(`0 18 * * *` UTC = KST 03:00) 2조건 OR 삭제:
 - (a) 미수령 만료: `claimed_at is null and expires_at < now()` — 미수령은 **만료로만** 삭제.
 - (b) 보관정리: `claimed_at is not null and created_at < now() - interval '30 days'` — **수령완료분만** 30일 후 정리.
 미수령 우편은 절대 (b)로 삭제되지 않음(만료 정책이 유일한 미수령 삭제 경로 → 보상 유실 방지).

## 5. UI 진입점

- **헤더 ✉️ 배지**: 미수령·미만료 카운트(3+는 `3+` 표기). layout 쿼리에 통합(N+1 X).
- **`/mail` 페이지**: 미수령 / 받은 탭, [받기] / [모두 받기]. 만료 임박(<24h) 빨강.
- **수령 모달**: 다이아·상자 아이콘 + 수량.

## 6. 어드민 (`/admin/mail`)

- layout 가드: `is_admin = true`만. 비-admin은 404 또는 홈 redirect.
- **단건 발송**: nickname 또는 userId 입력 → 1 row insert.
- **broadcast**: audience(전체 / 조건) → fan-out 청크. `mail_broadcasts` 로그(v2 추가).

## 7. 보안 / Rate Limit

- 모든 액션 서버 권위(CLAUDE §3.1).
- claim — 60/10s(rate limit bucket `mail`).
- 어드민 발송 — 1/3s(broadcast는 더 엄격).
- payload 검증: 다이아 ≤ 10⁹, 상자 ≤ 10⁴(악성 입력 차단).

## 8. 후속 (v2+)

- 만료 cron
- mail_broadcasts 감사
- 친구 선물 (P2P) — 일일 수령 한도, 친구 관계 검증
- 챔피언 자동 보상 (v1 도입 안 함, 사용자 결정)
- 일일 통계 리캡 메일 (§8.1 — 제안, 미확정)

### 8.1 일일 통계 리캡 메일 (제안 — 미확정)

KST 자정에 "어제의 인생강화" 요약을 우편으로 적재해 복귀를 유도하는 리텐션 장치.
시간기반 idle 루프에 부족한 **일일 심박(daily heartbeat) 터치포인트**를 채우는 목적.

**예시 톤**: "어제 전투력 **+1,240** 상승! 검이 **+37**을 돌파했어요. 강화 4번 시도(성공 2·유지 1·도전 1). 오늘도 인생강화 ⚔️"

**지표·데이터 출처**
- 강화 시도/성공/유지/하락 수 — `enhancement_logs`(append-only, `result`=success/hold/down/mega, `from/to_level`, `created_at`) 어제 KST group by. **정확·즉시 산출 가능**.
- 전투력 증감 — **현재 CP 스냅샷/이력 테이블 없음**. 총CP는 보유 카탈로그 중복제외 최고 인스턴스 합(×초월배수)이라 로그 레벨변화로는 부정확(분해·제물·초월 미반영). → **일일 CP 스냅샷 테이블 신설**(자정 총CP 저장 → 다음날 diff)이 정석. 추세 그래프·주간 요약으로 재사용 가능.
- 우편 적재(`mailbox` 정보성 메일, payload 비움)·KST 자정 크론(`0 15 * * *`)은 기존 인프라 재사용.

**핵심 함정 / 설계 요구**
- 시간기반이라 **하루 시도 수가 적음**(0~5건 흔함) → 일일 리캡이 얇을 수 있음. 헤드라인은 **전투력 증감**, 카운트는 보조. 콘텐츠 부족 시 **주간 다이제스트**로 승급 검토.
- **부정 프레이밍 주의**: 고강화 구간은 유지/하락 다수 → "하락 N번" 헤드라인 금지, "도전 N번"식 완화. 긍정/중립 톤.
- **활동 게이트**: 어제 활동(강화 완료 ≥1 등) 있는 유저만 발송 — "0번 시도" 리캡·휴면 유저 스팸 방지.
- **멱등**: 1/유저/KST일 가드(checkin식). 정보성 메일은 안읽음 뱃지 제외 또는 별도 타입으로 우편함 노이즈 억제. 7일 자동 만료.
- 보상: v1은 **무보상**(순수 정보+CTA)으로 경제 영향 0 검증 후 결정(일일 보급·출석과 중복 주의).

**연계**: 선택적 리캡 푸시(`push_daily` 토글 신설)로 발송 — 출석 캘린더 분석에서 지적된 "일일 복귀 푸시 부재"도 함께 해결.

**미결정**: 일일 vs 주간 카덴스 · CP 스냅샷 테이블 도입 시점 · 보상 유무 · 푸시 동시 도입 여부.

---

**관련 메모리**: [[insaengganghwa-project]] · [[db-provisioning-state]]
