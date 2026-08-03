# 정식 출시 작전 계획 — 2026년 8월

> CBT 종료(8/1 새벽)부터 정식 오픈(8/17 11:00)까지의 **확정 일정·명령·안전 로직**.
> 일반 절차의 상세(가드·검증 표)는 `docs/CUTOVER-LIVE.md`(런북)가 정본이고,
> 이 문서는 그 런북을 이번 출시의 실제 날짜와 확정값으로 인스턴스화한 실행 계획이다.

---

## 0. 확정 파라미터

| 항목 | 값 |
|---|---|
| CBT 종료 | **8/1(금) 00:30경** — 공지는 "8월 1일 새벽"으로만(정각 약속 금지) |
| 정식 오픈 | **8/17(월) 11:00 KST** — `app/login/CbtEndedNotice.tsx OPEN_AT_ISO` 카운트다운과 일치 |
| 오픈 유보 | 카드사 심사 등 외부 절차 지연 시 연기 가능 — 공지에 유보 문구 고지됨. 연기 시 `OPEN_AT_ISO`·공지 갱신 |
| 감사 보상 | **기본 1,000💎 + 합산강화 × 0.5(내림)** — `scripts/cbt-snapshot.ts` 상수. 총 ≈ 36.9만💎/241명 |
| 이월 범위 | 닉네임(캐릭터 사전 생성) + 감사 보상 + 초대 보상. **아바타·진행도 이월 없음** |
| 유저 약속(공지 게시됨) | 데이터 초기화·닉네임 유지·보상은 오픈 때 우편·초대 실적 재지급·오픈 알림 |

## 1. 상태 기계 — 한 장 요약

```
live ──(1단계)──▶ maintenance ──wipe──▶ cbt_ended ──(2단계)──▶ maintenance ──wipe+restore──▶ cbt_ended ──8/17 11:00──▶ live
```

| 모드 | 일반 유저 | 어드민 | 심사(cbt) 계정 | 자동으로 잠기는 것 |
|---|---|---|---|---|
| `maintenance` | 차단(점검 화면) | 화면만(액션 차단) | 차단 | 전 유저 변이 액션 |
| `cbt_ended` | **로그아웃 + 종료 화면**(카운트다운·오픈 알림) | 정상 플레이 | 정상 플레이(결제 포함) | ① lazy 이월 지급(`grant.ts`) ② `push-daily-supply` ③ `melee-run`·`melee-reveal` ④ 카카오 로그인(어드민 외 콜백 차단) |
| `live` | 정상 | 정상 | 정상 | 없음 — 게이트 전부 자동 해제 |

게이트가 **코드 안**에 있으므로 크론은 전 기간 켜둔 채 운영한다(wipe 창 제외).
모드 전환만이 스위치다 — 오픈 순간 별도 크론 작업이 없다.

## 2. 1단계 — CBT 종료·동결 (8/1 00:30경)

사전: 종료 공지 게시 + 오늘의 보급 푸시 발송(완료 여부 확인).

```bash
set -a && source .env.local && set +a
```

| # | 작업 | 명령/방법 |
|---|---|---|
| 1 | 결산 수치 최종 조회 | 아래 §2.1 SQL → `CbtEndedNotice.tsx STAT` 7종 갱신 → 커밋 → **배포**(마지막 코드 배포) |
| 2 | 크론 정지 | Vercel 대시보드 → 프로젝트 → Settings → **Cron Jobs → Disable** (시크릿 회전은 재배포 타이밍 문제로 금지) |
| 3 | 점검 ON | `/admin/maintenance` 에서 `maintenance` 전환 (스크립트 가드 요구 + wipe 중 동시 쓰기 차단) |
| 4 | 실결제 부재 확인 | `select count(*) from iap_orders where status in ('paid','refunded');` → 0 확인(0 아니면 런북 §2) |
| 5 | 이월 스냅샷 | `bun run --env-file=.env.local scripts/cbt-snapshot.ts` 드라이런 확인 → `--confirm` |
| 6 | 전체 백업 | `/opt/homebrew/opt/libpq/bin/pg_dump "${PROD_DATABASE_URL/6543/5432}" --no-owner -Fc -f ~/cbt-final-$(date +%Y%m%d).dump` (세션 풀러 :5432 — 트랜잭션 풀러로는 불가) |
| 7 | 1차 wipe | `bun run scripts/cutover-live.ts --db=prod` 드라이런 → `--confirm` (결제 테이블 **포함** 전체) |
| 8 | 종료 모드 | `update system_mode set mode='cbt_ended', scheduled_from=null, scheduled_until=null, note='CBT 종료', updated_at=now() where key='global';` |
| 9 | 크론 재개 | Vercel Cron Jobs → Enable → **§8.7 표와 20개 대조**(일부만 켜진 상태가 가장 늦게 발견된다) |
| 10 | 검증 | ganghwa.app/login = 종료 화면 · `?test=true` 로그인 가능 · 일반 카카오 차단 확인 |

