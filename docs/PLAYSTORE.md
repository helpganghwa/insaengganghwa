# 플레이스토어 출시 (Android) — 설계·체크리스트

> 목표: ganghwa.app을 Google Play에 **TWA(Trusted Web Activity)** 앱으로 출시하고, 앱 안의 유료 상품은
> **Google Play 결제**(Digital Goods API)로 판다. 웹(ganghwa.app 브라우저)은 종전대로 포트원 결제.
> 결정(2026-09-03): 개발자 계정은 **사업자(조직)**, 결제는 **처음부터 Play 결제 연동**.

## 1. 방식

| 항목 | 결정 | 이유 |
|---|---|---|
| 패키징 | TWA (PWABuilder로 AAB 생성) | 네이티브 코드 0. 카카오 로그인·웹푸시(알림 위임)·서비스워커 그대로. 광고/네이티브 필요 시 Capacitor로 이관 |
| 패키지명 | `app.ganghwa.game` | 도메인 역순. 한 번 정하면 변경 불가 |
| 결제 | Play 결제 (Digital Goods API + PaymentRequest) | 구글 정책: 앱 내 디지털 재화는 Play 결제 필수. 수수료 15%(연 $1M 이하 프로그램 등록) |
| 웹 결제 | 포트원 유지 | 브라우저 접속은 정책 밖. 앱에서는 포트원 결제창 노출 금지 |
| 플랫폼 감지 | start_url `/?src=twa` → 쿠키 `ig_platform=twa`(1년) | referrer(`android-app://app.ganghwa.game`)는 첫 진입만 잡혀 쿠키로 고정 |
| 심사 로그인 | 기존 ID/PW 심사 계정(`?test=true`) | 카카오 없이 심사 가능 |

## 2. 외부 절차 (운영자)

1. **D-U-N-S 번호** — 던앤브래드스트리트 코리아 무료 신청(사업자등록증·대표자·주소). 1~2주. 조직 계정 필수.
2. **Google Play Console 조직 계정** — $25, 조직 정보·D-U-N-S·대표 이메일·전화 인증. 계정 생성 후 본인 확인.
3. **판매자(Payments) 프로필** — Play 결제 정산용. 사업자 정보·정산 계좌·세금 정보.
4. **앱 생성** — 이름 "인생강화", 기본 언어 ko-KR, 게임 > 롤플레잉, 무료.
5. **스토어 등록정보** — 짧은 설명(80자)·전체 설명(4,000자)·아이콘 512·그래픽 이미지 1024×500·스크린샷(휴대폰 최소 2장, 광고자산 활용)·개인정보처리방침 URL(`/legal/privacy`).
6. **앱 콘텐츠** — 콘텐츠 등급 IARC 설문(→ GRAC 전체이용가 예상; GCRB 결정서 보관), 데이터 보안(수집: 이메일·닉네임·결제기록·기기 푸시토큰), 타겟층 만 13세 이상, 광고 없음, 앱 액세스 = 심사 계정 안내, 정부 앱 아님, 금융 기능 없음.
7. **인앱 상품 등록** — §4 SKU 22종(관리 소모성). 가격 KRW(부가세 포함, 웹과 동일 금액).
8. **Google Play Developer API** — Cloud 프로젝트 연결 → 서비스 계정 생성 → Play Console 사용자·권한에서 "재무 데이터 보기·주문 관리·앱 정보 보기" 부여 → JSON 키를 Vercel `PLAY_SERVICE_ACCOUNT_JSON`에.
9. **앱 서명** — Play 앱 서명 사용. App integrity 화면의 **앱 서명 인증서 SHA-256** → Vercel `PLAY_ASSETLINKS_SHA256`(업로드 키 지문도 쉼표로 병기).
9-1. **앱 액세스(심사 로그인)** — 앱은 주소창이 없어 심사관이 `?test=true`를 붙일 수 없다. 두 경로를 함께 둔다:
   ① 앱 로그인 화면 맨 아래 **'심사용 로그인 · Reviewer sign-in'** 링크(2026-09-11, TWA 쿠키가 있을 때만 렌더 — 웹에는 없음)
   ② 콘솔 '앱 액세스에 필요한 기타 정보'에 크롬으로 `https://ganghwa.app/login?test=true`를 여는 절차를 한국어·영어로 기재(앱과 브라우저가 세션 공유).
   계정은 `cbt@ganghwa.app` / `cbt123456`, 전체 기능 접근 체크박스 선택.

