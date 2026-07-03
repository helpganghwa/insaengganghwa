# 아바타 생성 V2 파이프라인 (generate-image-v2)

> 상태: **레시피 검증 완료 · 미도입** — 운영은 `create-character-v3`(PROFILE.md §4) 유지.
> 이 문서는 무기 재현도가 특히 중요한 미래 용도(이벤트 일러스트, 단일 프레임 고품질 아바타, 후보군 생성)를 위해 검증된 호출 사양과 프롬프트 레시피를 보존한다.

---

## 1. 개요 — v3와의 차이

| 항목 | v3 (운영) | v2 (본 문서) |
|------|-----------|--------------|
| 엔드포인트 | `POST /v2/create-character-v3` | `POST /v2/generate-image-v2` |
| 출력 | 8방향 회전 세트 | **south 1프레임** |
| 무기 재현 | 텍스트 묘사만 → 형태 편차 발생 | **무기 스프라이트 이미지 컨디셔닝** → 실루엣·장식 충실 |
| 해상도 | 256 고정 | 256/512 선택 (512 권장 — 픽셀 균일도↑) |
| 비용 | 구독 generation (from-scratch 9 gen) | USD 크레딧: 256 $0.095 · 512 $0.185 |
| 편차 | 중간 | **run-to-run 편차 큼 → 도입 시 후보 게이트 필수** (§6) |

컴포즈(Claude 아트디렉터가 장비 스프라이트 vision + wornDesc + lore로 ~1900자 설명문 작성) 구조는 v3와 동일하며, 시스템 프롬프트 블록만 아래 레시피로 교체한다.

## 2. API 호출 사양

```jsonc
POST https://api.pixellab.ai/v2/generate-image-v2
{
  "description": "<컴포즈 결과, 최대 2000자>",
  "image_size": { "width": 512, "height": 512 },
  "no_background": true,
  "reference_images": [{
    "image": { "type": "base64", "base64": "<무기 스프라이트 PNG>" },
    "size": { "width": 112, "height": 112 },   // ⚠ size 필드 누락 시 422
    "usage_description": "<§4 무기 usage 문구>"
  }]
}
```

- 응답은 `background_job_id` → `GET /v2/background-jobs/{id}` 폴링(`status === 'completed'`), 결과는 응답 트리 내 base64 필드.
- **무기 참조는 112px로 물리 다운스케일**해서 첨부한다(sharp `fit: inside`, nearest). 원본 크기 그대로 넣으면 컨디셔닝에서 무기의 시각 비중이 커져 캐릭터 뒤에 무기가 거대하게 그려진다.
- 참조는 무기 1장만. 방어구·장신구는 참조 없이 컴포즈 텍스트로 충분히 재현된다.

## 3. 컴포즈 시스템 프롬프트 — 고정 블록

### OPENER — 결과 프롬프트 맨 앞에 verbatim 강제
2000자 한도에서 잘리는 것은 항상 꼬리이므로, 화풍·픽셀밀도 지시는 서두 고정 문장으로 강제한다(누락 시 굵은 격자/모자이크 렌더 발생).

```
Modern 2020s Japanese TV-anime character rendered in high-quality pixel art with FINE UNIFORM pixel density — one art pixel equals one canvas pixel across the entire image, the same crisp fine grain on the face, hair, clothing and weapon, never chunky enlarged pixel blocks or coarse mosaic.
```

### PROP — 비율
```
PROPORTIONS ARE THE TOP PRIORITY — a TALL SEVEN-heads-tall figure: the total height equals about SEVEN head-heights stacked (between 7 and 7.5 heads, NEVER more than 7.5, never fewer than 6.5). Long legs from hip to ankle taking up about half the total height, a high waistline, a slender neck, a compact torso and slim limbs — an anime key-visual silhouette. Keep ALL head accessories small and neat so the head reads small.
```

### STYLE
```
STYLE (EMPHASIZE STRONGLY): MODERN 2020s Japanese TV-anime character design in high-quality pixel art — contemporary anime key-visual, bright vibrant colors with refined modern color grading, clean thin linework. EYES: large rounded anime eyes with MULTI-LAYERED gradient irises (a deep base tone, a lighter inner gradient and several small bright highlights — a complex modern iris, not one flat shine), long soft lashes. FACES: soft rounded facial lines, small nose and mouth, young fresh faces with subtle minimal blush. HAIR: modern anime hair with fine strands, soft gradients and natural flow. BODY & CLOTHING (SAME TREATMENT HEAD TO TOE): the body, hands and clothing are drawn with the SAME modern anime stylization, line quality and shading as the face — slender natural anime body lines, relaxed natural posture, clothing fitted with natural fabric flow and folds. The character and the weapon share ONE unified pixel-art rendering with UNIFORM pixel density — crisp clean pixel clusters, consistent dithering and the SAME level of detail across the face, body, clothing and weapon. The modern Japanese-anime look is the most important stylistic goal.
```

