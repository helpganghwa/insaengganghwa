# 인생강화 (insaengganghwa) — 개발자 가이드 (Claude / 신규 컨트리뷰터용)

> 시간기반 idle + 한국식 RPG 강화 모바일 웹 게임. 1인 개발, 5년 운영 목표.
> 모든 게임/행정 결정은 `docs/` 에 문서화되어 있음 — 코드 작성 전 해당 문서 먼저 확인.

---

## 1. 기술 스택

| 영역 | 선택 | 이유 |
|------|------|------|
| **프레임워크** | Next.js 16 (App Router) | Cache Components, React Compiler 1.0, Turbopack 안정 |
| **런타임** | React 19.2 | Next 16 동봉 |
| **언어** | TypeScript (strict) | 타입 안전성 5년 운영 필수 |
| **패키지 매니저** | **Bun** | npm 대비 빠름, native lockfile |
| **스타일** | Tailwind CSS v4 + shadcn/ui | 픽셀아트와 분리, 디자인 토큰 |
| **DB** | Supabase (Postgres, Seoul/Tokyo) | 1인 운영 친화, RLS |
| **ORM** | Drizzle | 마이그레이션 안정성, TS 타입 자동 |
| **인증** | Kakao OAuth (Supabase Auth) | 한국 유저 대상 단독 인증 |
| **결제** | 포트원 + KMC/PASS 본인인증 | 카카오페이/토스/카드 |
| **영수증** | PG(포트원/이니시스) 결제모듈 | 결제창 이메일 입력 → PG 매출전표 발송으로 영수증 의무 갈음(자체 발송 없음) |
| **AI 검토** | Anthropic SDK (Claude Sonnet 5 vision) | 프로필 자동 검토 — NSFW/품질/일치성 (PROFILE §5) |
| **AI 스프라이트** | Pixellab v2 (Pro Tier 3) | 캐릭터 프로필 생성 — `/v2/create-character-v3` (PROFILE §4) |
| **모니터링** | 자체 client_errors 수집(/api/client-error + 에러 바운더리 리포트) | Sentry는 미도입 — 필요 시 재검토 |
| **배포** | Vercel (Edge + Cron) | 빠른 배포, KST Cron |
| **광고** | AdMob Web (1차) | 보상형 광고 |
| **레이트리밋** | Upstash Redis | 강화/보석 API 어뷰징 방어 |
| **테스트** | Vitest | 밸런스 시뮬레이션 + 단위 |

> 변경 시 ROADMAP.md + 본 문서 동시 업데이트.

---

## 2. 디렉터리 구조 (계획)

```
insaengganghwa/
├── docs/                    # 기획/행정/스키마 문서 (개발 전 필독)
│   ├── IDEA.md
│   ├── GDD.md              # 게임 디자인
│   ├── BALANCE.md          # 수식/확률 — 코드와 1:1 매칭 필수
│   ├── SCHEMA.md           # DB 스키마
│   ├── WIREFRAMES.md       # 화면 구조
│   ├── REGULATORY.md       # 법규/등급분류
│   ├── ROADMAP.md          # 개발 일정
│   ├── AUTOMATION.md       # 1인 운영 자동화 (예정)
│   ├── ISSUES.md           # 발견 이슈 트래커 (예정)
│   └── CHANGELOG.md        # (출시 후)
├── app/                     # Next.js App Router 라우트
│   ├── (game)/             # 인증 필요 라우트 그룹
│   ├── (public)/           # 비로그인 가능 라우트
│   ├── (admin)/            # 운영자 전용
│   ├── api/                # Route Handlers (서버 권위 API) + webhooks
│   ├── og/[shareCode]/     # ImageResponse — 동적 OG
│   └── layout.tsx
├── components/
│   ├── ui/                 # shadcn 기본 컴포넌트
│   ├── game/               # 강화소/보급소 등 게임 도메인
│   └── pixel/              # 픽셀아트 렌더링
├── lib/
│   ├── db/
│   │   ├── schema/         # Drizzle 스키마 (도메인별 분할)
│   │   ├── client.ts       # 서버 전용 클라이언트
│   │   └── migrations/
│   ├── game/
│   │   ├── enhance/        # 강화 로직 (시간/확률/RNG)
│   │   ├── gacha/
│   │   ├── raid/
│   │   └── balance.ts      # BALANCE.md 공식 — 단일 진실 원천
│   ├── auth/               # Kakao OAuth + 본인인증
│   ├── payment/            # 포트원 + IAP
│   ├── ads/                # AdMob 검증
│   ├── kst.ts              # KST 변환 헬퍼
│   └── server-only.ts      # 서버 전용 import 가드
├── tests/
│   ├── balance/            # Vitest 시뮬레이션
│   └── transactions/       # 강화 큐 트랜잭션
├── public/
│   └── sprites/            # 픽셀아트
├── scripts/                # DB seed, balance 시뮬 CLI
├── .env.example
├── drizzle.config.ts
├── next.config.ts
├── tsconfig.json
├── package.json
├── bun.lock
└── CLAUDE.md               # 본 문서
```

