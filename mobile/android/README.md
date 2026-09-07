# Android(TWA) 패키징 — Bubblewrap

정본 설계는 `docs/PLAYSTORE.md`. 이 폴더는 AAB를 만드는 설정만 둔다. **키스토어·비밀번호는 커밋 금지**(.gitignore).

## 1회 준비 (운영자 Mac)
```bash
bun add -g @bubblewrap/cli          # 또는 npx @bubblewrap/cli
bubblewrap doctor                   # JDK 17·Android SDK 없으면 ~/.bubblewrap 아래 설치를 제안 → Y
```

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
- 웹 매니페스트가 바뀌면 `bubblewrap update`로 twa-manifest.json을 재동기화한 뒤 빌드.
- 버전 올릴 때 `appVersionCode` +1, `appVersionName` 갱신 후 빌드.

## Play Console 이후
1. 내부 테스트 트랙에 AAB 업로드.
2. App integrity > **앱 서명 키 인증서 SHA-256** 복사 → Vercel `PLAY_ASSETLINKS_SHA256`(업로드 키 지문과 쉼표로 병기) → 재배포 → `https://ganghwa.app/.well-known/assetlinks.json` 확인.
3. 설치 후 주소창이 보이면 assetlinks 불일치(지문·패키지명 확인).
4. Play 결제는 `features.playBilling`가 켜져 있어야 Digital Goods API가 동작한다(설정 완료).
