# 포인트 상점 (대난투 포인트 · 마일리지) — 설계

> 2026-09-08 확정(검토 폼 3회). 상점에 "포인트" 탭을 두고 두 재화의 잔액·적립 내역을 보여 준다. **판매 상품은 아직 없다("준비중")** — 이 문서는 지갑·적립·표시까지의 1차 범위다. 실제 상품과 소비 트랜잭션은 후속.

## 1. 재화

| | 대난투 포인트 | 마일리지 |
|---|---|---|
| 단위 | 서버별(`characters.melee_points`) | 계정(`profiles.mileage`) |
| 적립 | 대난투 발표(reveal) 때 **순위 포인트와 같은 수치**(`meleePointsForRank`), 감쇠 없음 | 결제 완료(`completePurchase` paid 전이) 때 **100원당 1점**(`MILEAGE_KRW_PER_POINT`, = 1%) |
| 회수 | 없음 | 환불 확정(`refundPurchase`) 때 그 주문의 적립분. 잔액이 모자라면 있는 만큼만 빼고 부족분을 원장 note에 기록(다이아 회수 원칙과 동일) |
| 소급 | 오픈(8/24) 이후 참가 기록 전부 | 오픈 이후 결제 전부(환불 주문은 적립+회수 쌍) |
| 랭킹과의 관계 | 리더보드 '대난투'(14일 반감 감쇠)는 그대로. 지갑은 **별도 잔액** | 후원 감사 보급(누적 결제 구간)과 별개 |

지급 보류 주문(미성년 한도·특가 중복, `grant_skipped`)도 결제 자체는 성사됐으므로 마일리지는 적립하고, 환불되면 회수한다.

## 2. 저장 (0197)

- `point_ledger(id, user_id→profiles cascade, server_id, kind 'melee'|'mileage', delta, note, ref, created_at)` — **정본**. `(kind, ref)` 부분 유니크 = 멱등 키: `melee:<battle_id>:<user_id>` / `order:<id>` / `order:<id>:refund`. 마일리지 행은 server_id null.
- 잔액 컬럼은 캐시: `characters.melee_points`, `profiles.mileage`. 소급 스크립트가 원장 합으로 다시 세운다.
- 탈퇴: 원장 삭제 + 마일리지 0(profiles는 결제 앵커라 유지). characters 삭제로 대난투 잔액은 함께 사라짐.
- 소급: `bun run scripts/points-backfill.ts [--apply] [DB_URL]` — dry-run 기본. created_at은 발표 시각/결제 시각으로 적어 화면 날짜가 맞는다.

## 3. 코드

- `lib/game/points/wallet.ts` — `creditMeleePoints`(tx, 멱등) · `creditMileageForOrder` · `revokeMileageForOrder` · `getPointsOverview`(잔액 2종 + 최근 3건씩).
- 훅: `lib/game/melee/reveal.ts`(리더보드 증분 뒤, 별도 tx, 실패 흡수) · `lib/payment/purchase.ts`(월누적 upsert 직후 — 잠금 순서 iap_orders → monthly → **profiles** → battlepass → characters) · `lib/payment/refund.ts`(같은 자리에서 회수) · `lib/game/account/withdraw.ts`.
- 순수: `lib/game/points/types.ts`(타입·**안내 문구 정본** POINTS_COPY) · `lib/game/balance.ts`(`MILEAGE_KRW_PER_POINT`, `mileageForKrw`).

## 4. 화면 (상점 "포인트" 탭 — 시안 V5 + 최근 적립)

- 상점 탭 5개: 일일·주간·월간·충전·**포인트**(딥링크 `?tab=points`). 헤더에는 두 재화를 표시하지 않는다(사용자 확정).
- 탭 안: **두 칸 지갑 버튼**('대난투 포인트' / '마일리지' — 이모지 없음)이 곧 세그먼트. 선택 칸은 금색 테두리. 아래에 안내 한 줄(POINTS_COPY) → "최근 적립" 카드(3건: 날짜 · note · ±점수) → 가운데 회색 "준비중" 글자.
- 문구: 대난투 "매회 대난투 결과 순위에 따라 쌓입니다." / 마일리지 "결제 금액의 1%가 쌓입니다."
- 상품 카드·격자·안내 카드는 쓰지 않는다(1차 검토에서 전부 리젝). 상품이 정해지면 "준비중" 자리를 카드 목록으로 교체.

## 5. 검증·후속

- `tests/points/wallet.test.ts` — 적립률 순수 + DB 통합(대난투 멱등·마일리지 적립/회수/부족분·개요 3건).
- 확률형 아이템 아님 → 공시 변경 없음. 위키 상점 문서에 적립 규칙 한 절.
- 후속: 상품(펫 생성·아바타 꾸미기·마일리지 전용)·소비 트랜잭션(`walletTrySpend` 대응)·전체 내역 보기·어드민 조정.
