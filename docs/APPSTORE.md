# 앱스토어 출시 (iOS) — 설계·체크리스트

> 목표: ganghwa.app을 App Store에 **네이티브 래퍼(Capacitor, WKWebView)** 앱으로 출시하고, 앱 안의 유료 상품은
> **Apple 인앱 결제(StoreKit 2)** 로 판다. 웹(브라우저)은 종전대로 포트원, 안드로이드는 `docs/PLAYSTORE.md`(TWA + Play 결제).
> 안드로이드와 달리 iOS는 PWA를 그대로 올릴 수 없고, 웹푸시·결제·로그인 세 곳에 네이티브 경로가 필요하다.

## 0. 결정 대기 (착수 전 확정)

| # | 항목 | 제안 | 대안 |
|---|---|---|---|
| ① | 패키징 | **Capacitor**(WKWebView가 `https://ganghwa.app/?src=ios`를 로드) | 없음 — iOS에 TWA 상당 기능이 없다 |
| ② | 안드로이드 | **TWA 유지**(3.2 결제까지 구현됨) → 래퍼 2종 운용 | Capacitor로 통일(Play 결제 재구현·TWA 작업 폐기) |
| ③ | 결제 검증 | **자체 구현** — 클라 StoreKit 2 → 서버가 App Store Server API로 거래 조회·지급(Play와 같은 구조) | RevenueCat 등 결제 SaaS(수수료·외부 의존, 두 스토어 통합은 장점) |
| ④ | 로그인 | **Sign in with Apple 추가**(가이드라인 4.8 — 카카오 같은 소셜 로그인을 쓰면 의무). Supabase Apple provider. 이메일 같으면 기존 카카오 계정에 자동 연결, Apple "이메일 숨기기"는 새 계정 | 카카오 제거(불가 — 기존 유저 전부 카카오) |
| ⑤ | 푸시 | **APNs 네이티브**(Capacitor Push → 기기 토큰 → 서버가 APNs HTTP/2 직접 발송, 7종 푸시 팬아웃) | v1은 iOS 앱 푸시 없음(홈 화면 PWA만 웹푸시) — 리텐션 훅 상실이라 비권장 |
| ⑥ | 가격 | 웹·Play·App Store **동일 KRW**. Apple Small Business Program(연 $1M 이하 15%) 등록 | 스토어별 가격 차등(정책상 가능하나 공시·문의 부담) |

## 1. 방식

| 항목 | 결정(안) | 이유 |
|---|---|---|
| 패키징 | Capacitor 6 iOS 프로젝트, `server.url = https://ganghwa.app`, start `/?src=ios` | SSR 앱이라 정적 번들 불가. 네이티브 플러그인(푸시·햅틱·스플래시·IAP)은 브리지로 |
| 번들 ID | `app.ganghwa.game` (안드로이드 패키지명과 동일) | 도메인 역순. 변경 불가 |
| 플랫폼 감지 | `?src=ios` → 쿠키 `ig_platform=ios`(1년). `Platform = 'web' \| 'twa' \| 'ios'` | 결제 분기·문구 전용, 게임 로직 금지(PLAYSTORE §3.1과 동일 원칙) |
| 결제 | StoreKit 2 (플러그인) + App Store Server API 검증 | 가이드라인 3.1.1: 디지털 재화는 IAP 필수. 앱 안에서 웹 결제 안내·링크 금지 |
| 로그인 | 카카오(기존) + Sign in with Apple | 4.8 의무. 심사 계정은 기존 ID/PW(`?test=true`) |
| 푸시 | APNs 토큰 기반 인증(.p8) | WKWebView는 웹푸시 불가 |
| 심사 리스크 | 4.2(최소 기능 — "웹사이트 포장" 판정) | 네이티브 푸시·햅틱·스플래시·오프라인 화면·IAP로 앱다움 확보, 심사 노트에 게임 시스템 설명 |

## 2. 외부 절차 (운영자)

