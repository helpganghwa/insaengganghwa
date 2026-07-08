# PROFILE — 캐릭터 프로필 시스템

> 유저 자기표현 단위. AI(Pixellab v2) 픽셀아트 1장으로 생성, Claude vision 자동 검토 통과 시 즉시 본인 프로필 목록에 추가. CLAUDE §3.7 "장비 전체" 자랑카드의 캐릭터 표현 슬롯. 1인 운영을 위해 수동 검토 없음 — 사후 신고로 대응.

---

## 1. 목적

- 유저가 자기 게임 캐릭터를 **본인 의도대로** 시각화. 강화·초월·전투력으로만 표현되던 자기표현을 외형으로 확장.
- 자랑카드("장비 전체" 동적 OG, §3.7) 좌측에 들어가는 캐릭터 비주얼 제공.
- 한 유저가 **여러 장 보유** 가능. 그중 하나가 active(=현재 표시되는 프로필).

비목적:
- 장비 변경에 따른 자동 갱신 — 안 함. 프로필은 생성 시점의 한 장면.
- 인게임 전투 표현 — 캐릭터는 인벤·자랑카드·랭킹 카드에서만 등장. 전투 화면은 별도 시스템.

---

## 2. 핵심 흐름

```
[유저] 옵션 선택·장비 3종 확인 → "생성"(다이아 escrow, 단일 트랜잭션)
                ↓
[Pixellab v2 create-character-pro] async 큐 (~6분)
                ↓
[서버 cron] 폴링·완성된 character_id의 south.png 다운로드
                ↓
[Claude vision] 자동 검토 (이미지 + description 동시 입력)
   ├ pass → user_profiles insert + 다이아 확정 + 우편함 알림
   └ fail → 다이아 환불 + 우편함 알림(검토 사유)
                ↓
[유저] 프로필 목록에 새 1장 등장 → 선택 시 active로 전환
```

사후 신고:
```
[다른 유저] active 프로필 보고 "부적절" 신고
   → reports.count 누적 (자동 차단 X)
[운영자] /admin/reports 에서 신고 많은 순으로 정렬 → 직접 조치(아바타 초기화·닉네임 초기화·경고·정지)·기각
```

장비 변경은 프로필에 영향 X. 다음 생성 시점의 새 장비가 다음 프로필 description에 반영.

---

## 3. 데이터 모델

### 3.1 `user_profiles`

정면(south) 1장만 보관 — 아바타는 앞모습으로 통일(8방향 회전 미도입).

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK profiles | 소유자 |
| `rotations` | jsonb | `{ south }` 정면 1 URL. Supabase Storage 미러링 결과 |
| `active_direction` | enum default `south` | 레거시 컬럼 — 항상 `south`, 미사용. 표시는 모두 `rotations.south` |
| `pixellab_character_id` | text | 원본 추적용(재다운로드 가능) |
| `options` | jsonb | 유저 옵션 4축 v2 확정: `{ gender, hair, expression, pose }` — 총 1,000 조합. enum 값은 §4.2·`lib/game/profile/compose.ts` |
| `equipment_snapshot` | jsonb | `{ weapon, armor, accessory }` 카탈로그 키 — 디버그·재현용 |
| `description_prompt` | text | 합성된 최종 description (재현·신고 처리용) |
| `report_count` | int default 0 | 누적 신고 수 (표시용, 자동 차단 X) |
| `created_at` | timestamptz | 검토 통과·풀 추가 시점 |

인덱스: `(user_id, created_at desc)`, `(report_count desc)`(운영자 신고 대시보드).

**정면만 사용**: Pixellab v2는 8방향 풀시트를 반환하지만 측/후면 품질이 낮아 **정면(south) 1장만** 저장·표시한다 — 아바타는 앞모습으로 통일(회전 UI 없음).

### 3.2 `profile_generation_jobs`

검토 큐가 아닌 **생성 작업 추적용**. AI 자동 검토 결과·환불 사유까지 한 행으로.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | bigserial PK | |
| `user_id` | uuid FK profiles | 요청자 |
| `pixellab_character_id` | text nullable | 생성 작업 ID (큐 등록 후 채워짐) |
| `description_prompt` | text | 합성된 최종 description |
| `options` | jsonb | 유저가 고른 옵션 |
| `equipment_snapshot` | jsonb | 요청 시점 장비 3종 |
| `diamond_escrow` | bigint | 차감된 다이아 |
| `status` | enum | `queued` / `downloading` / `ai_reviewing` / `accepted` / `rejected_ai` / `failed` |
| `ai_verdict` | jsonb nullable | Claude vision 응답(`{pass, reasons, raw}`) |
| `reject_reason` | text nullable | 환불 통지에 들어갈 사유 |
| `user_profile_id` | uuid nullable FK user_profiles | 통과 시 채워짐 |
| `created_at` | timestamptz | 요청 시점 |
| `resolved_at` | timestamptz nullable | accepted/rejected_ai/failed 시점 |