10. **라이선스 테스터** — 설정 > 라이선스 테스트에 운영자 계정 등록(테스트 결제 무과금).
11. **내부 테스트 트랙**에 AAB 업로드 → 설치 → 로그인·결제·푸시 확인 → **프로덕션** 제출(심사 1~7일).
12. 15% 수수료 프로그램(Play Media Experience 아님 — "15% service fee tier") 등록.

## 3. 코드 작업 (순서)

### 3.1 플랫폼 감지 + Digital Asset Links
- `middleware` 또는 layout에서 `?src=twa` 감지 → `ig_platform=twa` 쿠키. 서버 컴포넌트 `isTwa()` 헬퍼(`lib/platform.ts`).
- `app/.well-known/assetlinks.json/route.ts` — env `PLAY_ASSETLINKS_SHA256`(쉼표 구분)로 `delegate_permission/common.handle_all_urls` + `common.get_login_creds` 출력. 없으면 404(앱이 URL바를 표시하게 되는 것 외 무해).

### 3.2 Play 결제
- **DB** `0186_play_billing.sql`: `iap_orders.provider`('portone'|'play', 기본 portone) · `play_purchase_token` unique · `play_order_id` · `play_sku`. `portone_order_id`는 Play 주문에서도 내부 주문번호로 재사용(`play_<uuid>`).
- **서버** `lib/payment/play.ts`
  - `createPlayOrder(userId, productId)` — 웹 `createOrder`와 같은 검증(본인인증·미성년 월 한도·상품 유효·중복 특가) 후 pending 주문 + 사용할 SKU 반환.
  - `verifyPlayPurchase(orderId, purchaseToken)` — Google Play Developer API `purchases.products.get`(서비스 계정 JWT → access token, 외부 SDK 없이 fetch) → `purchaseState=0`·SKU 일치·`obfuscatedExternalAccountId=userId` 확인 → 주문 paid + 지급(`applyProductGrant`/`applyBpSegmentPurchase`/후원 마일스톤 — 웹 경로와 동일 함수) → `purchases.products.consume`(소모성 재구매 가능). 토큰 unique로 멱등.
  - `syncVoidedPurchases()` — `purchases.voidedpurchases.list`(최근 30일) → 환불/취소된 토큰의 주문을 refunded 처리 + 지급분 회수(웹 환불 회수 로직 재사용). cron `play-voided` 매일 1회.
- **클라** `app/(game)/shop/play-checkout.ts` — `window.getDigitalGoodsService('https://play.google.com/billing')` → `getDetails([sku])`(표시 가격) → `new PaymentRequest([{ supportedMethods: 'https://play.google.com/billing', data: { sku } }], …).show()` → `purchaseToken` → `verifyPlayPurchaseAction`. 미지원(브라우저·구버전 Chrome)이면 "Play 스토어 앱에서만 결제할 수 있어요".
- **상점 UI** — `isTwa()`면 결제 버튼이 Play 체크아웃을 호출하고 가격 표시는 `getDetails` 값(없으면 카탈로그 KRW). 포트원 SDK 로드 안 함. 영수증·환불 안내 문구를 Play 기준으로 교체(환불은 Google Play 주문내역).
- **어드민** — 결제 목록에 provider 뱃지, Play 주문은 환불 버튼 대신 "Play 콘솔에서 환불" 안내.

### 3.2 구현 상태(2026-09-03, feat/playstore)
- ✅ 0186(`provider`·`play_sku`·`play_purchase_token` 부분 유니크·`play_order_id`·`play_consumed_at`, 스테이징 적용). 스키마 `lib/db/schema/payment.ts`.
- ✅ `lib/payment/play-sku.ts`(순수 SKU 매핑·콘솔 등록 목록 22종) · `play-api.ts`(서비스 계정 JWT, get/consume/refund/voided) · `play.ts`(소모 재시도·voided 동기화) · cron `play-sync`(UTC 18:00 = KST 03:00).
- ✅ `purchase.ts`: `resolveOrder`(가드 공유) → `createPlayOrder`, `completePurchase(pid, uid, { playPurchaseToken })` provider 분기(토큰 선점 검사→구글 purchaseState 0→paid 전이와 토큰 바인딩→지급→consume). 미성년 초과는 `refundPlayOrder(revoke)` 후 refundPurchase.
- ✅ `refund.ts`: Play 주문은 구글 purchaseState 1(취소됨)일 때만 회수. 어드민 환불 버튼은 Play 주문에 닫힘(콘솔 환불→동기화 안내). `payment-recon`은 Play pending을 PG 조회 없이 만료만.
- ✅ 클라 `shop/play-checkout.ts`(Digital Goods API + PaymentRequest) · `ShopTabs`가 `isTwaClient()`로 분기 · 액션 `createPlayOrderAction`/`verifyPlayPurchaseAction`.
- ✅ 테스트 `tests/payment/play-pure.test.ts`(4) · `play-complete.test.ts`(DB 통합 6: 지급·멱등·미구매·토큰 중복·소모 실패·환불·voided).
- ⏳ 남은 것: 서비스 계정 env 투입(Vercel) → 라이선스 테스터로 내부 테스트 E2E → 가격 표시(`playPriceLabel`) 상점 반영 여부 결정 → 어드민 결제 목록 Play 주문번호 노출.

