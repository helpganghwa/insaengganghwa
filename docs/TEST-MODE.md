# 테스트 모드 — 보상 ×5 및 원복 절차

실운영(정식 출시) 전 테스트 기간 동안 일부 보상을 ×5로 지급한다. 본 문서는 그 범위와
테스트 종료 시 정상값으로 되돌리는 절차를 정의한다.

---

## 1. 범위

테스트 기간 ×5가 적용되는 보상은 **3종뿐**이다. 전부 TS 상수 `TEST_REWARD_MULTIPLIER`
한 곳으로 적용된다(가입 보너스는 0067 이후 트리거가 아니라 콜백 `createCharacter`가 지급).

| 보상 | 정상값 | 테스트값(×5) | 적용 메커니즘 |
|------|--------|--------------|--------------|
| 신규가입 보너스 — 다이아 | 💎 1,000 | 💎 5,000 | TS 상수 (`server-select.ts` SIGNUP_DIAMOND) |
| 신규가입 보너스 — 보급상자 | 슬롯당 10개 | 슬롯당 50개 | TS 상수 (`server-select.ts` SIGNUP_BOX_PER_SLOT) |
| 출석체크 보상 | ×1 | ×5 | TS 상수 `TEST_REWARD_MULTIPLIER` |
| 일일 우편 보급 | 💎 1,000 + 슬롯당 5장 | 💎 5,000 + 슬롯당 25장 | TS 상수 `TEST_REWARD_MULTIPLIER` |

그 외 보상(분해·레이드 참가/페이즈 드롭·친구 초대 등)은 테스트 모드와 **무관하게 정상값**으로
지급된다.

---

## 2. 적용 메커니즘

테스트 모드는 두 경로로 적용된다 — 원복도 두 경로를 각각 처리해야 한다.

### 2.1 TS 배율 — 출석체크 · 일일 우편

`lib/game/test-mode.ts`

```ts
export const TEST_MODE = true;
export const TEST_REWARD_MULTIPLIER = TEST_MODE ? 10 : 1;
```

- 출석체크: `lib/game/checkin/claim.ts` 가 `TEST_REWARD_MULTIPLIER`로 보상 배수.
- 일일 우편: `lib/game/mailbox/daily.ts` 가 기본값(💎1,000 / 슬롯당 5장)에 `TEST_REWARD_MULTIPLIER`를 곱해 payload 생성.
- `TEST_MODE = false`로 바꾸면 두 보상은 **코드 배포만으로 자동 ×1 원복**된다. DB 작업 불필요.

### 2.2 DB 트리거 — 신규가입 보너스

신규가입은 `auth.users` INSERT 트리거(`handle_new_user`)에서 처리되므로 TS 상수를 읽지 못한다.
어떤 트리거 버전이 DB에 적용돼 있느냐로 지급액이 결정된다.

| 매뉴얼 SQL | 트리거가 지급하는 값 | 용도 |
|-----------|---------------------|------|
| `lib/db/manual/0006_default_profiles.sql` | 💎 1,000 / 슬롯당 10개 | **정상값**(원복 대상) |
| `lib/db/manual/0007_test_signup_bonus.sql` | 💎 10,000 / 슬롯당 100개 | 테스트값(현재 적용 중) |

> `0007`의 테스트값은 정상값의 정확히 ×10이다. 두 파일은 신규가입 보너스 수치만 다르고
> 닉네임 생성·기본 프로필 시드 로직은 동일하다.

---

## 3. 원복 절차

테스트 종료 시 아래 두 단계를 **모두** 수행한다. 한쪽만 처리하면 보상이 어긋난다
(예: 코드만 원복하고 DB를 두면 신규가입은 여전히 ×10 지급).

### Step 1 — 코드 배포 (출석체크 · 일일 우편 원복)

1. `lib/game/test-mode.ts` 에서 `TEST_MODE`를 `false`로 변경.
2. 커밋 → `dev` → `master-dev` → `master` 배포.
3. 배포 즉시 출석체크는 ×1, 일일 우편은 다음 KST 자정 발송분부터 💎1,000 + 슬롯당 5장으로 원복.

### Step 2 — DB 트리거 원복 (신규가입 보너스)

`0006` 매뉴얼 SQL을 운영 DB에 재적용해 트리거를 정상값으로 되돌린다.

```bash
bun run scripts/apply-migration.ts lib/db/manual/0006_default_profiles.sql
```

> `apply-migration.ts`는 `DIRECT_URL`(Supabase 세션 풀러)로 단일 트랜잭션 안에서 적용한다.
> Supabase SQL Editor에 직접 붙여넣어 실행해도 동일하다.
> `0006`은 `create or replace` + 기본 프로필 백필이 멱등이라 재실행해도 안전하다.

---

## 4. 검증

| 항목 | 확인 방법 | 기대값 |
|------|-----------|--------|
| 출석체크 | 배포 후 출석 1칸 수령 | 캘린더 표기값 그대로(×1) |
| 일일 우편 | 다음 KST 자정 이후 우편 확인 | 💎1,000 + 슬롯당 5장 |
| 신규가입 | `0006` 적용 후 신규 계정 가입 | 💎1,000 / 보급상자 슬롯당 10개 |

신규가입 검증 쿼리(임의 최근 가입자):

```sql
select p.diamond, b.slot, b.count
from profiles p
join user_supply_boxes b on b.user_id = p.id
order by p.id desc
limit 9;
```

---

## 5. 주의사항

- **소급 없음**: 테스트 기간에 이미 ×10로 지급받은 유저의 재화는 회수하지 않는다. 원복은
  *원복 이후* 발생하는 보상에만 적용된다.
- **단일 DB**: 현재 prod/staging이 단일 Supabase를 공유하므로 Step 2는 1회 적용으로 양쪽에
  반영된다. 추후 DB를 분리하면 각 DB에 `0006`을 각각 재적용해야 한다.
- **순서 무관하나 둘 다 필수**: Step 1·2는 순서에 의존하지 않지만, 두 단계를 모두 끝내기 전까지는
  일부 보상이 ×10로 남는다.
