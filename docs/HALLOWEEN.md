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
- **장비 교환(2026-10-27 확정)**: 할로윈 6종을 사탕 **100개에 1개**(상자 1개 교환과 같은 값)씩 받는다. 받는 처리는 보급 개봉과 똑같다(`applyCatalogPicks`·`afterPicksApplied`를 공유 — 미보유 획득 T0, 보유 시 진행도 +1·자동 초월·초월 로그·이정표·랭킹 갱신). 강화 단계는 건드리지 않는다. 다만 순위에는 하한이 없어(rank.ts) 교환으로 처음 받은 장비도 보급으로 받은 것과 똑같이 +0 참가자로 순위에 들어간다(마감 전 획득분).
  - 상한: 교환 뒤 그 장비의 초월 단계가 **내가 가진 장비 중 최고 초월(같은 서버)**을 넘을 수 없다(`allowedItemCopies`: 미보유 = 획득 1 + 그 단계까지 채우는 개수, 보유 = 지금 단계·진행도에서 그 단계까지). 내 최고가 T0이면 미보유 장비만 1개. 서버가 반영 직전에 다시 계산한다.
  - 정본 `lib/game/halloween/item-exchange.ts`(순수)·`exchangeCandyForItem`(candy.ts)·액션 `exchangeCandyItemAction`. 원장 note `<이름> N개 교환`, ref `ex:<uuid>`.

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

## 4. 아이템 6종 — 2026-10-27 확정

`lib/game/equipment/catalog-v7.ts`. 그림·해방 애니는 `scripts/gen-halloween-cand.ts` 후보에서 왔다(`scripts/catalog-v3-codemap.json`으로 code에 연결 → `build-item-anim`·`build-sprite-atlas`). 이름·로어·애니는 리뷰 아티팩트에서 확정.

| code | 부위 | 이름 | 후보 |
|---|---|---|---|
| halloween_smith_hammer | 무기 | 말하는 담금망치 | hw2_smith_hammer |
| halloween_smith_apron | 방어구 | 장인의 앞치마 | hw5_smith_apron |
| halloween_smith_scarf | 장신구 | 장인의 두건 | hw9_smith_kerchief |
| halloween_vamp_parasol | 무기 | 레이스 박쥐 양산 | hw9_vamp_parasol |
| halloween_vamp_cape | 방어구 | 박쥐 백작 망토 | hw5_vamp_cape |
| halloween_vamp_tophat | 장신구 | 박쥐 미니 실크햇 | hw7_vamp_tophat |

슬롯당 42 → 44종(아이템당 약 2.38% → 약 2.27%). 아틀라스 ROWS 12(144칸).
스테이징 DB의 임시 시절 행(halloween_ghost_basket·sheet·mask)은 2026-10-27 정리했고(참조 0건 확인 뒤 삭제) 확정 6종을 시드했다. 프로덕션에는 임시 행이 들어간 적이 없다.

## 5. 칭호 5종 — 2026-10-26 확정

순위 PUMPKIN KING · NOSFERATU · PHANTOM(§3 순서표), 사다리 6만 시월의 마녀 · 15만 별사탕. 전용 이펙트는 `components/title-fx.css`(hwpumpkin · hwnosferatu · hwphantom · hwwitch · hwstarcandy).

## 6. 화면