---

## 3. 핵심 원칙

### 3.1 모든 RNG는 서버에서만

강화/보급/크리/데미지 RNG는 **반드시 서버 트랜잭션 내**에서 결정. 클라이언트는 결과 애니메이션만.

```typescript
// ❌ 절대 금지
const result = Math.random() < successRate ? 'success' : 'fail';

// ✅ 서버 라우트 핸들러 또는 Server Action 내부에서만
const rolled = crypto.getRandomValues(new Uint32Array(1))[0] % 10000;
```

### 3.2 시간은 서버 시계만 신뢰

시간기반 강화의 핵심 안티치트. 클라이언트가 보낸 "지금 시각"이나 "남은 시간"은 무조건 무시.

```typescript
// ❌ 클라이언트 신뢰
if (clientReportedRemainingMs <= 0) resolveJob();

// ✅ 서버 시계 비교
const job = await tx.select().from(enhancementJobs)
  .where(and(eq(...), lte(enhancementJobs.completeAt, sql`now()`)))
  .for('update');
if (!job) throw new Error('NOT_READY');
```

### 3.3 모든 게임 액션은 트랜잭션

자원 차감 + 상태 변경 + 감사 로그 = **한 트랜잭션**. 부분 실패 절대 금지.

### 3.4 멱등성 (Idempotency)

- 결제 webhook: `portoneOrderId` UNIQUE
- 레이드 도전: `idempotencyKey` UNIQUE
- 강화 큐 완료: `for update` + `status='running'` 조건부 transition

### 3.5 확률공시 = 코드와 1:1

`BALANCE.md`의 모든 확률/시간/비용은 `lib/game/balance.ts`의 상수와 정확히 일치해야 함. 불일치는 형사처벌 위험 (게임산업법 §33).

```typescript
// lib/game/balance.ts — 단일 진실 원천
export const SUCCESS_RATES = {
  15: 5000,  // BALANCE.md §2.1과 동일
  20: 800,
  // ...
} as const;
```

변경 시 `probability_snapshots` 테이블에 영구 기록 + 사이트 공지 24시간 사전.

### 3.6 보호권/축복권 없음 (의도적)

일회용 안전망 아이템은 **도입하지 않음**. 위험 완화는 (a) 시간 비례 effective rate (끝까지 기다리면 base rate 도달) + (b) 이벤트 모디파이어 둘만. 이것은 디자인 결정이지 누락이 아님 — IDEA.md / GDD §3.2 참조.

### 3.7 자랑 단위 — 장비 전체

공유 카드(동적 OG)는 **장비 전체** 한 종류: 무기/방어구/장신구 3슬롯 세트 + 프로필 + 총 전투력. (장비 단위 1개 자랑은 폐기.) 등급 표기 없음(등급 시스템 자체가 없음) — 강화/초월 레벨 + 전투력으로 표현.

