# iOS(App Store) 셸 — Capacitor

정본 설계는 `docs/APPSTORE.md`. 이 폴더는 Xcode 프로젝트를 만드는 설정만 둔다. **키(.p8)·인증서·프로비저닝은 커밋 금지**.

## 준비 (운영자 Mac, 1회)
1. macOS 14.5 이상 + Xcode 16 설치(App Store) → `sudo xcode-select -s /Applications/Xcode.app` → Xcode 첫 실행에서 추가 컴포넌트 설치.
2. CocoaPods: `sudo gem install cocoapods` (또는 `brew install cocoapods`).
3. Apple Developer 조직 계정에서 App ID `app.ganghwa.game` 생성 + Capability: Push Notifications, Sign in with Apple, In-App Purchase.

## 프로젝트 생성
```bash
cd mobile/ios
bun install
bunx cap add ios          # ios/ 폴더(Xcode 프로젝트) 생성 — 커밋 대상
bunx cap sync ios
bunx cap open ios         # Xcode
```
Xcode에서: Signing & Capabilities → Team 선택(자동 서명), Push Notifications·Sign in with Apple·In-App Purchase 추가.
`Info.plist`: `ITSAppUsesNonExemptEncryption = NO`, `NSUserTrackingUsageDescription` 불필요(추적 없음).
아이콘 1024×1024(알파 없음) → `App/Assets.xcassets/AppIcon`. 스플래시는 `Splash.imageset`에 `public/icons/splash-*.png` 재활용.

## 동작 확인 순서 (시뮬레이터 → 실기기)
1. 앱이 `https://ganghwa.app/?src=ios`를 열고 주소창 없이 로그인 화면이 보인다.
2. 카카오 로그인 → 콜백 → 게임 진입(3.0 스파이크). 실패하면 `allowNavigation`에 빠진 도메인이 있는지 Safari 웹 인스펙터로 확인.
3. 설정 > 알림 받기 → OS 권한 → 서버 `push_subscriptions`에 `apns:production:<token>` 행 생성(실기기만, 시뮬레이터는 토큰 없음).
4. 상점 → 결제 시트(StoreKit 플러그인 연결 후, Sandbox 테스터 계정).

## 결제 플러그인(미확정)
`window.__ganghwaIap`(getProducts·purchase·finish) 계약은 `app/(game)/shop/apple-checkout.ts`. 플러그인 확정 후 `lib/native/capacitor.ts`에서 같은 방식으로 브리지를 만든다.

## 빌드·제출
Xcode → Product > Archive → Distribute → App Store Connect(TestFlight). 버전은 `MARKETING_VERSION`/`CURRENT_PROJECT_VERSION`.