인덱스: `(status, created_at)` (cron 폴링용), `(user_id, created_at desc)`(유저 대기 표시용).

**유저당 활성 큐 1건 제약** — DB 레벨로 보장:

```sql
CREATE UNIQUE INDEX profile_gen_one_active_per_user
    ON profile_generation_jobs (user_id)
    WHERE status IN ('queued', 'downloading', 'ai_reviewing');
```

활성 큐가 있는 동안 동일 유저의 두 번째 INSERT는 UNIQUE 위반으로 실패 → 어플리케이션은 `PROFILE_GEN_IN_PROGRESS` 에러로 변환.

### 3.3 `profiles` 확장

| 추가 컬럼 | 타입 | 설명 |
|---|---|---|
| `active_profile_id` | uuid FK user_profiles nullable | 현재 표시 프로필. null = 미설정(아이콘 fallback) |

### 3.4 `profile_reports`

신고 1건 = 1행. 같은 유저가 같은 프로필을 중복 신고 못 함. reason enum은 AI 검토(§5.2)와 정렬 — `nsfw`/`violence`/`hate`/`quality` + 신고 전용 `impersonation`/`other`.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | bigserial PK | |
| `profile_id` | uuid FK user_profiles | 신고된 프로필 |
| `reporter_user_id` | uuid FK profiles | 신고자 |
| `reason` | enum | `nsfw` / `violence` / `hate` / `quality` / `impersonation` / `other` |
| `note` | text nullable | 보조 설명 (other용) |
| `created_at` | timestamptz | |

UNIQUE `(profile_id, reporter_user_id)` — 같은 유저 중복 신고 차단.

신고 발생 시 트랜잭션:
```sql
INSERT INTO profile_reports ... ON CONFLICT DO NOTHING;
-- 새 row가 들어가면 user_profiles.report_count += 1
UPDATE user_profiles SET report_count = report_count + 1 WHERE id = $ AND ROW_COUNT > 0;
```

닉네임 신고도 동일 모델 — `nickname_reports` 별도 테이블(스키마 동일, target=user_id). 본 문서는 프로필 중심, 닉네임은 §10에서.

---

## 4. 생성 도구 — Pixellab v2 `create-character-pro`

### 4.1 도구 사양 (2026-05-27 검증 — 사용자 web UI 결과와 우리 자동화 결과 동등성 확인)

- 엔드포인트: `POST https://api.pixellab.ai/v2/create-character-pro` (PIXELLAB_API_KEY Bearer).
- **method**: `create_from_concept` — concept_image(필수) + reference_image(선택) + description.
- **concept_image**: 512×512 권장 (max 1024). **톤·픽셀 결을 주도하는 ref**(굵은 outline·강한 cel shading 캐릭터).
- **reference_image**: **168×168 고정** (max 168, 128 쓰면 톤 약함). **구도·신체 비율 보조 ref**.
- **image_size**: **168×168 고정** — 128 쓰면 디즈니스 부드러운 톤. 168 = 캔버스 ~256px (animation 2x padding).
- **style_description**: **빈 string `""` 또는 미제출**. description의 Style 블록과 중복 노이즈 → 톤 약화 부작용 확인.
- **template_id**: `mannequin` (humanoid).
- **응답**: `{character_id, background_job_id, status: 'processing'}`. ~6분 비동기.
- **실패 처리**: pixellab 내부 service timeout(code 5000)은 transient — 자동 재시도 1~2회 후 환불.
- **인증**: v2 모든 endpoint Bearer API key 통과 (v1 `/generate-reference-to-8-rotations/background`는 web-only JWT, API key 403).

### 4.2 description 합성 규칙 (v3, 2026-05-27 motif 방식)

JRPG 아니메 픽셀아트 톤 고정. **6 블록** 결합:

```
1. HEADER          — "slim 7-heads-tall adult bishonen|bishojo young adventurer mascot character of insaeng-ganghwa game,
                     NOT chibi NOT super deformed, emphasizing tall slender [feminine|masculine] anime body proportions
                     [+ female: narrow slim waist, ample bust, curvy thighs], small head and long graceful legs."
2. Face            — 옵션: 체형·눈·표정 (gender별 jawline·lashes 분기)
3. Hair            — 옵션: 색만(스타일·길이는 공용 템플릿 fixed)
4. Motifs          — 장비 3종 컨셉/스타일을 아바타에 **메타포로 녹임** (직접 입거나 들지 않음):
                     · Weapon theme: weapon.art 발췌 → 어깨·망토·머리장식의 wing/horn/symbol/pattern 모티프
                     · Armor theme:  armor.art 발췌  → 의상 색·재질·엠블럼·실루엣
                     · Accessory theme: accessory.art 발췌 → 머리장식·귀걸이·소매·펜던트
                     "DO NOT have the character physically hold or wear the literal item" 명시.
5. Pose            — 옵션 enum + 각 pose에 "front-facing facing the viewer directly" 명시(뒷통수 방지)
6. Style           — 공용 STYLE 상수(colored rim outline, gradient cel shading, JRPG anime pixel, 흰배경)
```

**Motif 변경 의도(사용자 결정 2026-05-27)** — 이전엔 Outfit/Accessory/Holding 3블록으로 art를 그대로 입히고 들렸음. 결과: "literal item icon"이 캐릭터 옆에 분리되어 그려지거나 어색한 합성. Motif 통합으로 **캐릭터 디자인 통일성** + 모티프가 의상·실루엣에 녹아드는 일러스트레이션 톤.

예시:
- 드래곤 도끼 → 어깨에 작은 용 날개 또는 비늘 패턴
- 개구리 단검 → 초록 leaf 패턴 소매·녹색 톤 의상
- 팰러딘 흉갑 → 흰·금 oath 엠블럼 가슴, 어드벤처러 컷 의상

**비율 강제 필수** — `proportions`·`negative_description` 파라미터 spec에 없음. HEADER 블록의 비율 강조 문구가 유일한 제어 수단. female은 일본 아니메 신체 라인(가는 허리·풍성한 가슴·curvy thighs) 명시적 묘사로 push.

장비의 `lore` 필드는 **사용 금지**(`sprite-prompt-visual-only`). `art` 필드의 외형 토큰만 채택. `sanitizeArt()`가 catalog의 "item icon ... transparent background" boilerplate 제거.

매핑 함수는 `lib/game/profile/compose.ts:composeDescription(opts, eq)` (서버 전용). 변경 시 본 §4.2 갱신.

### 4.3 reference 풀

`create_from_concept`은 concept·reference 두 ref를 **다른 이미지로 분리** 필수 (같은 ref 중복 시 톤 약화·짜리몽땅, 2026-05-27 검증).

**역할 매핑 — `concept_image`가 톤 주도**:
- `concept_image`: 굵은 픽셀·진한 colored outline·강한 cel shading의 ref. 톤·아니메 결 결정.
- `reference_image`: 구도·신체 비율 보조.

**외부 reference 3장 고정 (v1 확정)** — 사용자 검증 톤만 채택, 본인 캐릭터 추가 없음. 풀 확장은 운영 후 필요 시점.

위치: `public/sprites/profile/refs/`

| 파일 | 원본 | 톤 강도 | 추천 슬롯 |
|---|---|---|---|
| `concept-bishonen-red.png` | 빨강머리 청년 (남자) | **매우 강함** — 굵은 outline, 강한 cel shading | **concept (default 모든 케이스)** |
| `reference-bishojo-elf.png` | 엘프 어드벤처러 (여자, 7-heads, 녹색 드레스) | 강함 — 슬렌더 7-heads | reference (female 학자·warrior) |
| `reference-bishojo-adventurer.png` | 어드벤처러 (여자, 노란 튜닉) | 중간 | reference (female ranger·casual) |

**검증된 매핑 (2026-05-27, character v6 만족 도달)**:

| gender | concept_category | concept_image | reference_image |
|---|---|---|---|
| female | scholar / warrior | `concept-bishonen-red` | `reference-bishojo-elf` |
| female | ranger / rogue | `concept-bishonen-red` | `reference-bishojo-adventurer` |
| male | * (all) | `concept-bishonen-red` | `reference-bishojo-elf` |

**핵심 원칙**: concept_image는 모든 케이스에서 `concept-bishonen-red` 고정 (가장 강한 톤·검증). reference_image만 분기. 다양성은 description의 gender·concept·hair·표정으로.

