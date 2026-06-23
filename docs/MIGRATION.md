# 서비스 주체 이전 — 마이그레이션 가이드

> 전제(확정): **새 출발(데이터/계정 이관 없음)** · **새 GitHub·Vercel 계정** · **새 도메인** ·
> **Supabase dev/master DB 분기**(prod/staging 2개 프로젝트). 결제(PortOne)·광고(AdMob)는 추후 연결분.

코드는 대부분 **환경변수 기반**이고, 절대 URL은 **런타임 origin을 자동 추종**한다(공유링크·OG·OAuth
콜백). 따라서 이전 작업의 핵심은 **① 새 계정/프로젝트 생성 → ② 시크릿 교체 → ③ 콘솔 설정(redirect·
webhook·DNS) → ④ 새 DB에 스키마+시드**다. 데이터 이관이 없어 난이도가 낮다.

---

## 0. 권장 순서

1. 외부 계정/프로젝트 생성(GitHub·Vercel·Supabase ×2·Kakao·Upstash·Anthropic·Pixellab·Resend·Sentry·PostHog)
2. 새 GitHub 저장소로 push (+ committer 이메일 교체)
3. Vercel 새 프로젝트 연결 + **env 스코프 분리 입력**(Production=prod, Preview=staging)
4. Supabase prod/staging 각각 **스키마 마이그레이션 + 카탈로그 시드 + 트리거/RLS/스토리지**
5. Kakao·(PortOne) 콘솔 redirect/webhook을 새 도메인·새 Supabase로 설정
6. DNS 연결 → 스모크 테스트

---

## 1. 코드 측 (내가 처리 / 거의 없음)

- **도메인은 origin 자동 추종** — `app/s/*`, `app/og/*`, `app/auth/callback`, `BoastModal`, `RaidSessionCard`
  모두 `req.nextUrl.origin` / `window.location.origin` / `headers().get('origin')` 사용 → 새 도메인에서
  자동 동작. 코드 변경 불필요.
- **유일한 하드코딩**: `app/layout.tsx`의 `metadataBase` → `NEXT_PUBLIC_SITE_URL` env로 변경(반영함).
  표시용 텍스트(`BoastModal`)도 env화. 푸시 subject는 이미 `VAPID_SUBJECT`로 덮어쓰기 가능.
- **committer 이메일**: 아래 §2 참고(새 저장소 빌드 통과에 필수).

---

## 2. GitHub 저장소 (새 계정)

- 새 계정에 빈 저장소 생성 → 로컬 remote 교체 → push:
  ```sh
  git remote set-url origin https://github.com/<새계정>/<repo>.git
  git push -u origin master master-dev dev
  ```
- ⚠ **committer 이메일 교체 필수** — Vercel `gitForkProtection`이 push된 HEAD 커밋의 committer가
  GitHub 사용자와 연결 안 되면 빌드를 `BLOCKED`(빌드 로그 0줄) 처리한다. 새 GitHub 사용자의 noreply
  이메일(`<id>+<username>@users.noreply.github.com`)을 `git config user.email`로 설정.
  → CLAUDE.md §8 의 기존 이메일 설명도 새 값으로 갱신할 것.

---

## 3. Vercel (새 프로젝트) + env 분리

- 새 팀/프로젝트 → GitHub 저장소 연결. **Production Branch = `master`**. 리전 **`icn1`(서울)**,
  **Fluid Compute ON**(CLAUDE §11).
- **env 스코프 분리(핵심 — dev/master DB 분기의 실체)**:
  - **Production** 스코프(=master/prod 도메인): **prod** Supabase·시크릿.
  - **Preview** 스코프(=master-dev·dev): **staging** Supabase·시크릿. (`ALLOW_TEST_LOGIN=1`도 Preview만)
- 전체 키는 §9 표 참고. Production/Preview에 각각 입력(로컬은 `.env.local` = staging).

---

## 4. Supabase — prod/staging 2개 (dev/master 분기)

