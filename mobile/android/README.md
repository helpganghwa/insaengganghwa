# Android(TWA) 패키징 — Bubblewrap

정본 설계는 `docs/PLAYSTORE.md`. 이 폴더는 AAB를 만드는 설정만 둔다. **키스토어·비밀번호는 커밋 금지**(.gitignore).

## 1회 준비 (Mac, 2026-09-11 실제 설치 기준)

Bubblewrap이 자체로 JDK·SDK를 받아오는 대화형 흐름 대신, 아래 구성이 검증됐다.

```bash
brew install openjdk@17
SDK=~/.bubblewrap/android_sdk
mkdir -p "$SDK/cmdline-tools"
curl -fsSL -o /tmp/ct.zip https://dl.google.com/android/repository/commandlinetools-mac-11076708_latest.zip
unzip -q /tmp/ct.zip -d /tmp/ct && mv /tmp/ct/cmdline-tools "$SDK/cmdline-tools/latest"
yes | "$SDK/cmdline-tools/latest/bin/sdkmanager" --sdk_root="$SDK" --licenses
"$SDK/cmdline-tools/latest/bin/sdkmanager" --sdk_root="$SDK" "platform-tools" "platforms;android-36" "build-tools;36.1.0"
ln -sfn "$SDK/cmdline-tools/latest/bin" "$SDK/bin"     # ← 아래 ⚠ 참조
ln -sfn "$SDK/cmdline-tools/latest/lib" "$SDK/lib"
bun add -g @bubblewrap/cli
bubblewrap updateConfig --jdkPath /opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk \
                        --androidSdkPath ~/.bubblewrap/android_sdk
bubblewrap doctor      # "Your jdkpath and androidSdkPath are valid."
```

⚠ **두 가지 경로 함정**(둘 다 doctor가 엉뚱한 메시지를 낸다)
- `jdkPath`는 `Contents/Home`이 **아니라** `.jdk` 번들을 가리켜야 한다. Bubblewrap이 darwin에서 `/Contents/Home`을 스스로 덧붙이고, 그 안의 `release` 파일에서 `JAVA_VERSION="17.0`을 확인한다.
- `androidSdkPath`는 루트에 `tools/` 또는 `bin/`이 있어야 통과한다(구 레이아웃 가정). 요즘 cmdline-tools는 `cmdline-tools/latest/bin`에 풀리므로 위 심볼릭 링크가 필요하다. 링크가 없으면 `The androidSdkPath isn't correct ... contains the folder "build"`라는, 원인과 무관한 문구가 나온다.
- Bubblewrap 1.25가 요구하는 빌드 툴은 **36.1.0**이다. 미리 받아두지 않으면 빌드 중 대화형 설치 프롬프트가 뜬다.

## 업로드 키 생성 (최초 1회, 분실 시 Play 앱 서명 키 재설정 절차 필요)
```bash
cd mobile/android
keytool -genkeypair -v -keystore android.keystore -alias upload -keyalg RSA -keysize 2048 -validity 10000
# CN=인생강화, O=<사업자명>, C=KR. 비밀번호는 비밀번호 관리자에만.
keytool -list -v -keystore android.keystore -alias upload | grep SHA256   # 업로드 키 지문(assetlinks 병기용)
```

## 빌드
```bash
cd mobile/android
bubblewrap build                    # twa-manifest.json 사용 → app-release-bundle.aab / app-release-signed.apk
```
- 프롬프트(프로젝트 재생성 / 변경 적용 / versionName)에 답하면 서명까지 진행된다. ⚠ **"변경 적용(apply changes)"은 반드시 No** — 기본값 Yes라 Enter를 치면 `app/`을 다시 만들어 `patches/` 적용본(Chrome 고정 LauncherActivity·아이콘 배경·터치스크린)이 지워지고 versionCode가 또 오른다. 버전·minSdk는 `app/build.gradle`에 손으로 반영한다. 비밀번호는 `BUBBLEWRAP_KEYSTORE_PASSWORD`·`BUBBLEWRAP_KEY_PASSWORD` 환경변수로도 넘길 수 있다.
- ⚠ `minSdkVersion`은 **24**여야 한다(twa-manifest.json·app/build.gradle, 2026-09-23). Play 자동 보호(Integrity)가 24 이상을 요구해 23은 업로드가 거부되고, Bubblewrap 기본값 21은 Play 결제 라이브러리와 충돌해 `Manifest merger failed : uses-sdk:minSdkVersion 21 cannot be smaller than version 23 …`로 빌드가 깨진다.
- `app/`·`gradlew`·`build.gradle` 등 생성물은 커밋하지 않는다(정본은 twa-manifest.json, .gitignore 처리).
- 웹 매니페스트가 바뀌면 `bubblewrap update`로 twa-manifest.json을 재동기화한 뒤 빌드.
- ⚠ **`bubblewrap update` 직후 `startUrl`을 반드시 확인**한다. 이 명령은 웹 매니페스트의 `start_url`(`/`)을
  그대로 가져와 **`/?src=twa`를 지운다**. 표식이 사라지면 앱 진입이 감지되지 않아 ① 심사용 로그인 링크가
  앱에서 안 보이고 ② Digital Goods API가 없는 기기에서 결제 안전망이 무력화된다(2026-09-11 전수조사).
  값이 `/`로 바뀌었으면 `/?src=twa`로 되돌린 뒤 빌드할 것.
- 버전 올릴 때 `appVersionCode` +1, `appVersionName` 갱신 후 빌드.