**복원(cbt-restore)은 실행하지 않는다** — 2단계 몫.

### 2.1 결산 수치 조회 SQL (STAT 7종)

```sql
select count(*) from characters;                                  -- smiths
select count(*) from supply_open_logs;                            -- boxes
select count(*),                                                  -- hammered
       sum(case when result in ('success','mega') then 1 else 0 end),  -- sparks
       sum(case when result='hold' then 1 else 0 end)
         + sum(case when result='down' then 1 else 0 end)         -- tempered(유지+하락)
from enhancement_logs;
select max(max_enhance_level) from user_equipment;                -- peak
select count(*) from conquest_battles where winner_guild_id is not null;  -- flags
```

## 3. 테스트 기간 (8/1 ~ 8/16)

- 어드민·심사 계정으로 자유 테스트 — **흔적은 2차 wipe가 전부 지운다**(캐릭터·우편·랭킹·아바타).
- 카드사 심사 대응: 승인 회신 오면 결제 E2E(결제→지급→콘솔 취소→회수) 완주. 실결제 기록은 2차에서 보존됨.
- 8/7~8 새벽: **Supabase Compute Small→Medium** (ROADMAP §2 #11 — 재시작 동반).
- 오픈 연기 판단: 카드사 심사 ETA 회신 기준. 연기 시 `OPEN_AT_ISO` 수정·배포 + 공지 갱신.

## 4. 2단계 — 출시 (8/16(일) 밤 → 8/17(월) 11:00)

| # | 작업 | 명령/방법 |
|---|---|---|
| 1 | 크론 정지 | Vercel Cron Jobs → Disable |
| 2 | 점검 ON | cbt_ended → `maintenance` (가드 통과 + 어드민·심사 동시 쓰기 차단 — cbt_ended는 이 둘을 막지 않는다) |
| 3 | 2차 wipe | `bun run scripts/cutover-live.ts --db=prod --keep-payments --confirm` — **플래그 필수**(테스트 실결제·본인인증 5종 = 전자상거래법 5년 보존) |
| 4 | 복원·보상 지급 | `bun run --env-file=.env.local scripts/cbt-restore.ts --db=prod` 드라이런 → `--confirm` (캐릭터 241 + 우편 3종: 특별 보상·초대 이월·환영) |
| 5 | 종료 모드 복원 | `update system_mode set mode='cbt_ended' ... ;` (오픈 전까지 종료 화면 유지) |
| 6 | 크론 재개 | Enable → **§8.7 표와 20개 대조**. 8/17 아침 대난투(09:00)·보급 푸시는 cbt_ended 게이트가 자동 skip |
| 7 | env·값 정리 | `TEST_MODE` 삭제(배율 ×1) · `PAYMENTS_OPEN=true`(카드사 심사 완료 시에만) · `GUILD_REJOIN_LOCK_HOURS` 1→24 커밋 · 재배포 |
| 8 | 확률 공시 | `bun run scripts/record-probability-snapshot.ts --note="정식 오픈" --confirm` |
| 9 | 서버명 | `update servers set name='1서버' where id=1;` |
| 9.5 | **공지 정리** | `/admin/announcements` — **CBT 기간 공지 8건은 wipe 대상이 아니라 그대로 남는다.** 신규 유저에게 보일 필요 없는 것(CBT 종료 안내·테스트 공지 등)을 삭제/비활성하고, 오픈 공지만 남긴다. 삭제 시 `announcement_poll_votes`(93행, CBT 투표)도 CASCADE로 함께 정리됨 |
| 10 | **오픈 (11:00)** | `update system_mode set mode='live' ... ;` → 오픈 공지 게시 |
| 11 | 오픈 푸시 | `bun run scripts/open-push-broadcast.ts --db=prod` 드라이런 → `--confirm` (전 구독: CBT 유저 + 종료 화면 익명 신청자) |
| 12 | 검증 | 런북 §7 표 + 첫 유입 모니터링(에러·풀 지연) |

## 5. 왜 이 구조인가 (로직 근거)

1. **복원을 출시 직전으로 미루는 이유** — 테스트 흔적이 오픈 월드에 남지 않고, 보상 우편이 오픈 순간 도착하며, 1차 복원분이 2차 wipe로 증발하는 사고가 구조적으로 불가능.
2. **lazy 지급 차단(cbt_ended)** — 어드민·심사 접속이 `granted_at`을 소진하면 2차 복원에서 스킵돼 보상이 증발한다. 게이트가 이 경로를 봉쇄.
3. **`--keep-payments`** — 2차 시점엔 심사 실결제(paid/refunded)가 존재. `iap_orders`·`iap_refunds`·`identity_verifications`·`monthly_purchase_limits`·`payment_alerts` 5종 보존.
4. **크론 게이트 3종** — 잠긴 유저에게 보급 푸시가 가거나(대상이 profiles×push_subscriptions — 접속 가능 여부와 무관 발송) 유령 대난투가 쌓이는 것을 코드에서 차단. 덕분에 크론 재개 타이밍을 오픈 시각과 맞출 필요가 없다.
5. **wipe 창의 maintenance** — 스크립트 가드 요구이자, cbt_ended가 막지 않는 어드민·심사의 동시 쓰기(복원 시 PK 충돌 위험)를 차단.
6. **결산 수치는 상수 고정** — wipe 후엔 원본이 사라지므로 스냅샷일 수밖에 없고, 로그인 화면에 DB 왕복을 더하지 않는다.

## 6. 롤백

- **1차 wipe 사고**: `~/cbt-final-*.dump`에서 복원 — `/opt/homebrew/opt/libpq/bin/pg_restore --clean --if-exists --no-owner -d "${PROD_DATABASE_URL/6543/5432}" ~/cbt-final-YYYYMMDD.dump` (점검 ON 상태에서).
- **2차 wipe 사고**: 이월 원장(`cbt_carryover`)과 결제 기록은 보존돼 있으므로 재-wipe 후 재복원으로 수렴. 복원 실패 유저는 오픈 후 lazy 지급(live 모드라 자동 재개)이 백스톱.
- **오픈 연기**: `system_mode='cbt_ended'` 유지 + `OPEN_AT_ISO` 수정·배포 + 공지 갱신이 전부 — 다른 되돌림 없음.

## 7. 도구·전제 확인 (2026-07-31 검증 완료)

- `pg_dump`/`pg_restore` 18.4: `/opt/homebrew/opt/libpq/bin/` (brew libpq)
- 프로덕션 세션 풀러 URL = `PROD_DATABASE_URL`의 포트 `6543→5432` 치환
- 크론 정지는 **대시보드 Disable만** 사용 — CRON_SECRET 회전은 env가 배포에 박히는 구조라 회전~재배포 사이 동작이 불명확
- 심사 로그인(`/login?test=true`)·심사 결제(본인인증 면제)는 전 기간 유지

## 8. 출시 전 잔여 작업 (8/1 ~ 8/16)

> CBT 종료 후 오픈까지 처리할 일. **차단**은 미완 시 오픈을 미뤄야 하는 것, **중요**는 오픈 품질에 직결, **선택**은 오픈 후로 미룰 수 있는 것.

### 8.1 차단 (미완 시 오픈 불가)

| # | 작업 | 비고 |
|---|---|---|
| B1 | **결제 E2E 완주** | 카드사 심사 승인 → 실결제 → 지급 확인 → 콘솔 취소 → 회수 확인. 미완 시 `PAYMENTS_OPEN` 미설정으로 상점만 숨기고 오픈하는 백업 플랜 가능 |
| B2 | **Supabase Compute Small → Medium** | 8/7~8 새벽(재시작 동반). 동접 500 대비 — ROADMAP §2 #11 |
| B3 | **외부 uptime 모니터 배선** | `https://ganghwa.app/api/health/deep` 1~5분 GET, 비200/도달불가 알림(UptimeRobot 등). 런북 §7.5 — 미실행 상태 |
| B4 | **아이템 14종 추가(106 → 120)** | 스프라이트(Pixellab)·로어·세트 배치까지. 현재 무기 32·방어 38·장신구 36 |
| B5 | **Vercel Cron Jobs 재활성 확인** | 컷오버마다 대시보드에서 **수동으로** 껐다 켜는 토글이라 잊기 쉽다(코드·env에 흔적이 남지 않아 리뷰로도 안 잡힌다). 꺼진 채 오픈하면 강화 완료 푸시·레이드 정산·대난투·점령전·랭킹 스냅샷이 **전부 멈춘 채로 서비스가 돌아간다**. 오픈 직후 §8.7 표와 대조해 20개 전부 Enabled인지 눈으로 확인 |

### 8.2 중요 (오픈 품질)

| # | 작업 | 비고 |
|---|---|---|
| I1 | **콜드스타트 플레이북** | 유저 0명 월드를 채우는 게임 내 장치(첫 길드 유도·초대 보상 강화 등). ROADMAP §2 #8 — 5회째 이월된 항목 |
| I2 | **위키 갱신** | CBT 중 대규모 변경(길드 전면 개편·권한 위임·점령전 B안·채팅) 반영. 신규 유저의 유일한 안내서 |
| I3 | **SEO·랜딩 점검** | 게임 소개 h1은 `live` 복귀 시 자동 노출되나 **오픈 후 실제 렌더 확인 필수**. OG 이미지·메타 점검 |
| I4 | **오픈 푸시 브로드캐스트 리허설** | `scripts/open-push-broadcast.ts --db=staging --confirm`으로 1회 검증(문구·도달) |
| I5 | **Upstash 레이트리밋 플랜 점검** | CBT에서 무료 50만 커맨드 도달 경험 — 초과 시 리밋 전면 fail-open. 콘솔 사용량 확인 후 유료 전환 판단 |
| I6 | **Realtime 동시연결 쿼터** | Pro 500 동시연결 = 동접 500과 정확히 겹침. 상향 또는 '패널 열림에만 구독' 전환 검토 |
| I7 | **업데이트 노트 작성** | 직접 작성(수기) |

### 8.3 신규 개발 (여력 되는 만큼)

| # | 작업 |
|---|---|
| D1 | 레이드 친구 초대 개편(특정 인원 지목 초대) |
| D2 | 칭호 시스템 |
| D3 | 위키 확장(I2와 별개 — 신규 문서) |

### 8.4 폐기·확정

- **라이트 구독(ROADMAP #9)**: 폐기(2026-07-31). 성장 프리미엄(`PREMIUM`)이 그 역할을 대신한다.
- **테스트 로그인(ROADMAP #10)**: **제거하지 않고 현행 유지** — 스토어·게임위 재심의 상시 대응(사용자 확정). 비밀번호·경로 변경도 하지 않는다.

### 8.5 홍보 (오픈 전 준비 → 오픈일 집행)

| 채널 | 준비 사항 |
|---|---|
| 커뮤니티 | 게시글 초안·타깃 커뮤니티 선정·계정 준비 |
| 카카오 비즈 | 비즈니스 채널 개설·메시지 소재 |
| 인스타그램 광고 | 광고 계정·소재(이미지/영상)·타깃·예산 |

> 오픈 알림 푸시(종료 화면 신청자 + CBT 유저)는 §4-11에서 집행 — 홍보 채널과 별개의 자체 자산.

### 8.6 어드민·잔여 데이터 초기화 점검 (2026-07-31 전수 대조 완료)

전체 80개 테이블을 `WIPE_TABLES`/`PROTECTED`와 대조해 **누락 8종을 발견·보강**했다(같은 날 커밋):

| 테이블 | 누락 시 증상 |
|---|---|
| `chat_messages`·`chat_blocks`·`chat_reports` | CBT 대화 256건이 오픈 첫날 채팅창에 그대로 |
| `challenge_claims`·`challenge_events` | 도전과제 진행·보상 이력 승계 |
| `guild_emblem_escrows` | 문양 생성 보류 다이아가 길드 wipe 후 고아로 잔존 |
| `admin_scheduled_mails` | CBT용 예약 우편이 오픈 후 발송되는 사고 |
| `user_daily_stats` | 일자별 개인 집계 승계 |

**검증**: 스테이징에서 67개 전 테이블을 단일 트랜잭션으로 delete 후 롤백 — FK 순서 정상 확인.

### 8.6.5 FK 인덱스 점검 (2026-08-01 완료 · 재발 방지 규칙)

Postgres는 FK 자식 컬럼에 인덱스를 **자동 생성하지 않는다.** 없으면 부모를 지울 때마다
자식 테이블을 통째로 순차 스캔한다 — CBT 컷오버에서 45만 행 삭제가 20분을 넘겨도 끝나지
않은 원인이었다(`gem_time_reductions.job_id`, 0147). 이후 FK 102개를 전수 점검해 12개를
보강했다(0148).

**앞으로 지킬 것**: FK를 새로 추가할 때 `on delete cascade|set null`이면 자식 컬럼 인덱스를
같은 마이그레이션에 넣는다. 부모가 운영상 삭제되지 않는 참조(`server_id`→servers,
`catalog_item_id`→catalog_items)는 예외 — 인덱스는 쓰기 비용만 늘린다.

**점검 쿼리**(FK 중 인덱스가 없고 부모 삭제형인 것):
```sql
select src.relname child, string_agg(att.attname,',' order by u.ord) cols, c.confdeltype del
from pg_constraint c
join pg_class src on src.oid=c.conrelid
join pg_namespace ns on ns.oid=src.relnamespace and ns.nspname='public'
join unnest(c.conkey) with ordinality u(attnum,ord) on true
join pg_attribute att on att.attrelid=src.oid and att.attnum=u.attnum
where c.contype='f' and c.confdeltype in ('c','n','d')
  and not exists (select 1 from pg_index i where i.indrelid=src.oid
    and (select array_agg(k order by n) from unnest(i.indkey::smallint[]) with ordinality t(k,n)
         where n <= array_length(c.conkey,1))
        = (select array_agg(k order by n) from unnest(c.conkey) with ordinality t2(k,n)))
group by src.relname, c.conname, c.confdeltype;
```

미보강 8개는 의도적 제외다 — 신고·차단·투표·본인인증처럼 상한이 낮게 유지되거나(스캔이
저렴), zones처럼 부모가 삭제되지 않는 것들이다.

### 8.7 Cron 정본 목록 (재활성 검증용 · vercel.json 기준 20개)

컷오버에서 Disable → Enable을 오가므로, **켜진 뒤 이 표와 하나씩 대조**한다.
개수만 세지 말고 경로까지 볼 것 — 일부만 켜진 상태가 가장 발견이 늦다.

| 스케줄(UTC) | 경로 | 멈추면 생기는 일 |
|---|---|---|
| `* * * * *` | `/api/cron/push-enhance-ready` | 강화 완료 푸시가 안 나감 |
| `* * * * *` | `/api/cron/warm` | 콜드스타트 증가(체감 지연) |
| `*/5 * * * *` | `/api/cron/settle-raid` | 레이드가 정산되지 않아 보상 미지급 |
| `*/5 * * * *` | `/api/cron/push-flush` | 묶음 푸시 전송 정지 |
| `*/10 * * * *` | `/api/cron/payment-recon` | 결제 대사 정지(지급 누락 감지 불가) |
| `1-59/2 * * * *` | `/api/cron/profile-poll` | 아바타 생성이 완료 처리되지 않음 |
| `2-57/5 * * * *` | `/api/cron/scheduled-mail` | 예약 우편 미발송 |
| `3-53/10 * * * *` | `/api/cron/guild-emblem-retry` | 실패한 문양 재생성 안 됨 |
| `7,22,37,52 * * * *` | `/api/cron/rank-leader` | 랭킹 1위 티커 정지 |
| `11 * * * *` | `/api/cron/leaderboard-snapshot` | 랭킹 스냅샷 갱신 정지 |
| `*/5 0 * * *` | `/api/cron/melee-run` | 대난투 미진행 |
| `*/5 1 * * *` | `/api/cron/melee-reveal` | 대난투 결과 미발표 |
| `*/5 14 * * *` | `/api/cron/conquest-run` | 점령전 미진행 |
| `0-55/5 15 * * *` | `/api/cron/conquest-chronicle` | 연대기 미생성 |
| `1 15 * * *` | `/api/cron/daily-stats` | 일일 통계 누락 |
| `40 15 * * *` | `/api/cron/guild-rank-achv` | 길드 랭킹 업적 미지급 |
| `5,35 15-23 * * *` | `/api/cron/push-daily-supply` | 일일 보급 푸시 안 나감 |
| `0 18 * * *` | `/api/cron/mail-expire` | 만료 우편 정리 안 됨 |
| `30 19 * * *` | `/api/cron/nickname-reclaim` | 탈퇴 닉네임 회수 안 됨 |
| `0 3 * * *` | `/api/cron/guild-leader-handover` | 장기 미접속 길드장 위임 안 됨 |

### 의도적 보존 전수 목록 (wipe 대상이 아닌 13종)

| 구분 | 테이블(현재 행) | 보존 이유 |
|---|---|---|
| **구조·필수** | `profiles`(270) | 계정 원본. 지우면 `cbt_carryover`가 CASCADE 전손 + `handle_new_user`는 auth.users INSERT에만 발화해 재생성 불가 |
| | `catalog_items`(106) | 장비 카탈로그 — 비면 `NO_CATALOG` 소프트락 |
| | `servers`(1)·`zones`(50)·`zone_adjacency`(65) | 월드 구조. 점령 상태만 리셋, 구역·인접 그래프 유지 |
| | `system_mode`(1) | 컷오버를 제어하는 스위치 자신 |
| | `schema_migrations`(144) | 마이그레이션 원장 |
| **법정 보존** | `probability_snapshots`(2) | 게임산업법 §33 확률 공시 영구 기록 — 삭제 금지 |
| | (2차) 결제·본인인증 5종 | 전자상거래법 5년 — `--keep-payments` |
| **이월·운영** | `cbt_carryover`(0→스냅샷이 채움) | 이월 원장 — wipe를 건너 살아남는 것이 존재 이유 |
| | `push_subscriptions`(53) | 오픈 알림 대상(CBT 유저 + 종료 화면 익명 신청자) |
| | `cron_heartbeats`(12) | 인프라 상태(유저 데이터 아님) |
| **⚠ 수동 정리 대상** | `announcements`(8) | CBT 공지가 오픈 후에도 공지함에 남는다. wipe에 넣지 않는 이유는 오픈 공지를 미리 작성해둘 수 있어야 하고 남길 공지 판단이 필요하기 때문 — **§4-9.5에서 수동 정리** |
| | `announcement_poll_votes`(93) | 공지 투표. 위 공지 삭제 시 CASCADE로 함께 정리 |