1. **D-U-N-S** — Google용으로 신청한 번호를 그대로 사용(사건번호 34818142). 조직 등록의 전제.
2. **Apple Developer Program(조직)** — 연 $99. 2단계 인증 Apple ID, 법인/사업자 정보, D-U-N-S, 서명 권한자 확인. 승인 1~2주.
3. **App Store Connect 계약** — Paid Apps 계약 + 은행·세금 정보(정산). 미완이면 IAP 심사 불가.
4. **앱 레코드** — 이름 "인생강화", 번들 ID `app.ganghwa.game`, 기본 언어 ko, 카테고리 게임 > 롤플레잉, 무료.
5. **인앱 상품 22종** — PLAYSTORE §4와 같은 ID·KRW(소모성). 각 상품 심사용 스크린샷 1장 필요.
6. **Sign in with Apple 설정** — App ID capability, Services ID(웹 리다이렉트용), Sign in key(.p8) → Supabase Auth Apple provider(Team ID·Key ID·Services ID·키).
7. **APNs 키** — Keys에서 APNs 키(.p8) 생성 → Vercel env `APNS_KEY_P8`·`APNS_KEY_ID`·`APNS_TEAM_ID`(로컬 보관 금지).
8. **App Store Server API 키** — Users and Access > Integrations > In-App Purchase 키(.p8) → Vercel env `ASC_IAP_KEY_P8`·`ASC_IAP_KEY_ID`·`ASC_ISSUER_ID`.
9. **App Store Server Notifications V2** — Production/Sandbox URL `https://ganghwa.app/api/webhooks/apple-iap`.
10. **스토어 등록정보** — 아이콘 1024×1024(현재 원본 512라 재제작), 스크린샷 6.7"(1290×2796)·6.5"(1284×2778) 각 3장 이상, 부제(30자)·홍보 문구(170자)·설명(4,000자)·키워드(100자), 개인정보처리방침 URL `/legal/privacy`, 지원 URL.
11. **앱 개인정보(영양 라벨)** — 수집: 이메일·닉네임·결제 기록·기기 푸시 토큰·식별자(카카오/Apple sub). 추적 없음.
12. **연령 등급** — 설문 → 4+ 예상(만화적 폭력). GCRB 전체이용가 결정서 보관·법정 등급 표시는 기존 화면 그대로.
13. **계정 삭제** — 5.1.1(v): 앱 안 탈퇴(기존 `/settings` 탈퇴)로 충족. 심사 노트에 경로 기재.
14. **수출 규정** — HTTPS만 사용 → `ITSAppUsesNonExemptEncryption = NO`.
15. **TestFlight** — 내부 테스터(운영자)로 로그인·결제(Sandbox 계정)·푸시 확인 → 심사 제출(1~3일, 반려 시 재제출).
16. **Small Business Program** 등록(15%).
17. **로컬 환경** — Xcode 16 이상 필요 → macOS **14.5 이상**으로 업데이트(현재 14.3, Xcode 미설치). 빌드·업로드는 Xcode에서.

## 3. 코드 작업 (순서)

### 3.0 스파이크(1일) — 착수 전 검증
- WKWebView에서 **카카오 로그인**이 끝까지 되는지(카카오 웹 로그인 → Supabase 콜백 `/auth/callback` → 세션 쿠키). 카카오톡 앱 전환 버튼은 실패해도 계정 로그인 경로만 되면 통과. 안 되면 `ASWebAuthenticationSession` 플러그인 + 딥링크 복귀로 우회.
- Capacitor 셸에서 스플래시·상태바·세이프에어리어·뒤로가기·외부 링크(위키 새창 → `Browser` 플러그인) 동작.

### 3.1 플랫폼 감지 확장 (완료 2026-09-07)
- `lib/platform.ts`: `PLATFORM_IOS = 'ios'`, `getPlatform()` 3값, `isIos()`·`isIosClient()`. `proxy.ts`의 `?src=` 처리에 ios 추가.
- 앱 전용 UI 규칙: `ios`/`twa` 공통 = 포트원 미로드·외부 결제 문구 금지·"앱에서는 스토어 결제" 안내. `ios` 추가 = 웹푸시 구독 UI 숨김(네이티브 푸시로 대체).

### 3.2 Sign in with Apple (코드 완료 2026-09-07 — `APPLE_LOGIN_ENABLED=1`로 노출, Supabase provider 설정 선행)
- `lib/auth/actions.ts` `signInWithApple()` — `provider: 'apple'`, 콜백 동일. 로그인 화면 버튼(Apple 디자인 가이드 준수 — 검정 버튼·로고).
- 신규 가입 흐름은 카카오와 동일(콜백이 캐릭터 생성). 닉네임·이메일 처리는 provider 무관.
- 계정 연결 정책: 같은 검증 이메일이면 Supabase가 기존 사용자에 identity 추가(자동 연결). Apple 이메일 숨기기(`@privaterelay.appleid.com`)는 새 계정 → 위키/FAQ에 명시.
- 웹에도 노출(`/login`에 Apple 버튼) — 앱 전용으로 숨기면 웹에서 만든 Apple 계정이 앱에서 못 들어오는 문제가 없어짐.