### 3.8 시간 표기는 항상 KST 변환

DB는 UTC `timestamptz`. UI 표시 직전에 KST 변환 (`lib/kst.ts`). 절대 새벽 12시 같은 한국 기준 비즈니스 로직을 UTC로 직접 다루지 말 것.

```typescript
// ❌ UTC 자정 = 한국 오전 9시. 일일 보급 상자 충전 시점 어긋남
const dailyReset = new Date(now).setUTCHours(0, 0, 0, 0);

// ✅ KST 자정
const dailyReset = kstStartOfDay(now);
```

---

## 4. 자주 사용하는 명령어

```bash
# 패키지 매니저 — Bun 사용 (npm 사용 시 lockfile 충돌)
bun install
bun add <package>
bun remove <package>

# 개발 서버 (Turbopack 기본) — 포트 5174
bun dev

# 빌드 + 프로덕션
bun run build
bun run start

# 타입 체크
bun run typecheck

# 린트 (ESLint)
bun run lint
bun run lint:fix

# Drizzle
bun run db:generate    # 스키마 → 마이그레이션 SQL 생성
bun run db:migrate     # 마이그레이션 적용
bun run db:studio      # GUI 인스펙터

# 테스트 — 러너는 package.json "test": "vitest run" (Bun 네이티브 `bun test`는 server-only stub 미적용으로 일부 fail)
bun run test             # Vitest 전체
bun run test balance     # 밸런스 시뮬레이션만

# 시드 / 시뮬
bun run scripts/seed-catalog.ts
```

---

## 5. 코딩 컨벤션

### 5.1 TypeScript

- `strict: true` 필수
- `any` 사용 금지 (불가피하면 `unknown` 후 type guard)
- Drizzle 스키마는 도메인별 파일 분할 (`schema/equipment.ts`, `schema/economy.ts` 등)
- DB 컬럼은 snake_case, TS는 camelCase — Drizzle이 자동 변환
- `bigint` 사용 — 자원 수치는 `int32` 한계 회피

### 5.2 React / Next.js

- **Server Components 기본**, Client Components는 `"use client"` 명시
- Server Actions로 폼 처리 (가급적 Route Handler보다 우선)
- `Image` 컴포넌트는 픽셀아트엔 부적합 → 자체 픽셀 렌더러 (`<PixelSprite>`) 사용
- Cache Components (`use cache`) 명시적 사용 — 자동 캐시 의존 X
- **고정 390 스케일**: 출력 메타는 정확히 `<meta name="viewport" content="width=390">` (initial-scale 없음). `app/layout.tsx`의 `export const viewport = { themeColor, width: 390, initialScale: undefined }`로 지정. ⚠ **`initialScale: undefined` 절대 제거 금지** — Next는 viewport export를 기본값 `{width:'device-width',initialScale:1}`과 스프레드 병합 후 non-null 필드만 직렬화하므로, `{width:390}`만 두면 기본값 `initialScale:1`이 살아남아 출력이 `width=390, initial-scale=1`이 되고 **375서 15px 가로 스크롤 재발**(검증됨). `initialScale: undefined`가 기본값 1을 덮어써 출력에서 제거됨 — 이것이 metadata API로 순수 width=390을 내는 유일한 방법(리터럴 `<meta>`는 Next 자동 주입분과 **중복**되어 불가, 검증됨). `width=390`만 있으면 브라우저가 initial-scale=기기폭/390 자동 계산해 390 레이아웃을 화면에 꽉 맞춤(작은 폰 축소·큰 폰 확대, **모든 화면 동일 비율·좌우 여백0·가로 스크롤0**). 앱 셸 `w-full max-w-[390px] mx-auto`(safe-area). 모든 화면을 390 컬럼으로 구현. ⚠ `initial-scale`/`maximum-scale`/`user-scalable=no` 중 하나라도 들어가면 자동 핏 무력화 — 스케일 잠금 금지(핀치줌 허용 감수). ⚠ **html/body에 `overflow-x`(overflow-x-hidden 등) 절대 금지** — overflow가 한 축만 걸리면 타축이 visible→auto로 계산돼 body가 스크롤 컨테이너가 되고 AppHeader(`sticky top-0`)·BottomNav(`sticky bottom-0`) 고정이 풀림(검증됨). width=390라 가로 오버플로 자체가 없어 가드 불필요; 특정 요소가 390 초과 시 그 요소를 수정. WIREFRAMES §0 참조

