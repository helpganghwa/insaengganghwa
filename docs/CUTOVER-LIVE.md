# CBT 종료 → 실운영 전환 런북

> CBT를 닫고 정식 오픈으로 전환하는 컷오버 데이 절차. 스크립트는 `scripts/cutover-live.ts`
> (CBT 시작 컷오버였던 `cutover-v3.ts`와 별개 — 카탈로그 재시드 없음, 아바타 삭제 확정).

---

## 0. 사전 완료 조건 (컷오버 데이 이전)

| 항목 | 확인 |
|------|------|
| GCRB 등급분류 취득 | 외부 절차 — 등급 표기 준비 |
| 포트원 본인인증 채널(PASS/KMC) 발급 | `NEXT_PUBLIC_PORTONE_IDENTITY_CHANNEL_KEY` 입력. **없으면 개방 후 전 유저 결제 불능** |
| 포트원 결제 env 4종 동시 입력 | `PORTONE_STORE_ID`·`CHANNEL_KEY`·`API_SECRET`·`WEBHOOK_SECRET` — 부분 설정 시 지급 검증 붕괴 |
| 포트원 콘솔 웹훅 URL | `https://ganghwa.app/api/webhooks/portone` + 운영 시크릿 |
| `CRON_SECRET` 프로덕션 설정 | 미설정 시 payment-recon 등 cron fail-closed |
| 통신판매업 신고 | 완료 후 `lib/legal/content.ts` `mailOrderNo` 기입 |
| 결제 E2E 1건 | 본인인증 → 주문 → 지급 → 환불 회수까지 테스트 채널로 검증 |
| 약관/개인정보 시행일 | 오픈일 기준 갱신 필요 여부 확인(`lib/legal/content.ts` LEGAL_META) |

## 1. 점검 모드 ON + 크론 정지

1. 어드민 → 점검(`/admin/maintenance`)에서 `maintenance` 전환.
   스크립트가 자동으로 켜지 않으며, **켜지 않으면 cutover-live가 가드로 중단**된다.
2. **크론 일시 정지** — maintenance는 유저 대면 경로만 막고 **크론은 계속 돈다**
   (`app/api/cron/*` 어디에도 system_mode 체크 없음). wipe 창에서 `push-daily-supply`·
   `resolve-enhance`·대난투/점령 정산 등이 방금 비운 테이블에 재INSERT하거나 CBT 데이터로
   정산을 돌릴 수 있다. 방법(택1):
   - Vercel 대시보드 → Settings → Cron Jobs 비활성화(§6에서 재활성화), 또는
   - `CRON_SECRET`을 임시 회전(모든 크론이 fail-closed) 후 §6에서 원복.
   대난투/점령 정산 시각(KST 정시·23시)과 겹치지 않는 창을 고르면 리스크가 더 준다.

## 2. 이월 스냅샷 (wipe 전 필수)

**wipe 전 실결제 부재 확인** — CBT는 ALLOW_TEST_LOGIN으로 결제가 막혀 있어 실주문이 없어야
정상이지만, 1건이라도 있으면 `iap_orders` 삭제가 전자상거래법 거래기록 보존의무(5년)와 충돌한다:

```sql
select count(*) from iap_orders where status in ('paid','refunded');
-- 0이 아니면: 해당 행 백업(export) 후 wipe 진행
```

```bash
bun run --env-file=.env.local scripts/cbt-snapshot.ts            # 드라이런 확인
bun run --env-file=.env.local scripts/cbt-snapshot.ts --confirm  # 기록 + keepsake 버킷 복사
```

- 이월 범위(정책): **닉네임 + 아바타 전 목록(비기본) + 추천 보상**. 진행도는 리셋.
- 캐릭터 보유 전 유저를 `cbt_carryover`에 upsert(빈손 유저도 닉네임 이월 대상).
- 아바타는 정면(south) 1방향만 사용(기획 확정) — 각 아바타의 south.png를 storage
  `cbt-keepsake/{userId}/{profileId}.png`로 복사(wipe 생존).

## 3. wipe 실행

```bash
bun run scripts/cutover-live.ts --db=prod            # 드라이런 — 삭제 행 수 확인
bun run scripts/cutover-live.ts --db=prod --confirm  # 단일 트랜잭션 실행
```

내장 가드: 이월 스냅샷 선행 / maintenance ON / 보존 테이블 오염 / 카탈로그 비어있음 — 하나라도 걸리면 중단.