### 3.3 Apple 결제 (구현 완료 2026-09-07, feat/appstore)
- **DB** `0196_apple_iap.sql`: `iap_orders.provider`에 `'apple'` 허용, `apple_product_id`·`apple_transaction_id`(부분 unique)·`apple_original_transaction_id`·`apple_environment`. 스테이징 적용, prod는 배포 전 적용.
- **상품 ID** `lib/payment/apple-sku.ts` — Play SKU와 같은 문자열 22종(가격만 담당, 지급은 주문 product_code).
- **서버**
  - `lib/payment/apple-api.ts` — In-App Purchase 키(.p8)로 ES256 JWT(20분 캐시, `dsaEncoding: 'ieee-p1363'`), `GET /inApps/v1/transactions/{id}` Production → 404면 Sandbox. 응답 JWS는 Apple에서 직접 받은 것이라 payload만 해독(서명 검증 생략).
  - `lib/payment/apple-jws.ts`(순수) — JWS 해독·거래 대조(`checkAppleTransaction`: 번들·상품·appAccountToken 대소문자 무시·미환불·Consumable)·`appleAccountTokenOf('ap-<uuid>')`·Sandbox 허용 규칙.
  - `purchase.ts` `createAppleOrder` — 주문번호 `ap-<uuid>`, 그 UUID가 StoreKit `appAccountToken`. `completePurchase(..., { appleTransactionId })` — 거래 선점 검사(TOKEN_USED) → Apple 재조회 → 대조 실패는 NOT_PAID(+계정/번들/상품 불일치는 AMOUNT_MISMATCH 알림) → **Sandbox 거래는 심사 계정(reviewer) 또는 `APPLE_ALLOW_SANDBOX=1`(스테이징)에서만 지급** → paid 전이와 함께 거래 ID·원거래 ID·환경 바인딩. 소모(finish)는 클라.
  - 미성년 월 한도 초과(동시 주문 우회)는 Apple에 개발자 환불 API가 없어 **지급 보류 + 운영 알림**만(유저가 Apple에 환불 요청 → 웹훅/cron이 refunded).
  - `refund.ts` — Apple 주문은 거래 재조회 후 `revocationDate`가 있을 때만 회수.
  - `app/api/webhooks/apple-iap/route.ts` — Server Notifications V2. 서명 검증 대신 거래 ID로 주문을 찾아 `refundPurchase`(Apple 재조회)로 확정. REFUND·REVOKE 회수, REFUND_REVERSED 알림, TEST 200. 항상 200.
  - `lib/payment/apple.ts` `syncAppleRevoked` + cron `/api/cron/apple-sync`(매일 UTC 18:10 = KST 03:10) — 최근 30일 paid 주문 재조회 백스톱. 키 미설정이면 no-op.
- **클라** `app/(game)/shop/apple-checkout.ts` — 네이티브 브리지 `window.__ganghwaIap`(`getProducts`·`purchase(productId, appAccountToken)`·`finish`)를 Capacitor 셸이 심는다. 웹 코드는 StoreKit 플러그인 종류를 모른다. 흐름: `createAppleOrderAction` → `purchase` → `verifyAppleTransactionAction(paymentId, transactionId)` → `finish`. 브리지 없으면 'unsupported'. pending(구입 요청 승인 대기)은 안내만 — 셸이 승인 후 StoreKit 거래를 다시 받으면 같은 토큰으로 재검증(§3.5).
- **어드민** — provider 뱃지 `App Store`, 환불 버튼 대신 "Apple 환불" 표시(`APPLE_ORDER`).
- **테스트** `tests/payment/apple-pure.test.ts`(해독·대조·토큰·Sandbox 규칙·상품 매핑), `apple-complete.test.ts`(DB 통합: 지급·바인딩·already / 토큰 불일치 알림 / 환불·타상품 거부 / Sandbox 게이트 / TOKEN_USED / 환불 / revoked 동기화).

### 3.4 APNs 푸시
- **DB** `push_subscriptions`에 `kind`('webpush'|'apns', 기본 webpush)·`apns_token`(unique) — 또는 endpoint 컬럼에 `apns:<token>` 저장해 스키마 변경 최소화(선택).
- **클라** Capacitor `PushNotifications` — 권한 요청 시점은 기존 웹푸시 프롬프트 규칙과 동일(첫 강화 완료 뒤 등), 토큰을 `registerApnsTokenAction`으로 저장. 알림 탭 → 딥링크 경로(`/raid/<id>` 등) 이동.
- **서버** `lib/push/apns.ts` — Node `http2`로 `api.push.apple.com` 세션, 토큰 인증 JWT(ES256, 50분 캐시), payload `{aps:{alert:{title,body},sound:'default',badge?}, url}`. 410/`BadDeviceToken`·`Unregistered`는 구독 삭제(웹푸시 403/410과 같은 정리 규칙). `lib/push/send.ts` 팬아웃이 kind별로 분기 — 7종 푸시 호출부는 변경 없음.
- 환경: Sandbox(`api.sandbox.push.apple.com`)는 TestFlight/개발 빌드용 — 토큰에 환경 표시를 저장해 라우팅.