### SUBJECT — 성별별
```
남: a handsome bishonen HERO — a young man in his early twenties (about 20-24) with a SLENDER OVAL face and DELICATE refined features: a softly tapered chin (gentle, never wide, never rugged), smooth slim cheeks, LARGE expressive anime eyes as big relative to his face as a heroine's (the same eye-to-face proportion), a small nose and mouth, smooth young skin, a composed graceful youthful impression like a light-novel protagonist, an East-Asian Japanese-anime idol face (never a Western comic or realistic face), a SMALL delicate head about one-seventh of his standing height, a TALL slim long-legged seven-heads-tall body; clearly male with a flat masculine chest

여: a beautiful bishojo HEROINE — a young woman in her early twenties (about 20-24) with a SLENDER OVAL face and DELICATE refined features: a softly tapered chin (gentle, never wide or chubby), smooth slim cheeks, LARGE expressive almond anime eyes with layered bright highlights and long lashes, a small nose and mouth, a composed graceful youthful impression like a light-novel heroine, a TALL slim long-legged body
```

남성 장비 변환(MENS): `Render ALL attire as MENSWEAR by translating each garment into the MASCULINE version of the SAME garment type; any skirt becomes matching trousers. Keep each item's signature colors, materials, trims and ornaments.`

### WEAPON — 기하 제약 (컴포즈가 프롬프트에 명시하도록 지시)
- GRIPPED(손가락이 그립을 감쌈) · 몸 옆에 낮게 · 칼끝 아래 · **전체 길이 < 신장의 절반** · 몸 앞에 겹침(뒤에 떠 있기 금지) · 캐릭터가 프레임의 주인공
- 무기는 참조 텍스처를 붙여넣지 않고 **캐릭터와 같은 렌더링·픽셀밀도로 REDRAW**
- 무기에 달린 천(배너/리본/술)은 색·문양·길이는 유지하되 **새 그립 각도에 맞춰 중력 방향으로 재드레이프** (참조의 포즈는 전시용일 뿐)
- 쌍무기: 참조의 교차 배치는 DISPLAY ONLY — **한 손에 하나씩**, 둘 다 아래로, **동일 길이의 쌍둥이** (이 규칙이 포즈 지시보다 우선)

### FACE IDENTITY — 랜덤성 축
눈 색 8종(amber/emerald-green/sapphire-blue/violet/crimson/teal/golden/steel-gray) × 눈 모양 5종(gently upturned/slightly droopy gentle/sharp slanted/calm half-lidded/big round expressive)을 캐릭터별 랜덤 배정하고, `FACE IDENTITY: 눈 색·모양을 충실히 따르고 눈 모양이 얼굴 인상 전체를 바꾸게 하라`고 지시 — 같은 머리스타일에서도 서로 다른 인물로 읽히게 한다.

### COMPOSITION / LENGTH
- 머리 위·발 아래 여백 명시(발끝 절단 방지), 정면, 투명 배경, 솔로.
- 목표 1700–1900자, **OPENER verbatim으로 시작**, 1950자 안에서 완결 문장으로 종료, 긍정 서술만.

## 4. reference_images usage_description

```
단일 무기: the exact weapon the character wields — faithful silhouette, colors and ornaments, REDRAWN in the character's own rendering style and pixel density (one unified art style); any attached banner/ribbon keeps its colors and emblem but re-drapes naturally under gravity for the new grip angle; GRIPPED in one hand, held LOW at the side, blade pointing DOWN, spanning less than half the character's height, overlapping in front of the body; the character dominates the frame

쌍무기: the matched pair the character wields — faithful shapes and colors REDRAWN in the character's own rendering style and pixel density; the crossed layout in the reference is DISPLAY ONLY; the character grips one saber in each hand at his sides, blades pointing DOWN, identical length, each spanning less than half the character's height, overlapping in front of the body; the character dominates the frame
```

## 5. 프롬프트 설계 규칙 (검증 원칙)

1. **추상 스타일 라벨은 그라운딩되지 않는다** — "○○ 애니풍" 같은 라벨 대신 구체적 시각 속성(눈 크기 비율, 홍채 레이어, 선 굵기)으로 서술한다.
2. **눈 크기:얼굴 비율이 나이 인상을 결정한다** — 남성도 여성과 같은 eye-to-face 비율을 명시해야 노안이 되지 않는다.
3. **하한 문구는 낮은 쪽으로 앵커한다** — "at least 6 heads" 류 하한은 결과를 6등신으로 끌어내림. 목표+상한 범위(7~7.5, NEVER more than 7.5)로 서술.
4. **"round" 계열 형용사는 통통한 얼굴을 유발한다** — slender oval + delicate + tapered chin으로 서술.
5. **화풍·밀도 지시는 서두에** — 꼬리는 한도 초과 시 잘린다.
6. **참조 이미지는 포즈·구도까지 복사한다** — 전시 포즈(교차 쌍검, 늘어진 천)는 DISPLAY ONLY 오버라이드로 무효화한다.
7. **"JRPG" 단어는 90년대 레트로를 소환한다** — "MODERN 2020s"로 시대 앵커.

## 6. 도입 전 필요 작업

- **후보 선택 게이트**: run-to-run 편차가 커서 N장 생성 → 자동 검수(픽셀 격자 균일도·비율) 또는 유저 선택 구조가 필요하다.
- **8방향 회전**: v2는 south 1프레임만 산출한다. 회전이 필요하면 v2 결과를 `create-character-v3`의 `reference_image`(south 참조 → 8방향 회전 모드)로 넘기는 하이브리드 경로를 검토한다.

## 7. 비용 (실측)

| 항목 | 비용 |
|------|------|
| generate-image-v2 512px | $0.185 / 장 |
| generate-image-v2 256px | $0.095 / 장 |
| Claude 컴포즈 (Sonnet 5, vision 3장) | ~$0.016 / 회 |
