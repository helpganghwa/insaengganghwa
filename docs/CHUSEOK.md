# 한가위 이벤트 2026 — 강화 대회 · 송편

> 코드 정본: `lib/game/chuseok/config.ts`(기간·사다리·교환), `lib/game/chuseok/songpyeon.ts`(적립·수령·교환), 마이그레이션 `lib/db/manual/0213_chuseok_songpyeon.sql`. 이 문서는 규칙과 결정 기록.

## 1. 기간

| 구간 | 시각(KST) | 비고 |
|---|---|---|
| 출시·적립 시작 | 2026-09-24 00:00 (**확정**, 2026-09-22 사용자 결정) | 코드는 9/23 배포, 6종 노출·추첨은 서버 시각으로 정각에 열리고 크론(00:02~00:07)은 DB 플래그·공시 스냅샷만 뒷정리 |
| 대회·적립 마감 | 2026-09-30 23:59:59 | 이후 강화 성공은 송편이 되지 않는다 |
| 정산 | 10/1 어드민 확인 후 지급 | 순위 보상·칭호 |
| 결과 노출·수령·교환 마감 | 2026-10-03 23:59:59 | 남은 송편은 소멸(화면 안내) |

## 2. 송편 (강화 성공 적립) — 2026-09-22 사용자 확정

- 기간 중 **모든 아이템**의 강화 성공(mega 포함)마다 **도달 단계만큼** 송편이 쌓인다(세금식). 상한 없음.
- 표기는 1:1(단계 1 = 송편 1). 적립은 강화 **수령** 시점(서버 시계)에 사후처리로 붙는다 — 같은 잡은 원장 `ref='job:<id>'`로 한 번만.
- **도달 보상(사다리)** — 누적 총량 기준. 교환에 써도 줄지 않는다. 각 단계는 한 번만 받는다(상자는 3슬롯 균등).

| 도달 송편 | 💎 | 📦 |
|---:|---:|---:|
| 500 | 250 | 15 |
| 1,000 | 500 | 30 |
| 3,000 | 1,000 | 60 |
| 10,000 | 2,000 | 90 |
| 20,000 | 4,000 | 150 |
| 30,000 | 8,000 | 300 |

- **교환** — 사용 가능 송편(누적 − 교환에 쓴)으로. 1인 한도 없음(사용자 확정). 📦3 = 300송편(상자 1개 = 💎25 등가), 💎100 = 400송편.
- 지난주 실서버 분포(357명, 7일) 기준 추정: 사다리 💎815,000·📦37,140, 교환 상한 💎605,200 또는 📦24,294 — 순위 보상(💎510,000·📦9,180)의 약 3.2배(💎환산). 2026-09-22 규모 우려를 전달했고 사용자가 이 수치로 확정.

## 3. 화면

- `/event/chuseok` — 세그먼트 순위 | 송편. `?tab=songpyeon` 깊은 링크(홈 배너). 헤더 오른쪽은 초 단위 남은 시간(`N일 HH:MM:SS 남음`), 마감 뒤 `9/30 23:59 확정`.
- 순위 세그먼트(시안 `scripts/build-chuseok-board-mock.ts`): 장비 칩 6개(그림 + 내 등수/없음) → 장비 머리글(그림·이름·[보상 보기]) → 1~10등 표(아바타·닉네임·도달 시각·단계·보상) → 화면 아래 고정 내 자리 줄(다음 보상 구간까지 +N·[강화하러 가기], 장비가 없으면 '아직 이 장비가 없어요'). 보상표는 공통 팝업(ModalShell+ModalLayout), 칭호 열은 1~3등 '한정 칭호'만 표기.
- 팝업은 전부 공통 팝업(2026-09-22 사용자 지적). 송편 받기·교환은 낙관 갱신(즉시 반영, 실패 시 롤백).
- 송편 세그먼트: 누적·사용 가능 한 카드 → 도달 보상(세로 트랙, 받기) → 교환(상자·다이아 별도 버튼, 수량 팝업) → 마감 안내.
- 홈 배너: 평소 "한가위 강화 대회"(한옥 마당 배경, 초 단위 카운트다운) → 받을 도달 보상이 있으면 "송편 보상을 받을 수 있어요"(자줏빛 달 배경)로 바뀌고 송편 세그먼트로 간다.

## 4. 데이터

- `chuseok_songpyeon(user_id, server_id, total, spent)` — 지갑(캐시). `chuseok_songpyeon_ledger` — 정본(earn +, exchange −). `chuseok_songpyeon_claims(step)` — 수령 멱등.
- 다이아 원장 사유: `chuseok_ladder`(ref `step:<n>`), `chuseok_exchange`(ref `ex:<uuid>`).
- 서버별 귀속(캐릭터 자원과 같은 기준). 이벤트 종료 뒤 표는 남긴다(기록).