### 5.3 컴포넌트

- 한 파일 한 컴포넌트 (관련 보조 컴포넌트는 같은 파일 OK)
- Props는 `interface` (확장 가능), 내부 타입은 `type`
- 컴포넌트명 PascalCase, 파일명도 PascalCase (`EnhanceSlot.tsx`)

### 5.4 게임 로직

- `lib/game/balance.ts`는 절대 변하지 않는 단일 진실 원천. 모든 확률/시간 수치는 여기서만 가져옴.
- 트랜잭션 함수는 `lib/game/<domain>/<action>.ts` 1파일 1액션.
- 모든 트랜잭션 함수는 Vitest 단위 테스트 의무.

### 5.5 주석

- "왜 (Why)"만 적음. "무엇 (What)"은 코드가 설명.
- 법적/사행성/안티치트 관련 결정은 반드시 주석 (`// 게임산업법 §33 — 공시 일치 검증`).

### 5.6 에러 처리

- 사용자 입력: zod 스키마 검증
- 내부 호출: 타입으로 보장, 런타임 검증 생략
- 에러 코드는 `SCREAMING_SNAKE_CASE` 상수 (`'SLOT_BUSY'`, `'NOT_READY'`, `'INSUFFICIENT_FODDER'`)

---

## 6. 시간기반 강화 — 특수 규칙

이 게임의 **가장 중요한 차별점**이자 가장 큰 보안/일관성 함정. 코드 작성 시 항상 의식.

### 6.1 강화 라이프사이클 = 트랜잭션 분리

`docs/SCHEMA.md` 참조.

1. **(A) 큐 등록** — 슬롯 잠금, 자원 escrow(즉시 차감), `complete_at = now() + duration` stamping
2. **(B) 큐 완료** — Lazy(클라이언트 조회 시) + Cron(24h 미해결 자동 처리). `complete_at <= now()` 서버 시계 검증 → RNG → 결과 적용 → 로그
3. **(C) 보석 단축** — 보석 차감 + `complete_at` 단축. 환산률은 등록 시점 값 영구 유지 (소급 금지)
4. **(D) 취소** — `status='running' → 'cancelled'` 조건부 전이. 슬롯 lane 즉시 해제
5. **(D+A) 슬롯 교체** — (D)+(A) 단일 트랜잭션

### 6.2 절대 금지 패턴

```typescript
// ❌ 클라이언트가 보낸 시간 기반 판정
if (req.body.remainingMs <= 0) resolveJob();

// ❌ "이미 완료됐다고 클라이언트가 알려줬으니" 결과 적용
if (req.body.alreadyDone) applyResult();

// ❌ 환산률을 진행 중 큐에 소급 적용
UPDATE enhancement_jobs SET total_reduced_ms = ... WHERE status = 'running';
```

### 6.3 항상 해야 하는 패턴

```typescript
// ✅ 서버 시계로 검증
where: and(eq(jobs.id, jobId), lte(jobs.completeAt, sql`now()`))

// ✅ for update + 조건부 transition
.for('update')
SET status = 'completed' WHERE status = 'running'

// ✅ 환산률 스냅샷
gemTimeReductions.conversionRate = currentRate  // 변경되어도 이 작업은 이 값 유지
```