유저 옵션 → 매핑 함수는 `lib/game/profile/refs.ts`의 `pickRefs(opts) → {conceptUrl, referenceUrl}` (서버 전용 상수). v2엔 유저 직접 ref 선택 없음.

### 4.4 입력 검증

- 옵션은 **enum만**, 자유 텍스트 금지. 프롬프트 인젝션·부적절 입력·결과 일관성 동시 차단.
- 카탈로그 키는 본인 인벤토리에 있는 장비만(서버 검증). 미보유 키 → `EQUIP_NOT_OWNED`.
- 활성 생성 작업 1건 이상 있으면 신규 요청 차단 → `PROFILE_GEN_IN_PROGRESS` (§3.2 UNIQUE 인덱스로 DB 보장).

---

## 5. AI 자동 검토 — Claude vision

### 5.1 검토 흐름

1. 서버 cron이 `status=downloading` 작업의 character_id로 `/v2/characters/{id}` 호출 → **정면(south) PNG** 다운로드 → Supabase Storage 미러링(`profiles/{user_id}/{job_id}/south.png`) → `status=ai_reviewing`로 전이. AI 검토도 `south.png` 입력.
2. Claude API (Anthropic SDK) multimodal 호출:
   - 입력: south.png + description_prompt + 검토 기준 system prompt
   - 출력: 구조화 JSON `{pass: bool, reasons: [enum...], notes: string}`
3. `pass=true` → `user_profiles` insert + 다이아 escrow 확정 + status=accepted + 우편함 안내 "프로필 생성 완료".
4. `pass=false` → 다이아 환불 + status=rejected_ai + reject_reason 저장 + 우편함 안내 "프로필 검토 미통과: <이유 요약>".

### 5.2 검토 기준 + system prompt (확정 v3, 2026-05-27 dry-run 4/4 통과)

**모델**: `claude-haiku-4-5-20251001` (vision multimodal). prompt caching으로 system prompt 캐시 (5분 TTL).

**역할 한정 — SAFETY moderator only**. quality judge 아님, description-match judge 아님. 사용자가 "마음에 안 듦"은 재롤(다이아) 영역. AI는 **objectively harmful or catastrophically broken**만 차단.

판단 카테고리(reason enum, 4종):
- `nsfw` — 성기/유두 노출, 성적 자세
- `violence` — 명백한 잔혹·절단·신체 분리
- `hate` — 혐오 상징(swastika 등)
- `quality` — 인식 불가 노이즈, 머리/몸 없음, 다중 머리·팔다리 등 심각한 해부학 깨짐

**제거**: `description_mismatch` reason — 비율·스타일·디테일 불일치를 AI가 자체 판정하려 들면 false positive 폭증(v1·v2 dry-run 검증).

**dry-run 결과로 박제된 PASS 원칙** (system prompt 마지막):
> When in doubt: PASS. The cost of a wrong PASS is one slightly-disappointed user who pays to retry. The cost of a wrong FAIL is refunding a user for an image that was actually fine.

**system prompt 전문**: `lib/game/profile/ai-review.ts:SYSTEM_PROMPT` (서버 상수). 변경 시 dry-run 4건 재실행 + 본 §5.2 함께 갱신 필수.

**system prompt (영문, 서버 상수)**:

```text
You are a moderator for character profile generation in "insaengganghwa" — a JRPG-style pixel art idle RPG. Each user pays in-game diamonds to generate one character profile portrait via Pixellab AI.

Your task: given the generated character image (south-facing PNG) and the description prompt used to generate it, decide whether to PASS or FAIL the result. Failed profiles get full diamond refund — be lenient, only fail on CLEAR defects.

INPUT:
- Image: ~256x256 PNG, JRPG anime pixel art character.
- Description: text prompt used.

FAIL ONLY if clearly present:
- nsfw: explicit sexual content, nudity, inappropriate exposure
- violence: graphic gore, dismemberment
- hate: hate symbols, offensive imagery
- quality: face severely broken, limbs missing/detached, completely noise/garbage image
- description_mismatch: result fundamentally different from description (e.g. asked for human scholar, result is obvious monster)

PASS criteria:
- Recognizable as a character
- No clear inappropriate content
- Description elements roughly reflected (artistic deviation OK)

OUTPUT — strict JSON only:
{
  "pass": boolean,
  "reasons": ["nsfw" | "violence" | "hate" | "quality" | "description_mismatch"],
  "notes": "1-2 sentence explanation in Korean for failures, empty string for pass"
}

Be lenient. Only fail on CLEAR defects. "Could be better" or "head looks big" is NOT a fail — that's the user's call (they can pay to retry).
```