### 3.5 Capacitor 프로젝트
- 저장소 `mobile/ios/`(별도 패키지, Next 빌드와 분리). `capacitor.config.ts`: `appId 'app.ganghwa.game'`, `server.url`, `ios.contentInset`, 스플래시(기존 splash-*.png 재활용), 아이콘 1024 원본.
- 플러그인: `@capacitor/push-notifications`, `@capacitor/haptics`(기존 `haptic.tap()`을 네이티브로 승격), `@capacitor/splash-screen`, `@capacitor/status-bar`, `@capacitor/browser`, IAP 플러그인.
- 오프라인/로드 실패 화면(네이티브) — 4.2 대응.
- Universal Links(`/.well-known/apple-app-site-association`, `/s/*`·`/raid-invite/*`)는 v1.1.

### 3.6 그 외
- 테스트: `tests/payment/apple.test.ts`(정상/타 번들/상품 불일치/타 계정 토큰/중복 거래/Sandbox 환경), `tests/push/apns.test.ts`(JWT·payload·토큰 정리).
- 문서: 위키 "앱으로 즐기기"(설치·로그인·결제·환불 경로 스토어별), FAQ(Apple 이메일 숨기기, 웹 결제와 앱 결제 별개).
- 다이아 부족 게이트 11곳: `ios`에서도 앱 상점으로만.

## 4. 리스크·주의

- **수수료** — 웹 포트원 ≈3% vs 스토어 15%(SBP/Play 15% 등록 시)·30%. 앱에서 결제하는 비중만큼 마진이 줄고, 앱 안에서 웹으로 유도하는 문구는 정책 위반. 가격 동일 유지가 전제라 순이익 시뮬을 출시 전 1회.
- **4.2 반려** — 래퍼 앱의 가장 흔한 반려. 1차 반려 시 회신(게임 시스템·네이티브 기능 목록·심사 계정)으로 재심사, 그래도 막히면 오프라인 캐시·네이티브 화면 추가로 보강.
- **로그인 흐름** — WKWebView 카카오 로그인 미검증(3.0 스파이크 선행). Apple 로그인 추가로 계정 분리 문의 발생 가능.
- **키 관리** — .p8 3종(Apple 로그인·APNs·IAP) 전부 Vercel env 서버 전용. 로컬 금지.
- **환경 분리** — Sandbox 거래를 프로덕션 지급으로 오인하지 않도록 `environment` 필드 검사 필수. 심사관은 Sandbox로 결제한다 — 심사용 계정은 지급되어도 무방하나 Production 판정 코드는 거부.
- **가격 표시** — StoreKit 가격을 우선 표시(스토어 환율·부가세 포함 표기가 카탈로그와 다를 수 있음).
- **빌드 환경** — macOS 업데이트·Xcode 설치·인증서는 운영자 Mac에서만. CI 빌드는 도입하지 않음.

## 5. 일정(안) — 안드로이드와 병행

| 주차 | 운영자 | 코드 |
|---|---|---|
| 1주 | D-U-N-S 결과 → Google 조직 계정 + **Apple Developer 조직 등록 동시 신청**, macOS/Xcode 준비 | feat/playstore를 dev에 재정렬(51 커밋 뒤처짐)·스테이징 재검증, 3.0 스파이크, 3.1·3.2 |
| 2주 | Play 판매자 프로필·앱·상품·서비스 계정 / Apple 계약·앱 레코드·상품·키 3종 | Play 내부 테스트 E2E, 3.3 Apple 결제(스테이징), 3.4 APNs |
| 3주 | Play 프로덕션 제출 / TestFlight 설치·Sandbox 결제·푸시 확인 | 3.5 Capacitor 마감, 스토어 자료(문안·스크린샷) |
| 4주 | Play 심사 대응 / App Store 심사 제출·대응 | 문서·위키·공지, 순이익 시뮬 |

안드로이드가 먼저 나가고(코드 완료, 계정 대기), iOS는 2~3주 뒤따른다. 두 스토어 모두 **출시 공지·우편은 운영자 발행**.
