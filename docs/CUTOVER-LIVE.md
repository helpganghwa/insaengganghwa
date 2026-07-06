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

## 1. 점검 모드 ON

어드민 → 점검(`/admin/maintenance`)에서 `maintenance` 전환.
스크립트가 자동으로 켜지 않으며, **켜지 않으면 cutover-live가 가드로 중단**된다.

## 2. 이월 스냅샷 (wipe 전 필수)

```bash
bun run --env-file=.env.local scripts/cbt-snapshot.ts            # 드라이런 확인
bun run --env-file=.env.local scripts/cbt-snapshot.ts --confirm  # 기록 + keepsake 버킷 복사
```

- 초대 보상 집계 + 기념 아바타(착용 비기본 우선, 없으면 최근 생성 비기본)를 `cbt_carryover`에 upsert.
- south.png를 storage `cbt-keepsake/`로 복사(wipe 생존).

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

1. 오픈 공지 발행(`/admin/announcements`) — 트래픽 분산을 위해 공지 시각을 나누는 것을 권장
   (재로그인 폭주 시 콜백 캐릭터 생성 tx가 커넥션 풀을 경쟁).
2. 점검 모드 OFF.

## 7. 오픈 직후 검증

| 항목 | 기대값 |
|------|--------|
| 신규 가입 보너스 | 💎1,000 / 슬롯당 상자 10개 (×1) |
| CBT 유저 재로그인 | 캐릭터 재생성 + "CBT 감사 보상" 우편(초대 이월) + 기념 아바타 복원 |
| 상점/성장패스 | 유료 상품 노출·결제창 정상 |
| 로그인 화면 | CBT 고지 배너 미노출 |
| 확률공시 `/probability` | 현행 카탈로그 기준 표기 |
| 어드민 허브 | 잔존 배지 0 (신고·검수·문의 wipe됨) |

## 8. 사후 (심사 종료 후)

- 심사 계정 물리 제거: `lib/auth/test-accounts.ts` 삭제 + `signInWithCredentials`/`ensureTestUser`/
  로그인 test 분기 제거 + prod Supabase Auth의 `cbt@`~`cbt5@ganghwa.app` 계정(5개) 삭제.
- 스토리지 고아 정리(선택): wipe로 행이 사라진 `profiles` 버킷 파일과 Pixellab 캐릭터는 남는다 —
  비용 누적 시 GC 스크립트 검토(회원탈퇴 경로도 동일 패턴).