---

## 7. 환경 변수

`.env.example`로 빈 값 템플릿 유지. **실제 시크릿은 절대 커밋 안 함**. 키 목록은 `.env.example` 참조.

---

## 8. Git 워크플로 / 환경 분기

3분기 전략. **현재 단일 DB**(분기 옵션은 §8.1). 

| 브랜치 | 역할 | 환경 | 도메인 |
|--------|------|------|--------|
| `dev` | 로컬 작업 기본 (feature 통합 전) | 로컬 (`bun dev`) | localhost:5174 |
| `master-dev` | 통합·스테이징 — Vercel 자동 배포(검증용) | Vercel preview | `insaengganghwa-git-master-dev-…vercel.app` (Vercel 배정 URL) |
| `master` | **프로덕션** (Vercel Production Branch) | Vercel production | **ganghwa.app** |

### 규칙
- 기능 작업: `dev`에서 (또는 `feat/<scope>` 토픽 → `dev`).
- 스테이징 검증: `dev` → `master-dev` push → Vercel 배정 URL 확인.
- 프로덕션 배포: `master-dev` → `master` push → **ganghwa.app 자동 반영**.
- 커밋: Conventional Commits. `master`는 검증 끝난 변경만(직접 작업 금지, master-dev 경유).

### Vercel 연결
- **Production Branch = `master`** (대시보드 → Settings → Build and Deployment / Environments) → `ganghwa.app` 자동 매핑.
- `master-dev`·기타 = preview(자동 URL). `master-dev` 안정 URL = 스테이징.
- 환경변수: Vercel Production/Preview 분리 입력, 로컬 `.env.local`과 별개.
- **git committer 이메일 필수**: 프로젝트 `gitForkProtection` 활성 상태 — push되는 HEAD 커밋의 committer가 GitHub 사용자와 연결되지 않으면 Vercel이 빌드를 `BLOCKED`(빌드 로그 0줄) 처리한다. repo 소유 GitHub User `helpganghwa`(id 296071338)의 noreply 이메일 `296071338+helpganghwa@users.noreply.github.com` 사용(검증 불필요·항상 연결). 신규 클론 시 `git config user.email` 동일 설정.

### 8.1 Supabase 환경 분리 (선택)
master/master-dev로 DB도 나눌 수 있는가 — **가능**. 두 방식:
- **옵션 A (권장·저비용)**: Supabase 프로젝트를 **prod/staging 2개**(둘 다 서울 ap-northeast-2) 생성 → Vercel **Production env = prod DB**, **Preview env = staging DB**. master(도메인)=prod, master-dev=staging 자연 분리. 유료 기능 불필요, Drizzle 마이그레이션만 각 DB에 적용.
- **옵션 B**: Supabase **Branching**(Pro 플랜 유료, GitHub 연동 — 브랜치별 DB 자동 생성/마이그레이션). 자동화 강하나 비용·복잡도 ↑.
- **현재 상태**: 단일 Supabase(서울)로 마이그레이션 완료. 결정 전까지 단일 유지(스테이징=프로덕션 데이터 공유 — 실유저 전 허용 가능 리스크).

---

## 9. 작업 전 항상 확인할 문서

| 작업 유형 | 필독 문서 |
|---------|----------|
| 강화/가챠 로직 | `BALANCE.md` + `SCHEMA.md` + `GDD.md` |
| 데미지/레이드 | `BALANCE.md` + `GDD.md` |
| 결제/IAP | `REGULATORY.md` + `SCHEMA.md` + `GDD.md` |
| 본인인증 | `REGULATORY.md` + `SCHEMA.md` |
| 광고 | `GDD.md` + `SCHEMA.md` + `REGULATORY.md` |
| 공유/자랑 | `GDD.md` + `SCHEMA.md` + `WIREFRAMES.md` |
| 운영/어드민 | `SCHEMA.md` (+ `AUTOMATION.md` 예정) |
| UI/화면 | `WIREFRAMES.md` + `GDD.md` |
| 새 이슈 발견 | 영향 문서 업데이트 (+ `ISSUES.md` 트래커 예정) |