## 빌드 뒤 손봐야 하는 생성물(2026-09-11 전수조사)

`bubblewrap build`는 "변경 적용"에 Yes로 답했을 때만 `app/` 아래를 새로 만든다(평소엔 No로 답해 패치 적용본을 유지). 재생성했다면 아래 세 가지와 `patches/LauncherActivity.java`를 다시 적용한 뒤 빌드해야 한다.

1. **런처 아이콘 배경** — `app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml`의 배경 레이어가
   `@android:color/white`로 박혀 있다. 브랜드 색이 어두워서 안드 12+ 시스템 스플래시에 흰 배경이
   번쩍인 뒤 어두운 화면으로 넘어간다. `#151518`로 바꾼다.
2. **Chromebook 배포** — 병합 매니페스트에 `uses-feature` 선언이 없어 Play가 터치스크린을 필수로
   본다. 터치 없는 Chromebook이 배포 대상에서 빠진다. 포함하려면
   `<uses-feature android:name="android.hardware.touchscreen" android:required="false" />`를
   `app/src/main/AndroidManifest.xml`에 추가한다.

3. **결제창 부활 방지(2026-09-29, 앱 1.0.2 코드 5)** — `patches/SafePaymentActivity.java`를
   `app/src/main/java/app/ganghwa/game/`에 복사하고, `patches/AndroidManifest.payment.xml`의 조각을 매니페스트에 반영한다
   (tools 네임스페이스·PaymentActivity 교체·ProxyBillingActivity/V2 추가).
   - 왜: 라이브러리 PaymentActivity는 되살아날 때(savedInstanceState 있음)도 결제를 새로 연다. 결제창을 띄운 채 앱을 떠났다
     돌아오면 결제창이 다시 뜨고, 확인하면 청구되지만 웹 결제 요청은 이미 사라져 주문과 연결되지 않는다(09-29 68,000원 청구·미지급).
     billing 모듈 최신(1.2.0)·업스트림 main도 같아서 라이브러리 업그레이드로는 못 고친다.
   - 확인: 빌드 뒤 병합 매니페스트(`app/build/intermediates/merged_manifest/release/.../AndroidManifest.xml`)에
     `org.chromium.intent.action.PAY` 필터가 **정확히 1개**(`.SafePaymentActivity`)이고, ProxyBillingActivity·V2에
     `finishOnTaskLaunch="true"`가 붙었는지 본다.
   - ⚠ `stateNotNeeded`를 켜지 말 것(복원 때 Bundle이 null로 와 가드가 무력화된다). `launchMode`를 singleTask/singleInstance로,
     `noHistory`를 켜는 것도 금지(Chrome이 결과를 즉시 취소로 받거나 홈 키마다 결과를 잃는다).
   - 한계: `finishOnTaskLaunch`는 **런처 아이콘**으로 다시 켤 때만 동작한다. 최근 앱 목록으로 돌아오면 남은 결제창이 보일 수 있고,
     확인하면 청구된다. 이런 구매는 상점 진입 복구(recoverPlayPurchases)·RTDN이 지급하고, 주인을 못 가리면 경보로 온다.

### 결제 실기기 확인(내부 테스트 트랙·테스트 결제) — 결제 화면을 건드린 빌드는 전부 통과해야 올린다
1. 정상 구매 → 지급·소모.
2. 결제창에서 취소 → 웹이 취소로 처리, 남은 화면 없음(`adb shell dumpsys activity activities | grep -A3 ganghwa`).
3. 결제창을 띄운 채 홈 → **아이콘**으로 재진입 → 결제창·결제 화면이 모두 사라짐.
4. 같은 절차를 **최근 앱**으로 재진입 → 결제창이 남을 수 있음(한계). 확인하면 상점 재진입 시 복구가 지급하는지 확인.
5. 개발자 옵션 "활동 유지 안 함" 켜고 결제창 → 홈 → 재진입 → logcat에 `SafePayment: restored`와 `Could not parse product ID.`가 한 번, 새 결제창 없음.
6. 결제창이 떠 있는 채 다크 모드 전환·글꼴 크기 변경 → 결제 화면 재생성 로그 없음, 결제 완료 후 정상 지급.
7. 보류 결제(테스트 카드 "느린 결제") → 보류 유지, 완료 뒤 지급.
8. `adb shell am kill app.ganghwa.game` 뒤 재진입해 결제 재시도 정상.

## Play Console 이후
1. 내부 테스트 트랙에 AAB 업로드.
2. App integrity > **앱 서명 키 인증서 SHA-256** 복사 → Vercel `PLAY_ASSETLINKS_SHA256`(업로드 키 지문과 쉼표로 병기) → 재배포 → `https://ganghwa.app/.well-known/assetlinks.json` 확인.
3. 설치 후 주소창이 보이면 assetlinks 불일치(지문·패키지명 확인).
4. Play 결제는 `features.playBilling`가 켜져 있어야 Digital Goods API가 동작한다(설정 완료).
5. **광고 ID 선언 = 아니요**. 병합된 AndroidManifest에 `com.google.android.gms.permission.AD_ID`가 없다(권한은 INTERNET·ACCESS_NETWORK_STATE·POST_NOTIFICATIONS·BILLING·DYNAMIC_RECEIVER_NOT_EXPORTED뿐). 웹의 gtag·카카오 픽셀은 쿠키 기반이라 안드로이드 광고 ID와 무관하다. 빌드마다 `app/build/intermediates/merged_manifest/release/.../AndroidManifest.xml`로 재확인할 수 있다.
