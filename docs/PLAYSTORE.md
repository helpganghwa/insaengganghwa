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

### 3.3 그 외
- 매니페스트 `start_url: '/?src=twa'`는 TWA 매니페스트(twa-manifest.json)에서만 지정(웹 PWA는 `/` 유지).
- 푸시: TWA 알림 위임(`enableNotifications`)으로 앱 이름·아이콘으로 표시. 코드 변경 없음.
- 확률공시·등급표시: 앱에서도 동일 페이지. Play 등급(IARC)과 GCRB 등급 병기 필요 여부는 REGULATORY 확인.
- 테스트: `tests/payment/play.test.ts`(검증 응답 픽스처: 정상/미결제/SKU 불일치/타 계정/중복 토큰).

## 4. SKU 매핑

| 웹 productId | Play SKU | KRW | 지급 |
|---|---|---|---|
| d1 / d2 / d3 | `cash_d1` … | 1,200 / 2,500 / 4,900 | 카탈로그 동일 |
| w1 / w2 / w3 | `cash_w1` … | 4,900 / 9,900 / 19,900 | 〃 |
| m1 / m2 / m3 | `cash_m1` … | 9,900 / 19,900 / 39,900 | 〃 |
| starter / small / medium / large / mega | `dia_starter` … | 1,500 / 6,000 / 13,000 / 28,000 / 68,000 | 〃 |
| premium | `premium` | 14,900 | 〃 |
| first_special | `first_special` | 1,000 | 계정당 1회(서버 가드) |
| bp_enhance_N / bp_transcend_N | `bp_9900` `bp_19900` `bp_29900` `bp_39900` `bp_49900` `bp_59900` | 구간가(9,900+10,000×N, 상한 59,900) | 주문의 productId가 구간 결정. SKU는 가격만 담당 |

총 22종, 전부 **관리 소모성 상품**(consume 후 재구매).

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