## 5. 아이템 6종 — 2026-09-22 확정

| code | 부위 | 이름 | 벌 |
|---|---|---|---|
| chuseok_moon_wand | 무기 | 달그림자 완드 | 한복(flower) |
| chuseok_jade_hanbok | 방어구 | 금박 꽃단 한복 | 한복 |
| chuseok_bok_pouch | 장신구 | 복주머니 | 한복 |
| chuseok_rabbit_pestle | 무기 | 보름달 떡메 | 달토끼(moon) |
| chuseok_rabbit_suit | 방어구 | 토끼 인형 옷 | 달토끼 |
| chuseok_rabbit_ears | 장신구 | 접힌 토끼 귀 머리띠 | 달토끼 |

- 정본 `lib/game/equipment/catalog-v6.ts`. 지역 '일반', 기존 아이템과 같은 취급(보급 균등 추첨 풀에 합류 → 슬롯당 40→42종, 아이템당 2.5%→약 2.38%).
- **개방 절차(§33)**: `seed-catalog`가 active=false로 삽입 → 운영자가 9/23 00:00 전 확률 공시 게시 → **9/24 00:00:00 KST 정각에 서버 시각으로 열린다**(`chuseokItemsOpen`: 확률 공시·도감이 읽는 `getActiveCatalog`와 보급 추첨 풀 `supply/open.ts`가 같은 판정, 2026-09-23 사용자 지적으로 크론 의존 제거). 예약 발행 크론(`lib/game/chuseok/open.ts`, 00:02~00:07)은 뒷정리 — active=true 기록·catalog 캐시 무효화·probability_snapshots(effective_at = 시작 정각) 기록. 도감 총수 같은 SQL `active` 집계는 크론이 켤 때까지 최대 7분 40종으로 보인다(허용). 스테이징은 SQL로 직접 켰고, 크론 경로는 로컬에서 스테이징 DB로 실행해 검증했다(09-23).
- 아틀라스 `build-sprite-atlas` ROWS 11(132칸). 토끼 귀 그림의 바닥 검은 선 2행은 사용자 결정으로 코드에서 지웠다(애니메이션 도입 시 재생성).

## 6. 강화 대회 — 순위·정산 (2026-09-22 확정)

- 아이템별·서버별 순위. **마감 시각의 단계**가 높은 순, 같으면 그 단계에 **먼저 도달한 사람**(장비의 마지막 강화 기록 시각, 없으면 획득 시각). 하한 없음(+0도 순위). `lib/game/chuseok/rank.ts`.
- 마감 시점 단계는 스냅샷 없이 `enhancement_logs`로 되짚는다(기준 시각 이전 마지막 기록의 to_level). 대회 중 현황판은 지금 기준.
- 정지·탈퇴 계정은 정산 시 제외하고 아래 순위가 승계(조회에서 거른다).
- 보상(아이템당): 1등 💎30,000·📦600 / 2등 💎20,000·📦300 / 3등 💎10,000·📦150 / 4~5등 💎5,000·📦90 / 6~10등 💎3,000·📦60. 상자는 3슬롯 균등.
- 칭호: 달토끼 벌 → 만월/반월/신월(`chuseok26_moon1~3`), 한복 벌 → 모란/작약/매화(`chuseok26_flower1~3`). **도달한 등수 이하 전부 지급**(1등이면 세 개, 2등이면 두 개).
- 정산: `/admin/chuseok`에서 서버별 [정산·지급](마감 뒤에만, 서버당 1회) → `chuseok_contest_results`(0214) 기록 + 순위 우편(발신 '한가위 강화 대회') + 칭호. 결과 화면은 10/3까지 이 표를 읽는다.

## 7. 우편·푸시 (2026-09-22 결정)

- 9/24·25·26 15:00 KST에 전 유저 우편 💎1,000·📦30(3슬롯 10개씩) + 푸시. 어드민 우편의 **예약 전송**(0123)으로 운영자가 등록한다(3통). 문안은 운영자 게시 초안 참조.

## 8. 배포 체크리스트 (9/23) — 2026-09-23 감사 반영

이 브랜치에는 10차 업데이트(feat/update-small-10, 마이그레이션 0206~0211)가 함께 들어 있어 프로덕션에는 **0206~0211·0213·0214가 모두 미적용**이다(0212는 적용됨, 재실행 금지). 순서를 어기면 로그인(0210)·결제 마일리지(0211)·예약 우편 크론(0208, 추석 우편 93~95 포함)·묶음 푸시(0206)가 깨진다. 대난투·점령전 크론(23:00~00:05)과 00:00 개방을 피해 **22:30 전에 코드 배포까지** 마친다. 적용 도구는 전부 `bun run scripts/apply-migration.ts <file> PROD_DATABASE_URL`(파일 전체가 한 트랜잭션, lock_timeout 없음 → 실행 직전 `pg_stat_activity`에 오래 열린 트랜잭션이 없는지 확인).