**결제 경로 판정(2026-09-11 수정)** — `lib/platform-client.ts`의 순수 함수 `usePlayBilling({hasDigitalGoods, twaCookie, standalone})`이 규칙, `shouldUsePlayBilling()`이 사실 수집. 상점·성장패스 두 결제 진입점이 같은 규칙을 쓴다.
- **Digital Goods API 존재가 1순위**다. 이 API는 Play 결제를 켠 TWA에서만 노출돼 '앱 안'의 확실한 증거다.
- ⚠ `ig_platform` 쿠키를 1순위로 쓰면 안 된다. TWA는 크롬과 저장소를 공유하므로(§9-1 세션 공유와 같은 성질) 앱을 한 번 열면 **같은 기기의 브라우저 탭에도 쿠키가 남아** 그 탭의 포트원 결제가 통째로 막힌다.
- 쿠키는 2순위 안전망(쿠키 **AND** `display-mode: standalone`)으로만 쓴다. 앱인데 API가 없는 환경(커스텀탭 폴백·구버전 크롬)에서 포트원 결제창을 띄우면 정책 위반이라, 그때는 결제를 포기하고 안내로 끝낸다. standalone을 함께 보는 이유는 브라우저 탭을 이 안전망에서 빼기 위해서다.
- 남는 틈: 같은 기기에 PWA와 앱을 모두 설치하면 PWA도 standalone이라 안내로 빠진다(결제는 앱에서 가능).
- 회귀 테스트 `tests/payment/play-billing-route.test.ts`.

### 3.3 그 외
- 매니페스트 `start_url: '/?src=twa'`는 TWA 매니페스트(twa-manifest.json)에서만 지정(웹 PWA는 `/` 유지).
- 푸시: TWA 알림 위임(`enableNotifications`)으로 앱 이름·아이콘으로 표시. 코드 변경 없음.
- 확률공시·등급표시: 앱에서도 동일 페이지. Play 등급(IARC)과 GCRB 등급 병기 필요 여부는 REGULATORY 확인.
- 테스트: `tests/payment/play.test.ts`(검증 응답 픽스처: 정상/미결제/SKU 불일치/타 계정/중복 토큰).

## 4. 인앱 상품 22종 (Play Console 등록표)

**공통 설정** — 유형 `관리 상품(소모성)`, 상태 `활성`, 가격은 아래 KRW(부가세 포함 표시가·웹과 동일액), 국가 `대한민국`만.
제품 ID는 **등록 후 변경 불가**이며 코드(`lib/payment/play-sku.ts`)와 1:1이므로 오타 시 결제가 매칭되지 않는다.
설명란은 비고를 그대로 쓰지 말고 지급 내용만 한 줄로 적는다(확률형 아님 — 전부 확정 지급).

| Play SKU(제품 ID) | 이름 | 가격(KRW) | 비고 |
|---|---|---|---|
| `cash_d1` | 모험가의 작은 자루 | 1,200 | daily 💎290+📦3 |
| `cash_d2` | 기사의 작은 상자 | 2,500 | daily 💎610+📦9 |
| `cash_d3` | 왕의 작은 금고 | 4,900 | daily 💎1200+📦18 |
| `cash_w1` | 모험가의 자루 | 4,900 | weekly 💎1360+📦18 |
| `cash_w2` | 기사의 상자 | 9,900 | weekly 💎2750+📦39 |
| `cash_w3` | 왕의 금고 | 19,900 | weekly 💎5550+📦90 |
| `cash_m1` | 모험가의 큰 자루 | 9,900 | monthly 💎3200+📦54 |
| `cash_m2` | 기사의 큰 상자 | 19,900 | monthly 💎6450+📦120 |
| `cash_m3` | 왕의 큰 금고 | 39,900 | monthly 💎12900+📦258 |
| `dia_starter` | 다이아 스타터 | 1,500 | 💎300 |
| `dia_small` | 다이아 소 | 6,000 | 💎1,200 |
| `dia_medium` | 다이아 중 | 13,000 | 💎2,800 |
| `dia_large` | 다이아 대 | 28,000 | 💎6,400 |
| `dia_mega` | 다이아 특대 | 68,000 | 💎16,000 |
| `premium` | 프리미엄 패키지 | 14,900 | 즉시 💎1000+📦30 · 30일간 매일 💎300+📦15 |
| `first_special` | 인생 특가 | 1,000 | 💎5,000+📦30 · 계정(서버)당 1회 |
| `bp_9900` | 성장 패스 9,900원 | 9,900 | 강화/초월 공용 · productId가 구간 결정 |
| `bp_19900` | 성장 패스 19,900원 | 19,900 | 강화/초월 공용 · productId가 구간 결정 |
| `bp_29900` | 성장 패스 29,900원 | 29,900 | 강화/초월 공용 · productId가 구간 결정 |
| `bp_39900` | 성장 패스 39,900원 | 39,900 | 강화/초월 공용 · productId가 구간 결정 |
| `bp_49900` | 성장 패스 49,900원 | 49,900 | 강화/초월 공용 · productId가 구간 결정 |
| `bp_59900` | 성장 패스 59,900원 | 59,900 | 강화/초월 공용 · productId가 구간 결정 |

