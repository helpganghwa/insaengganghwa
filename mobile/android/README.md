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
- 프롬프트 3개(프로젝트 재생성 / 변경 적용 / versionName)에 답하면 서명까지 진행된다. 비밀번호는 `BUBBLEWRAP_KEYSTORE_PASSWORD`·`BUBBLEWRAP_KEY_PASSWORD` 환경변수로도 넘길 수 있다.
- ⚠ `minSdkVersion`은 **23**이어야 한다(twa-manifest.json). Bubblewrap 기본값 21로 두면 Play 결제 라이브러리와 충돌해 `Manifest merger failed : uses-sdk:minSdkVersion 21 cannot be smaller than version 23 declared in library [com.google.androidbrowserhelper:billing]`로 빌드가 깨진다.
- `app/`·`gradlew`·`build.gradle` 등 생성물은 커밋하지 않는다(정본은 twa-manifest.json, .gitignore 처리).
- 웹 매니페스트가 바뀌면 `bubblewrap update`로 twa-manifest.json을 재동기화한 뒤 빌드.
- ⚠ **`bubblewrap update` 직후 `startUrl`을 반드시 확인**한다. 이 명령은 웹 매니페스트의 `start_url`(`/`)을
  그대로 가져와 **`/?src=twa`를 지운다**. 표식이 사라지면 앱 진입이 감지되지 않아 ① 심사용 로그인 링크가
  앱에서 안 보이고 ② Digital Goods API가 없는 기기에서 결제 안전망이 무력화된다(2026-09-11 전수조사).
  값이 `/`로 바뀌었으면 `/?src=twa`로 되돌린 뒤 빌드할 것.
- 버전 올릴 때 `appVersionCode` +1, `appVersionName` 갱신 후 빌드.

## 빌드 뒤 손봐야 하는 생성물(2026-09-11 전수조사)

`bubblewrap build`는 `app/` 아래를 매번 새로 만든다. 아래 두 가지는 생성 직후 고친 뒤 빌드해야 한다.

1. **런처 아이콘 배경** — `app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml`의 배경 레이어가
   `@android:color/white`로 박혀 있다. 브랜드 색이 어두워서 안드 12+ 시스템 스플래시에 흰 배경이
   번쩍인 뒤 어두운 화면으로 넘어간다. `#151518`로 바꾼다.
2. **Chromebook 배포** — 병합 매니페스트에 `uses-feature` 선언이 없어 Play가 터치스크린을 필수로
   본다. 터치 없는 Chromebook이 배포 대상에서 빠진다. 포함하려면
   `<uses-feature android:name="android.hardware.touchscreen" android:required="false" />`를
   `app/src/main/AndroidManifest.xml`에 추가한다.

## Play Console 이후
1. 내부 테스트 트랙에 AAB 업로드.
2. App integrity > **앱 서명 키 인증서 SHA-256** 복사 → Vercel `PLAY_ASSETLINKS_SHA256`(업로드 키 지문과 쉼표로 병기) → 재배포 → `https://ganghwa.app/.well-known/assetlinks.json` 확인.
3. 설치 후 주소창이 보이면 assetlinks 불일치(지문·패키지명 확인).
4. Play 결제는 `features.playBilling`가 켜져 있어야 Digital Goods API가 동작한다(설정 완료).
5. **광고 ID 선언 = 아니요**. 병합된 AndroidManifest에 `com.google.android.gms.permission.AD_ID`가 없다(권한은 INTERNET·ACCESS_NETWORK_STATE·POST_NOTIFICATIONS·BILLING·DYNAMIC_RECEIVER_NOT_EXPORTED뿐). 웹의 gtag·카카오 픽셀은 쿠키 기반이라 안드로이드 광고 ID와 무관하다. 빌드마다 `app/build/intermediates/merged_manifest/release/.../AndroidManifest.xml`로 재확인할 수 있다.
