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

### 2.1 단일 경로 — TS 상수 (3종 전부)

`lib/game/test-mode.ts`

```ts
export const TEST_MODE = process.env.TEST_MODE === 'true';
export const TEST_REWARD_MULTIPLIER = TEST_MODE ? 5 : 1;
```

- 출석체크: `lib/game/checkin/claim.ts` 가 `TEST_REWARD_MULTIPLIER`로 보상 배수.
- 일일 우편: `lib/game/mailbox/daily.ts` 가 기본값(💎1,000 / 슬롯당 5장)에 배율을 곱해 payload 생성.
- 신규가입 보너스: `lib/game/server-select.ts` 의 `SIGNUP_DIAMOND`/`SIGNUP_BOX_PER_SLOT`이 배율을 곱함.
  가입 지급은 로그인 콜백의 `createCharacter`(TS)가 담당한다 — DB 트리거(`handle_new_user`)는
  0067 이후 **계정 행만 생성**하며 보너스를 지급하지 않는다.

> ⚠ **DB 측 배율 경로는 없다.** `0006`/`0007`/`0028` 등 트리거에 보너스 값을 넣던 구세대
> 매뉴얼 SQL은 현행 트리거(0067)와 호환되지 않는다 — **재적용 금지**. 재적용하면 트리거가
> 캐릭터+보너스를 선생성해 콜백 지급과 겹치는 이중 캐릭터/이중 보너스 버그가 재발한다.

---

## 3. 원복 절차

**Vercel 환경변수에서 `TEST_MODE`를 제거(또는 false)하고 재배포 — 이것 하나로 3종 전부 ×1 원복된다. DB 작업 없음.**

1. Vercel → Settings → Environment Variables → `TEST_MODE` 삭제.
2. 재배포(env 변경은 새 배포부터 적용).
3. 배포 즉시 출석체크·신규가입 ×1, 일일 우편은 다음 KST 자정 발송분부터 원복.

---

## 4. 검증

| 항목 | 확인 방법 | 기대값 |
|------|-----------|--------|
| 출석체크 | 배포 후 출석 1칸 수령 | 캘린더 표기값 그대로(×1) |
| 일일 우편 | 다음 KST 자정 이후 우편 확인 | 💎1,000 + 슬롯당 5장 |
| 신규가입 | 배포 후 신규 계정 가입 | 💎1,000 / 보급상자 슬롯당 10개 |

신규가입 검증 쿼리(임의 최근 가입자):

```sql
select c.diamond, b.slot, b.count
from characters c
join user_supply_boxes b on b.user_id = c.user_id and b.server_id = c.server_id
order by c.created_at desc
limit 9;
```

---

## 5. 주의사항

- **소급 없음**: 테스트 기간에 이미 ×5로 지급받은 유저의 재화는 회수하지 않는다. 원복은
  *원복 이후* 발생하는 보상에만 적용된다.
- **env는 배포 시점에 읽힌다**: `TEST_MODE`는 빌드/런타임 env라 삭제 후 재배포해야 반영된다.
  실운영에 env가 남아 있으면 faucet이 ×5로 계속 열린다(콜드스타트 경고 로그 외 자동 차단 없음) —
  출시 체크리스트에서 반드시 확인.