- 프로젝트 2개 생성, **둘 다 서울(`ap-northeast-2`)**. prod→Vercel Production, staging→Vercel Preview + 로컬.
- **각 DB에 동일 적용**:
  1. Drizzle 마이그레이션: `DIRECT_URL`=Session pooler(`...pooler.supabase.com:5432`, 유저 `postgres.<ref>`)로 `bun run db:migrate`.
  2. 수동 SQL **0001·0002** + **카탈로그 시드(108종)** — [[db-provisioning-state]]. 미적용 시 소프트락/NO_CATALOG.
  3. `handle_new_user` 트리거(프로필/스타터 지급) + 백필 마이그레이션.
  4. **RLS 정책** + **스토리지 버킷**(아바타·길드 문양·트로피 이미지) 생성·권한.
  5. **Kakao Auth provider** 설정(§5).
- 런타임 `DATABASE_URL`=Transaction pooler(`:6543`), 마이그레이션 `DIRECT_URL`=Session pooler(`:5432`).
  레거시 Direct(`db.<ref>.supabase.co:5432`)는 IPv6 전용이라 쓰지 말 것(CLAUDE §11.3).
- 로컬 JWT 검증(getClaims)은 새 프로젝트의 JWKS를 자동 사용(URL만 새 것이면 OK).
- ⚠ TRUNCATE CASCADE는 FK로 전파됨([[cbt-cutover-state]]) — 시드 스크립트 재실행 시 zones 등 유실 주의.

---

## 5. Kakao (새 앱)

- 앱 생성 → REST API 키·JS 키·client secret → env(`KAKAO_CLIENT_ID/SECRET`, `NEXT_PUBLIC_KAKAO_JS_KEY`).
- **동의항목**: 닉네임·프로필사진은 기본 강제(콘솔에서 선택동의 필수 처리), `account_email`은 **비즈앱 전환** 필요 — [[kakao-login-scope]].
- **플랫폼 도메인 등록**: 새 도메인 + Vercel preview 도메인 + `http://localhost:5174`(JS SDK).
- **Redirect URI**: 각 Supabase 프로젝트의 `<SUPABASE_URL>/auth/v1/callback`(prod·staging 둘 다).
  (앱 내 `/auth/callback`은 origin 자동 — Supabase가 그쪽으로 되돌림.)
- **Supabase Auth → Kakao provider**에 client id/secret 입력(prod·staging 각 프로젝트 별도).

---

## 6. PortOne (결제) — 추후 연결분

- `PORTONE_STORE_ID`·`PORTONE_API_KEY`·`PORTONE_API_SECRET`·`PORTONE_WEBHOOK_SECRET` → env(Prod=라이브, Preview=테스트).
- **웹훅 URL**을 새 도메인으로(`https://<새도메인>/api/.../webhook`). `portoneOrderId` UNIQUE 멱등 유지(CLAUDE §3.4).
- 본인인증(KMC/PASS) 채널 연결 — [[payment-identity-verification]].

---

## 7. 나머지 키 교체 (단순 — 데이터 이관 없음)

| 서비스 | 작업 |
|---|---|
| **Upstash** | 새 Redis(서울 근처). 레이트리밋은 휘발성 → 이관 불필요. URL·token 교체. |
| **Anthropic** | `ANTHROPIC_API_KEY`만 교체(프로필 검수·트로피 비전). |
| **Pixellab** | `PIXELLAB_API_KEY` 교체. **빌드타임 에셋**이라 런타임 무관. MCP 사용 시 MCP 설정 키도. |
| **Resend** | `RESEND_API_KEY` + `RESEND_FROM_EMAIL`. **새 도메인 발신 인증(SPF/DKIM)** 필요. |
| **Sentry/PostHog** | DSN·키·host 교체. |
| **VAPID(푸시)** | 재발급 시 기존 구독 무효 — 새 출발이라 무관. `VAPID_SUBJECT`=mailto:새도메인. |
| **CRON_SECRET** | 새 랜덤값. Vercel Cron 헤더와 일치. |
| **ADMIN_EMAILS** | 새 운영자 이메일. |
| **AdMob** | v1 보류([[ads-deferred-decision]]) — 지금 불필요. |