**보존**: profiles(계정) · cbt_carryover · servers · zones(점령만 리셋) · zone_adjacency ·
catalog_items(현행 60종 유지) · probability_snapshots · system_mode · announcements · push_subscriptions.
**삭제**: 진행/경제/장비/우편/길드/레이드/랭킹/결제기록/문의/아바타 전부.

> ⚠ **profiles는 어떤 경우에도 wipe 금지** — `cbt_carryover`가 CASCADE FK로 매달려 있어 이월
> 원장이 전손되고, `handle_new_user` 트리거는 auth.users INSERT에만 발화해 계정이 재생성되지 않는다.

## 3.5. CBT 유저 사전 복원 (wipe 직후, 오픈 전)

```bash
bun run --env-file=.env.local scripts/cbt-restore.ts --db=prod            # 드라이런
bun run --env-file=.env.local scripts/cbt-restore.ts --db=prod --confirm  # 실행
```

CBT 유저 전원의 캐릭터를 1서버에 **미리 생성** — CBT 닉네임 그대로 + 아바타 전 목록 복원
(마지막 착용 active) + 가입 보너스(💎1,000·슬롯당 📦10, ×1) + 초대 이월 보상·환영 우편(만료 90일)
+ `granted_at` 마킹. 닉네임 예약 로직이 필요 없고(자리가 이미 차 있음), 오픈 첫날 월드가
비어 보이지 않는다. 멱등 — 재실행 시 기존 캐릭터는 건너뜀. 튜토리얼은 스킵(step 9, 베테랑).

## 4. env 전환 + 배포

1. Vercel env에서 **`TEST_MODE` 삭제** — 보상 배율 ×5 → ×1 (자세한 절차 docs/TEST-MODE.md).
2. Vercel env에서 **`ALLOW_TEST_LOGIN` 삭제** — 심사 로그인 차단 + 결제 전 유저 개방 + CBT 고지
   소멸이 **동시에** 일어난다. §0의 결제 준비가 끝난 뒤에만 내릴 것.
3. 재배포(env 변경은 새 배포부터 적용).

## 5. 확률 공시 스냅샷 기록

```bash
bun run scripts/record-probability-snapshot.ts --note="정식 오픈" --confirm
```

게임산업법 §33 기록 의무 — 오픈 시점 공시 전문을 `probability_snapshots`에 영구 기록.

## 6. 점검 해제 + 오픈

1. **서버명 확인** — 컷오버는 servers 행을 보존·재사용한다(id=1). CBT용 이름이면 정식
   서버명으로 변경: `update servers set name = '1서버' where id = 1;` (이름은 로그인
   서버 선택·설정 화면에 노출됨.)
2. 크론 재활성화(§1에서 정지한 방식의 역순 — Cron Jobs 활성화 또는 `CRON_SECRET` 원복).
3. 오픈 공지 발행(`/admin/announcements`) — 트래픽 분산을 위해 공지 시각을 나누는 것을 권장
   (재로그인 폭주 시 콜백 캐릭터 생성 tx가 커넥션 풀을 경쟁).
4. 점검 모드 OFF.

## 7. 오픈 직후 검증

| 항목 | 기대값 |
|------|--------|
| 신규 가입 보너스 | 💎1,000 / 슬롯당 상자 10개 (×1) |
| CBT 유저 재로그인 | **사전 복원된 캐릭터로 바로 진입**(CBT 닉네임·아바타 목록·마지막 착용 active 유지) + 우편 2통(초대 이월 보상·환영) |
| CBT 닉네임 | 신규 유저가 선점 불가(캐릭터가 이미 존재) — 닉변도 정상 |
| 상점/성장패스 | 유료 상품 노출·결제창 정상 |
| 로그인 화면 | CBT 고지 배너 미노출 |
| 확률공시 `/probability` | 현행 카탈로그 기준 표기 |
| 어드민 허브 | 잔존 배지 0 (신고·검수·문의 wipe됨) |

## 8. 사후 (심사 종료 후)

- 심사 계정 물리 제거: `lib/auth/test-accounts.ts` 삭제 + `signInWithCredentials`/`ensureTestUser`/
  로그인 test 분기 제거 + prod Supabase Auth의 `cbt@`~`cbt5@ganghwa.app` 계정(5개) 삭제.
- 스토리지 고아 정리(선택): wipe로 행이 사라진 `profiles` 버킷 파일과 Pixellab 캐릭터는 남는다 —
  비용 누적 시 GC 스크립트 검토(회원탈퇴 경로도 동일 패턴).