**user message**:
- image_block (south.png base64, image/png)
- text_block: `"Description used:\n\n<description_prompt>\n\nDecide pass/fail."`

**output 파싱**: JSON.parse + zod 스키마 검증. parse 실패·필드 누락 시 `status=ai_reviewing` 유지 + cron 재시도 (지수 백오프 3회).

### 5.3 비용·SLA (2026-05-27 dry-run 실측)

- Claude Haiku 4.5 vision 단가: in ~970 tok + out ~30 tok = **약 $0.0008/검토** (PASS 케이스 기준). 이미지 1장 입력 포함.
- prompt caching 적용 시 system prompt(~600 tok) 캐시 hit → 더 저렴.
- 응답 시간: ~1~3초.
- 실패 시 (Anthropic 장애·JSON 파싱 실패) → `status=ai_reviewing` 유지 + cron 재시도(지수 백오프 3회). 3회 모두 실패 시 자동 환불 + 운영자 알림 우편함.

### 5.4 우편함 통지 (MAIL §3 type 추가)

- `profile_accepted` — "프로필 생성 완료. 목록에서 선택하세요."
- `profile_rejected_ai` — "프로필 검토 미통과: <reasons 요약>. 다이아 환불 완료."
- `profile_failed` — "생성 시스템 문제로 환불 처리. 죄송합니다."

---

## 6. BALANCE

| 항목 | 값 | 비고 |
|---|---|---|
| 1회 생성 비용 | **1,500 다이아**(≈1일치 시간) | AI 검토 비용 포함. 첫 아바타(성공한 커스텀 0개)는 **50% 할인 750** — 신규 훅킹. 거절·환불은 할인 미소진 |
| 보유 가능 프로필 수 | 최대 100 (`PROFILE_MAX`) | 다이아 비용 자체가 어뷰징 차단 |
| 동시 생성 중인 작업 | **유저당 1건** | 활성 큐 있으면 신규 차단(§3.2 UNIQUE) |
| AI 검토 응답 SLA | < 30초 (Claude vision ~5초 + 다운로드·DB) | |
| AI 검토 통과율 목표 | 95%+ | 미만이면 prompt·기준 튜닝 |
| 거절 시 환불 | 100% 다이아 | escrow 그대로 반환 |
| Pixellab USD 비용 | ~$0.05~0.10/건 (Pro mode 추정) | Tier 3 10k/월 초과 시 credit 소진 — 모니터링 필요 |
| Claude vision USD | ~$0.005~0.01/건 | 미미 |

---

## 7. 신고 시스템

### 7.1 유저 신고 화면

다른 유저의 프로필이 표시되는 모든 위치(자랑카드 OG·랭킹 카드·hub 발견)에 **신고 아이콘**.

신고 폼:
- reason enum 4종 선택 (`nsfw` / `violence` / `hate` / `impersonation` / `other`)
- `other` 선택 시만 note 자유 텍스트 (200자)
- 같은 프로필 1유저 1신고 — UI에서 이미 신고한 거 disabled

### 7.2 운영자 화면 `/admin/reports`

- 정렬: `report_count desc, latest_report_at desc`
- 카드 내용:
  - 프로필 이미지·소유자 닉네임
  - 누적 신고 수 + reason 카운트 분포
  - 최근 신고 5건의 reason·note·신고자
  - 액션: **아바타 초기화**(위반 아바타 삭제 → 기본 아바타로 승계) / **닉네임 초기화** / **경고** / **계정 정지**(기간 지정·해제) / **기각**(신고 count 0 리셋)

권한: `profiles.is_admin = true` (MAIL §2.3과 동일).

**자동 차단 X** — 신고 누적은 표시·정렬만, 조치는 운영자 직접.

### 7.3 신고 어뷰징 방지

- UNIQUE `(profile_id, reporter_user_id)` — 같은 유저 중복 신고 차단.
- 신고는 다이아 등 비용 없음 (신고 진입 장벽 낮게).
- 한 유저가 N개 프로필 무차별 신고 → cooldown (예: 1시간 5건 한도) → `reporter_rate_limit` 테이블 또는 Redis.
- 신고자 신원은 운영자만 봄, 대상에겐 익명.

### 7.4 닉네임 신고