---

## 8. 도메인 / DNS

- Vercel 프로젝트에 새 도메인 추가 → DNS(A/CNAME) → SSL 발급.
- `NEXT_PUBLIC_SITE_URL` = `https://<새도메인>`(Production). Preview는 비워도 됨(origin 자동).
- 모든 콘솔의 redirect/webhook을 새 도메인으로(§5·§6).

---

## 9. 환경변수 전체 — 스코프별

`⭐` = Production/Preview에서 **값이 달라짐**(DB 분기·테스트/라이브). 나머지는 보통 동일.

| 키 | 스코프 | 출처 |
|---|---|---|
| `DATABASE_URL` ⭐ | Prod=prod / Preview=staging | Supabase Transaction pooler :6543 |
| `DIRECT_URL` ⭐ | 〃 | Supabase Session pooler :5432 |
| `NEXT_PUBLIC_SUPABASE_URL` ⭐ | 〃 | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` ⭐ | 〃 | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` ⭐ | 〃 | Supabase service role |
| `NEXT_PUBLIC_SITE_URL` ⭐ | Prod=새도메인 / Preview=비움 | 도메인 |
| `KAKAO_CLIENT_ID` / `KAKAO_CLIENT_SECRET` | 둘 다(redirect만 도메인별) | Kakao 앱 |
| `NEXT_PUBLIC_KAKAO_JS_KEY` | 둘 다 | Kakao 앱 |
| `PORTONE_*` ⭐ | Prod=라이브 / Preview=테스트 | PortOne |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | 둘 다 | Resend |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | 둘 다(분리 권장) | Upstash |
| `ANTHROPIC_API_KEY` | 둘 다 | Anthropic |
| `PIXELLAB_API_KEY` | 둘 다 | Pixellab |
| `NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_AUTH_TOKEN` | 둘 다 | Sentry |
| `NEXT_PUBLIC_POSTHOG_KEY` / `_HOST` | 둘 다 | PostHog |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | 둘 다 | web-push 재발급 |
| `VAPID_SUBJECT` | 둘 다 | mailto:새도메인 |
| `CRON_SECRET` | 둘 다 | 새 랜덤 |
| `ADMIN_EMAILS` | 둘 다 | 운영자 |
| `ENHANCEMENT_RNG_SEED` | 둘 다 | 임의 |
| `ALLOW_TEST_LOGIN` ⭐ | Preview=1 / Prod=미설정 | 테스트 로그인 |
| `ADMOB_APP_ID` / `ADMOB_SSV_SECRET` | 보류 | (v1 미도입) |

---

## 10. 스모크 테스트 (배포 후)

- [ ] 카카오 로그인 → 프로필 자동 생성(`handle_new_user`)
- [ ] 강화(시도·결과)·보급·레이드·대난투 동작 + 효과음
- [ ] 공유카드 OG 이미지 생성(`/og/...`) · 공유 단축링크(`/s/...`) 진입
- [ ] PWA 설치 · 푸시 구독
- [ ] Cron(일일 보급 충전) 동작
- [ ] (결제 연결 시) 웹훅 수신 + 영수증 메일

---

## 11. 주의/롤백

- **gitForkProtection**: committer 이메일 불일치 시 빌드 BLOCKED(로그 0줄) → §2 먼저 확인.
- **카탈로그 시드 누락** = 소프트락/NO_CATALOG → §4-2 필수.
- prod/staging **DB를 헷갈려 마이그레이션** 적용하지 말 것(env 스코프 = DB 분기).
- 새 도메인 전환 시 기존 공유링크·OG 캐시·OAuth redirect는 구도메인 기준 → 신규로 재생성.