1. **병합**: `git merge --no-ff origin/master`(Play 결제 핫픽스 4건, 충돌 0 확인) → `bun run typecheck && bun run build` → master-dev 푸시 → 스테이징 health `dpl` 변경 확인.
2. **코드 전 마이그레이션(프로덕션)**: `0206_push_pending_server_key` → `0208_scheduled_mail_server` → `0210_server_recommended` → `0211_mileage_wallets` → `0213_chuseok_songpyeon` → `0214_chuseok_contest_results`.
3. **카탈로그 시드(프로덕션)**: `seed-catalog.ts`는 `DIRECT_URL ?? DATABASE_URL`(스테이징)만 읽으므로 셸에서 DIRECT_URL을 프로덕션 값으로 덮어 실행한다. 검증: 6종 행 존재·`active=false`, 슬롯별 활성 40/40/40, 전체 weapon 48·armor 42·accessory 42. **시드 → 배포 순서**를 지킨다(배포 뒤 시드하면 `active-catalog-v2` 캐시에 6종이 빠진 채 00:00을 넘겨 공시 40종·추첨 42종이 어긋나는 창이 생김. 어긋났으면 catalog 태그 revalidate).
4. **코드 배포**: `git push origin HEAD:master` → `vercel ls --prod` Ready → `https://ganghwa.app/api/health`의 `dpl`이 `dpl_5pTPL93…`에서 바뀌었는지 확인(인스턴트 롤백 이력이 있으면 자동 승격이 안 될 수 있음 → `vercel promote`).
5. **배포 직후**: `0211` 재실행(배포 창 사이 적립 보정, 멱등 — 직후 `mileage_wallets.balance`와 원장 합계 불일치 0건 확인: `select w.user_id from mileage_wallets w left join (select user_id, server_id, sum(delta) s from point_ledger where kind='mileage' group by 1,2) l using (user_id, server_id) where w.balance <> greatest(0, coalesce(l.s,0))`) → 프로덕션 `cron_heartbeats`에 `daily-stats` 행 `last_success_at=now()` upsert(없으면 워치독 오탐) → 로그인·결제 화면·`/event/chuseok`(개방 전이라 홈 리다이렉트)·예약 우편 93~95의 `server_id`(null=전 서버) 확인.
6. **9/24 00:00~00:10**: 보급 풀·확률 공시 42종(2.38%) 확인, 00:07까지 `probability_snapshots` 새 행(effective_at 9/24 00:00 KST, note "추석 6종 개방", `jsonb_typeof='object'`)과 `catalog_items` 6종 `active=true` 확인. 없으면 `scripts/record-probability-snapshot.ts --confirm`으로 수동 기록.
7. **안정 확인 뒤(9/24 낮 이후, 되돌릴 일이 없을 때)**: `0207_nickname_owner` → `0209_push_pending_pk_swap` 각 **한 번만**(0209는 재실행 시 실패, 둘 다 적용 뒤에는 옛 코드로 롤백 불가). 0207 직전에 대소문자만 다른 닉네임 쌍이 0건인지 확인(`select lower(nickname), count(*) from characters group by 1 having count(*) > 1` — 있으면 제외 제약 생성이 실패해 파일 전체가 롤백됨)하고, characters에 ACCESS EXCLUSIVE 잠금이 걸리므로 오래 열린 트랜잭션이 없을 때 실행. **2서버 오픈(open-server.ts)은 0209 뒤에만**(그 전엔 옛 PK가 살아 있어 다른 서버의 묶음 알림이 유실).
8. **스테이징 정리**: preview env `CHUSEOK_START_ISO` 삭제(`vercel env rm CHUSEOK_START_ISO preview master-dev`, 프로덕션엔 원래 없음), 스테이징 `seed-catalog`로 6종 이름 동기화, 테스트 픽스처 복원.
9. **운영자**: 확률 공시·업데이트/이벤트 공지 게시 확인(공지 #42·#43은 새 이름으로 이미 게시됨), 10/1 정산·지급, 10/3 종료.

**롤백**: 인스턴트 롤백 → health `dpl` 확인 → 9/24 00:02 이후라면 `update catalog_items set active=false where code like 'chuseok_%'` + catalog 태그 revalidate(옛 아틀라스에 그림이 없어 이미지가 깨짐). 0207·0209 적용 전이어야 안전하다. 롤백 중 옛 코드는 마일리지를 profiles.mileage에만 쌓으므로 표시가 어긋나며, 다시 배포할 때 0211을 한 번 더 돌린다. 배포 시점에 열려 있던 클라이언트는 채팅 실시간 토픽이 바뀌어 새로고침 전까지 60초 폴링만 받는다(데이터 영향 없음).