동일 구조 (`nickname_reports`, target=user_id). 운영자 조치 = 닉네임 강제 변경 요청 (우편함 통지). 본 문서 범위 밖.

---

## 8. 유저 화면

### 8.1 프로필 화면 (`/profile` 또는 hub 내)

- 상단: 현재 active 프로필 큰 이미지(`rotations.south`, 정면) + 닉네임·전투력
- 중단: 보유 프로필 목록(가로 스크롤, 작은 카드들). 카드 탭 = **프로필 상세** 이동.
- 하단: **"새 프로필 생성"** CTA — 다이아 잔액·가격 표시, 탭 시 옵션 선택 화면으로.
- 생성 중인 작업이 있으면 카드 상단에 "생성 중 (예상 N분)" 배지.

### 8.2 프로필 상세 — 대표 선택 (정면 고정)

- 큰 정면(south) 이미지 프리뷰 — 아바타는 앞모습 하나로 통일(방향 회전 없음).
- 액션: "active 프로필로 설정"(보유 목록 중 이 프로필을 메인으로) / "삭제"(확인 모달, hidden 처리는 운영자만).

### 8.3 옵션 선택 화면

옵션 4축(gender·hair·expression·pose) enum 선택 UI — 칩/드롭다운 4 row. 장비 3종은 현재 장착 자동 표시(편집 불가, `actions.ts`가 트랜잭션 안에서 본인 장착 조회). 미장착 슬롯 있으면 "장비 3종을 모두 장착하세요" 안내 + 생성 버튼 disabled. "생성 — N 다이아" 버튼(다이아 잔액 부족 시 disabled).

### 8.4 fallback

`active_profile_id IS NULL` 유저: 기본 아이콘(이모지 또는 정적 픽셀 1장)으로 자랑카드·랭킹·hub 모두 fallback.

### 8.5 신고 진입

- 자랑카드 OG 페이지(/og/[shareCode]) — 카드 우상단 신고 아이콘
- 랭킹 화면 — 각 행 우측 ⋮ 메뉴
- 본인 프로필은 신고 아이콘 비표시

---

## 9. 자랑카드 연결 (CLAUDE §3.7)

"장비 전체" OG는 **장비 3종 + 프로필 1장** 합성. 프로필 없으면 fallback. 이 OG는 satori(next/og) — 캔버스 못 씀 → 다운로드된 프로필 PNG를 `<img>` 그대로. 등급 프레임은 `transcend-visual-system` 규칙 그대로 장비에만, 프로필은 무프레임.

---

## 10. 보안·모더레이션

- 옵션 enum 검증: zod 스키마, 화이트리스트.
- 장비 키 검증: 본인 인벤 보유 확인.
- description은 **서버에서만 합성** — 클라이언트가 보낸 텍스트 절대 그대로 전달 금지(인젝션 차단).
- 다이아 차감은 큐 등록 트랜잭션 안에서. 멱등 키 = `(user_id, request_dedupe_token)` UNIQUE.
- Pixellab 응답 PNG 다운로드 시 매직 바이트(PNG header) 검증 + 사이즈 상한.
- AI 검토 system prompt는 서버 상수, 유저 입력 절대 섞지 않음.
- 신고 rate limit (Upstash Redis): 1인당 1시간 5건.
- 닉네임은 가입 시 + 변경 시 Claude moderation(텍스트만) 1차 통과 필수.

---

## 11. v2 후속

- 같은 캐릭터의 다른 포즈(combat-stance 등) 생성 — `create_character_state`.
- 프로필 애니메이션(idle breathing) — `animate_character`.
- 친구에게 프로필 선물.
- 프로필 시즌 컬렉션(이벤트 한정).
- 유저가 reference 직접 선택 (concept_pool에서 카드 픽).
- AI 검토 false negative 모니터링 대시보드.

---

## 12. 미해결 / 결정 대기

| # | 항목 | 결정 시점 |
|---|---|---|
| 1 | 다이아 가격: 5,000 vs 10,000 (default 10,000 박제) | Pixellab Pro 실측 USD + Claude vision 단가 합산 + 초기 운영 어뷰징 신호 |
| 2 | reference 풀 확장 — 현재 외부 3장 단일 쌍, gender·옵션 분기 필요한지 | 초기 베타 다양성 평가 후 |
| 3 | 디스크/CDN 정책: Supabase Storage 직접 vs 별도 CDN | 인프라 §11 검토 |
| 4 | 옵션 v2 enum이 충분히 다양한지 (현재 1,000 조합) | 베타 유저 100명 결과 보고 |