총 22종

**등록 방법** — 콘솔의 CSV 가져오기/내보내기는 **2025-05-19에 폐지**됐다. 수기 입력 아니면 API뿐이므로
`scripts/play-products.ts`로 일괄 등록한다(코드 `playSkuCatalog()`를 그대로 올려 표와 코드가 갈라지지 않는다).

```bash
bun --conditions react-server scripts/play-products.ts           # 대조만
bun --conditions react-server scripts/play-products.ts --apply   # 누락분 생성
```

- 전제: 로컬 env에 `PLAY_SERVICE_ACCOUNT_JSON`·`PLAY_PACKAGE_NAME`, 서비스 계정에 **앱 정보 보기·재무 데이터 보기** 권한(§2-8).
- 이미 있는 SKU는 건드리지 않는다 — 판매가를 실수로 덮어쓰지 않기 위해서다. 가격이 어긋나면 경고만 찍고 콘솔에서 고친다.
- ⚠ `--conditions react-server`를 빼면 `server-only` 가드에 막힌다.

> 성장 패스(`bp_*`)는 **가격만** 담당한다. 어느 구간을 사는지는 주문의 productId가 정하므로 SKU는 6종을 공유한다.
> 가격은 Play Console이 정본 — 카탈로그와 다르면 `getDetails` 값을 화면에 표시한다(청약·공시 일치).

## 5. 리스크·주의

- **앱 안에서 외부 결제 유도 금지** — 충전 안내 팝업(다이아 부족 게이트 11곳)이 웹 상점으로 보내는 문구·링크 없이 앱 상점(Play)으로 가야 한다.
- **가격 표시** — Play 가격은 Console에서 관리. 카탈로그 KRW와 다르면 `getDetails` 값을 우선 표시(청약·공시 문제 방지).
- **본인인증** — Play 결제도 기존 IDENTITY_REQUIRED·미성년 월 한도를 그대로 적용(주문 생성 단계에서 차단).
- **서비스 계정 키** — Vercel env 서버 전용. 로컬에 두지 않는다(푸시 키 사고 교훈, [push-send-local-vapid-incident]).
- **Digital Goods API 가용성** — Chrome 101+ TWA에서만. 삼성 브라우저 기본 기기는 TWA가 Chrome을 강제하므로 문제없음.
- **환불** — Google이 처리. voided purchases 동기화가 회수의 유일한 경로이므로 cron 하트비트 필수.

## 6. 일정(안)

| 주차 | 운영자 | 코드 |
|---|---|---|
| 1주 | D-U-N-S 신청, 스토어 자료(설명·스크린샷) 준비 | 3.1 + 3.2 서버·DB·클라(스테이징) |
| 2주 | 조직 계정·판매자 프로필·앱 생성·인앱 상품·서비스 계정 | PWABuilder AAB 생성, assetlinks, 내부 테스트 설치·결제 E2E |
| 3주 | 프로덕션 제출·심사 대응 | 어드민·문서·공지 |

## 7. 현황 (2026-09-07)

- 코드: 3.1 dev 반영, 3.2는 `feat/playstore`(cc2e9c38, dev보다 51커밋 뒤) — 착수 시 dev 재정렬·스테이징 재검증 필요. 3.3 미착수.
- 운영자: D-U-N-S 신청 접수(사건번호 34818142) 대기. 조직 계정·판매자 프로필·앱·상품·서비스 계정 미진행.
- iOS는 `docs/APPSTORE.md`(Capacitor + StoreKit 2 + Sign in with Apple + APNs)로 병행. D-U-N-S 번호는 양쪽 공용.
