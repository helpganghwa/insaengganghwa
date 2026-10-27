# 할로윈 이벤트 2026 — 강화 대회 · 사탕

> 코드 정본: `lib/game/halloween/config.ts`(기간·사다리·교환·대회), `candy.ts`(적립·수령·교환), `contest.ts`(순위·정산), `open.ts`(6종 개방), 마이그레이션 `lib/db/manual/0247_halloween_candy.sql`. 추석(docs/CHUSEOK.md)과 같은 뼈대이고, 이 문서는 다른 점과 결정 기록만 적는다.

## 1. 기간

| 구간 | 시각(KST) |
|---|---|
| 배포·확률 공시 | 10/27 12:00 전 (6종 active=false로 시드, 공시는 개방 24시간 전) |
| 개방·적립 시작 | 10/28 12:00 (서버 시각 게이트, 크론은 뒷정리) — 7일 진행(2026-10-27 확정) |
| 대회·적립 마감 | 11/4 11:59:59 |
| 정산 | 11/4 오후 어드민 확인 뒤 지급 |
| 수령·교환 마감 | 11/7 11:59:59 (마감 3일 뒤, 남은 사탕 소멸) |

스테이징은 preview env `HALLOWEEN_START_ISO`로 시작을 앞당겨 검증한다(프로덕션엔 두지 않는다).

## 2. 사탕 — 2026-10-20 확정

- 적립은 추석 송편과 같다: 기간 중 모든 아이템의 강화 성공(mega 포함)마다 도달 단계만큼, 상한 없음. 원장 `ref='job:<id>'`로 한 번만.
- 사다리 9단계·끝 15만. 단계 사탕의 10%를 💎, 0.3%를 📦로(끝까지 💎40,100·📦1,203).

| 도달 | 💎 | 📦 | 칭호 |
|---:|---:|---:|---|
| 1,000 | 100 | 3 | |
| 3,000 | 300 | 9 | |
| 7,000 | 700 | 21 | |
| 15,000 | 1,500 | 45 | |
| 25,000 | 2,500 | 75 | |
| 40,000 | 4,000 | 120 | |
| 60,000 | 6,000 | 180 | `halloween26_candy1` 시월의 마녀 |
| 100,000 | 10,000 | 300 | |
| 150,000 | 15,000 | 450 | `halloween26_candy3` 별사탕 |

- 칭호는 도달 보상 수령 트랜잭션에서 함께 지급(user_titles PK 멱등).
- 교환 = 추석과 같음(2026-10-23 확정): 📦3 = 300사탕, 💎100 = 400사탕, 한도 없음.
- 원장 사유: `halloween_ladder`(ref `step:<n>`), `halloween_exchange`(ref `ex:<uuid>`).

## 3. 강화 대회

- 순위 규칙·보상표·정산 방식은 추석과 같다(아이템별·서버별, 마감 시각 단계 → 먼저 도달 순, 1등 💎30,000·📦600 … 6~10등 💎3,000·📦60).
- 칭호는 3종(PUMPKIN KING `halloween26_rank1` · NOSFERATU `rank2` · PHANTOM `rank3`)을 아이템마다 다른 순서로 1·2·3등에 건다(2026-10-27 확정, 여섯 가지 순서를 하나씩 → 각 칭호가 1·2·3등에 두 번씩). 정본은 `HALLOWEEN_CONTEST_ITEMS[].titles`.
- 누적 규칙은 추석과 같다: 1등이면 그 아이템의 세 칭호 모두, 2등이면 2·3등 칭호, 3등이면 3등 칭호. 같은 칭호는 한 번만(user_titles PK).

| 아이템 | 1등 | 2등 | 3등 |
|---|---|---|---|
| 무기 1 | PUMPKIN KING | NOSFERATU | PHANTOM |
| 방어구 1 | NOSFERATU | PHANTOM | PUMPKIN KING |
| 장신구 1 | PHANTOM | PUMPKIN KING | NOSFERATU |
| 무기 2 | PUMPKIN KING | PHANTOM | NOSFERATU |
| 방어구 2 | NOSFERATU | PUMPKIN KING | PHANTOM |
| 장신구 2 | PHANTOM | NOSFERATU | PUMPKIN KING |
- 정산 함수 `settleContest`(우편 발신 '할로윈 강화 대회'). 어드민 정산 화면은 정산 시점에 붙인다(추석은 정산 뒤 제거).

## 4. 아이템 6종 — ⚠ 임시(2026-10-25)

`lib/game/equipment/catalog-v7.ts`. 스테이징 검증용으로 2차 후보(대장장이·유령 분장) 그림·이름을 넣었다. 세트가 확정되면 code·이름·로어·그림과 `HALLOWEEN_CONTEST_ITEMS`를 함께 바꾸고, 스테이징 DB의 임시 행은 지운다(보유 행이 있으면 먼저 정리).

| code | 부위 | 이름(임시) |
|---|---|---|
| halloween_smith_hammer | 무기 | 말하는 담금망치 |
| halloween_smith_apron | 방어구 | 손때 묻은 가죽 앞치마 |
| halloween_smith_scarf | 장신구 | 불똥 막이 두건 |
| halloween_ghost_basket | 무기 | 사탕 가득 호박 바구니 |
| halloween_ghost_sheet | 방어구 | 바닥에 끌리는 홑청 망토 |
| halloween_ghost_mask | 장신구 | 눈구멍 뚫린 유령 가면 |

슬롯당 42 → 44종(아이템당 약 2.38% → 약 2.27%). 아틀라스 ROWS 12(144칸).

## 5. 칭호 5종 — 2026-10-26 확정

순위 PUMPKIN KING · NOSFERATU · PHANTOM(§3 순서표), 사다리 6만 시월의 마녀 · 15만 별사탕. 전용 이펙트는 `components/title-fx.css`(hwpumpkin · hwnosferatu · hwphantom · hwwitch · hwstarcandy).

## 6. 화면

- `/event/halloween` — 세그먼트 강화 순위 | 사탕 교환(`?tab=candy`). 시작 전엔 홈으로.
- 홈 배너: 대회 문구 ↔ 받을 보상이 있으면 사탕 문구. 배경 그림·사탕 아이콘은 임시(그라데이션·SVG).

## 7. 보류·미정

- 할로윈 아바타 경연대회: 보류(2026-10-25 사용자 결정).
- 방문(트릭 오어 트릿)·서버 공동 목표: 미정.

## 8. 보급 우편 — 2026-10-27 확정

추석과 같은 보상, 할로윈(10/31) 앞뒤 3일 오후 3시: 10/30 · 10/31 · 11/1 각 💎1,000 · 📦30. 어드민 예약 우편으로 보낸다(코드 없음).