- `/event/halloween` — 세그먼트 강화 순위 | 사탕 교환(`?tab=candy`). 시작 전엔 홈으로. 2026-10-27 UI: 페이지 밤보라 톤(#0f0b16·카드 #1a1424), 헤더 뒤 호박밭 그림, 남은 시간 칩(대회 주황·결과 보라), 사탕 카드 진행 바, 사다리 '사탕 길'(호박 노드 `pumpkin-node.png`), 장비 교환 세트별 묶음 + 사탕 바구니 배경.
- 홈 배너: 대회 문구 ↔ 받을 보상이 있으면 사탕 문구. 배경은 `public/sprites/halloween/banner-contest.png`(호박밭)·`banner-candy.png`(사탕 바구니), 사탕 아이콘 `candy.png`(2026-10-27 확정, pixflux 후보는 `public/sprites/halloween-ui/`).

## 7. 보류·미정

- 할로윈 아바타 경연대회: 보류(2026-10-25 사용자 결정).
- 방문(트릭 오어 트릿)·서버 공동 목표: 미정.

## 8. 보급 우편 — 2026-10-27 확정

추석과 같은 보상, 할로윈(10/31) 앞뒤 3일 **저녁 8시**(2026-10-27 확정, 할로윈 분위기에 맞춰 저녁 시간대): 10/30 · 10/31 · 11/1 각 💎1,000 · 📦30, 푸시 켬. 어드민 예약 우편으로 보낸다(코드 없음). 문안(본문에 보상 수치 없음):

| 날짜 | 제목 | 본문 |
|---|---|---|
| 10/30 20:00 | 호박 등불이 켜졌습니다 | 대장간 문 앞에 잭오랜턴이 불을 밝혔습니다. 망치를 들면 사탕이 쌓입니다. |
| 10/31 20:00 | 트릭 오어 트릿 | 할로윈 밤입니다. 문을 두드릴 필요는 없습니다. 보급은 이미 우편함에 와 있습니다. |
| 11/1 20:00 | 마지막 사탕 봉지 | 호박 등불이 꺼지기 전에, 남은 사탕을 챙겨 가세요. 대회는 11월 4일 낮 12시 전까지입니다. |

- 프로덕션 예약 등록 완료(2026-10-27): `admin_scheduled_mails` #156(10/30)·#157(10/31)·#158(11/1), 전서버·푸시 켬·payload 💎1,000+📦30(3슬롯 10개씩). 발송은 `/api/cron/scheduled-mail`(5분)이 20:02쯤 처리. 취소·확인은 `/admin/mail` 예약 목록. 같은 저녁 18:00의 정시 보급(💎300, #143·#145·#147)과 별개로 둘 다 나간다.

## 9. 운영 절차 — 배포·개방·롤백 (2026-10-27)

**배포(10/28 12:00 전)**
1. `git fetch` 뒤 master가 feat/halloween의 조상인지 확인 → `bun run typecheck && bun run build` → `git status` 변경 0(빌드가 아틀라스·asset-versions를 다시 만든다).
2. 0247 적용: `bun run scripts/apply-migration.ts lib/db/manual/0247_halloween_candy.sql PROD_DATABASE_URL`(멱등, 새 표만 만들어 코드보다 먼저 적용해도 무해). `/admin/halloween`은 국면과 상관없이 결과 표를 읽으므로 **배포 전에** 적용한다.
3. 시드(프로덕션은 명령 앞에만 붙인다 — export 금지, 같은 셸의 테스트가 프로덕션을 향한다):
   `DIRECT_URL="$(grep '^PROD_DATABASE_URL=' .env.local | cut -d= -f2- | tr -d '"')" bun run scripts/seed-catalog.ts`
   실행 전 "프로덕션의 활성 code 중 CATALOG_ITEMS에 없는 것"이 0건인지 조회하고, 로그에 `[catalog] 비활성 전환`이 없어야 한다. 결과: 할로윈 6행 active=false, 슬롯별 활성 42/42/42.
4. `git push origin HEAD:master` → Vercel Ready → `/api/health`의 dpl 전환 확인(인스턴트 롤백 이력이 있으면 자동 승격이 안 되니 `vercel promote`).
5. 확인: `/event/halloween` → 홈으로 redirect, 홈에 배너 없음, `/probability` 42종(2.38%), `/sprites/halloween/*.png?v=` 200, `/admin/halloween` 열림, Production env에 `HALLOWEEN_START_ISO` 없음.

**12:00~12:10**
- 정각: `/probability` 슬롯당 44종(약 2.27%), 홈 배너·`/event/halloween` 노출, 보급 개봉에서 6종 등장(`supply_open_logs` 조인), 강화 수령 시 `halloween_candy_ledger`에 `job:` 행, `client_errors`/`recordError`의 `halloween-accrue` 0건.
- 12:07까지(크론 `scheduled-mail` 2-57/5분): `catalog_items`의 할로윈 6행 active=true, `probability_snapshots` 최신 행 effective_at=10/28 12:00·note '할로윈 6종 개방', 운영 경보 '할로윈 6종 개방 실패' 없음.

**크론 개방이 실패했을 때(수동)** — 노출·추첨은 서버 시각으로 이미 열려 있으니 기록·플래그 정리만 한다.
1. `update catalog_items set active = true where active = false and code like 'halloween_%'`
2. 관리자 탭 콘솔에서 `await fetch('/api/admin/revalidate?tag=catalog', { method: 'POST' })`
3. 공시 스냅샷: `DIRECT_URL="<PROD>" bun run scripts/record-probability-snapshot.ts`로 44/44/44 확인 뒤 `--confirm --note="할로윈 6종 개방"`, effective_at은 SQL로 12:00으로 보정.

**롤백**
- 12:00 전: 코드만 되돌리면 된다(6종은 꺼져 있고 0247 표는 무해).
- 12:00 뒤: 옛 코드는 active=true인 6종을 풀에 넣지만 그림·이름이 없어 깨진다 → `update catalog_items set active=false where code like 'halloween_%'` + catalog revalidate. 롤백 중엔 사탕이 쌓이지 않고 소급되지 않는다. 새 코드가 살아 있는 동안은 플래그로 숨길 수 없다(시각 판정) — 긴급 시 Production env `HALLOWEEN_START_ISO`를 먼 미래로 두고 재배포(검증되지 않은 수단).
- 배포 직후 열려 있던 옛 탭은 아틀라스 좌표가 어긋나 장비 그림이 엉뚱하게 보일 수 있다(새로고침으로 해결, 추석 때와 같은 구조).