---

## 10. 문서 우선 원칙

코드 작성 전 문서 확인. 문서가 부족하면 코드 작성 전에 문서부터 업데이트. 5년 운영을 견디는 코드는 5년 후 본인이 읽을 수 있는 문서에서 시작.

> **유일한 예외**: 긴급 핫픽스 (보안/결제 등). 단 핫픽스 후 24시간 내 문서 동기화.

---

## 11. 성능 아키텍처 (서버 지연 방지) — 필수 준수

서버 권위 트랜잭션 게임 + idle 트래픽 특성상, 지연의 주원인은 **프레임워크가 아니라** ① 서버리스 콜드스타트 ② 요청당 인증 네트워크 왕복 ③ 콜드 커넥션 핸드셰이크 ④ 요청당 DB 왕복 수다. 아래는 협상 불가 기본값 — 코드/설정에 처음부터 강제한다.

### 11.1 인증 = 로컬 JWT 검증
- 요청 경로에서 **액세스 토큰 서명을 로컬 검증**(비대칭 JWT / `getClaims` 류). Auth 서버로 네트워크 호출하는 `getUser()` 식 패턴을 핫패스에 두지 말 것 (요청당 1 RTT 제거).
- 토큰 무효/민감 작업 등 불가피한 경우만 원격 검증.

### 11.2 콜드스타트 = Fluid Compute + 리전 코로케이션
- **Vercel Fluid Compute 활성화**(인스턴스 웜 재사용·동시성). 함수 리전 **`icn1`(서울) 고정**(`vercel.json regions`).
- Supabase **서울 리전(`ap-northeast-2`)** + **트랜잭션 풀러(`:6543`)**. 컴퓨트·DB 동일 리전 코로케이션 유지.

### 11.3 DB 커넥션
- postgres.js `prepare: false`(pgbouncer 트랜잭션 풀러 정합) + 서버리스 풀 `max: 8`(cron :00 동시발화 6~7개 + 유저 트래픽 헤드룸, client.ts 주석 참조) · `idle_timeout` · `connect_timeout` 명시. 클라이언트 모듈 싱글톤 재사용(개발 HMR 폭발 방지).
- 마이그레이션은 `DIRECT_URL` = Supabase **Session pooler**(`...pooler.supabase.com:5432`, 유저 `postgres.<ref>`). 레거시 Direct(`db.<ref>.supabase.co:5432`)는 **IPv6 전용 → 대부분 환경 연결 불가**, 쓰지 말 것. 런타임 `DATABASE_URL` = Transaction pooler(`:6543`).

### 11.4 요청당 왕복 최소화
- 한 요청 내 의존 없는 쿼리는 **`Promise.all` 병렬**. N+1 금지. 게임 액션은 **단일 트랜잭션 1왕복** 지향(자원 차감+상태+로그를 한 tx).

### 11.5 불변 데이터 캐시
- 카탈로그·BALANCE 상수·확률공시 등 불변/준불변은 **`use cache`(Cache Components)**로 요청 경로에서 DB 제거.
- **게임 상태(강화/보석/초월/보급/레이드)는 캐시 금지** — 서버 권위·실시간·트랜잭션(§3·§6).

### 11.6 측정
- 핵심 액션(큐 등록·강화 시도·보급·초월·레이드 공격) **서버 처리 p95 목표 < 200ms**(서버 시간 기준) 로깅. 회귀 시 원인 위 1~5 순으로 점검.

> env 재발급 시: `DATABASE_URL`=서울 풀러 6543 · `DIRECT_URL`=서울 직결 5432 · Vercel 프로젝트 리전 `icn1` · Fluid Compute ON. (Pixellab은 빌드타임 에셋 — 런타임 무관)
