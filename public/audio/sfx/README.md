# 효과음(SFX) — 생성/배치 가이드

UI·강화·전투 등 짧은 효과음. **ElevenLabs Sound Effects(추천)** 또는 **jsfxr**(무료·8bit풍)로
만들어 아래 파일명으로 이 폴더에 넣으면 자동 적용된다(코드 변경 불필요).
파일이 없으면 코드가 **8-bit 합성음으로 폴백**하므로, 일부만 먼저 채워도 된다.

- 포맷: **`.webm`** (작은 용량·넓은 지원). 모노 OK. 길이 **50ms~1.5s**로 짧게.
  - mp3/wav만 받으면 변환: `ffmpeg -i click.wav -c:a libopus -b:a 96k -ac 1 click.webm`
  - (확장자를 `.m4a`로 바꾸려면 `lib/audio/sfx.ts`의 `EXT`만 교체)
- 재생: `lib/audio/sfx.ts`(Web Audio 버퍼 풀, 저지연) — 파일명 = 아래 `name`. 토글: 설정 "효과음"
  (`ig:sound`, 기본 켜짐). 첫 사용자 제스처 후 재생(자동재생 정책).
- 볼륨: 코드가 처리(`SFX_VOLUME` + 효과별 게인맵). 생성물이 튀면 그 효과 게인만 낮춘다.
- 호출: `import { sounds } from '@/lib/game/sound'` → `sounds.click()`, `sounds.enhanceSuccess()` …
  (파일 있으면 샘플, 없으면 합성음 자동 폴백)

## 도구

| 도구 | 용도 | 비고 |
|---|---|---|
| **ElevenLabs Sound Effects** (추천) | 텍스트→효과음. 강화·마법·타격·연출음 | 유료 플랜에 **상업 라이선스**(5년 운영 필수). 프롬프트는 영어, 짧게 |
| **jsfxr / ChipTone** (무료) | 8bit풍 클릭·코인·점프 | 즉석·무료·내 소유. 픽셀 UI에 잘 맞음 |
| **Freesound.org** | 실사 라이브러리 | CC 라이선스 **곡마다 상업가능 여부 확인** |
| ~~Suno~~ | ❌ 음악용 | 짧은 SFX 부적합 |

> 팁: 강화 성공/마법/타격 같은 **연출·임팩트음은 ElevenLabs**, 단순 클릭·코인 같은 **UI음은 jsfxr** 혼용이 가성비 최고.

## ⭐ 이번 우선 생성 목록 (강화·보급·레이드·대난투)

지금은 이 **12개만** 만들면 된다(나머지 UI·보상음은 보류). 코드 트리거는 이미 연결돼 있어,
아래 파일명대로 `public/audio/sfx/`에 넣으면 즉시 적용된다. 프롬프트는 영어 그대로 복붙.

```
# 강화 (5)
enhance-start    stylized mobile game forge hammer hit, punchy metallic clank with a bright tone, satisfying, short, dry
enhance-success  bright cheerful mobile game success chime, sparkly ascending bells, juicy and satisfying, short
enhance-jackpot  epic mobile game jackpot fanfare, sparkling rising chimes and a bright triumphant bell burst, super satisfying, rewarding
enhance-keep     neutral muted mobile game blip, soft dull pop, short, dry
enhance-down     cute mobile game fail sound, soft descending sad tone, short, dry

# 보급 (2)
gacha-open       satisfying stylized mobile game chest unlock, magical sparkle pop with a soft whoosh, juicy, short
gacha-reveal     exciting mobile game item reveal, glittering magical sparkle rising, bright and rewarding, short

# 레이드 (2)
raid-hit         punchy stylized mobile game hit impact, short bright thud, satisfying, dry
raid-crit        powerful stylized game critical hit, sharp impact with a bright metallic sparkle ring, juicy, short

# 대난투 (3)
melee-hit        punchy stylized mobile game melee hit, short bright thud, satisfying, dry
melee-ko         stylized mobile game knockout blow, heavy punchy impact with a short whoosh, satisfying, dry
melee-victory    cheerful mobile game champion victory fanfare, short bright triumphant jingle
```

> 추천 우선순위: **enhance-jackpot → enhance-success → gacha-open/reveal → melee-ko/victory** 순으로 만들면
> 체감이 가장 크다(핵심 도파민 순간). 타격음(raid-hit·melee-hit)은 jsfxr도 잘 나온다.

## 파일명 ↔ 트리거 ↔ ElevenLabs 프롬프트

영어 프롬프트 + **재질·길이** 묘사가 핵심. 2~3개 뽑아 가장 또렷·짧은 걸 고른다.

### UI
| 파일 | 트리거 | 프롬프트 |
|---|---|---|
| `click.webm` | 버튼·메뉴 탭 | `clean stylized mobile game UI button tap, short bright synthetic blip, dry, no reverb` |
| `toggle.webm` | 토글·탭 전환 | `casual mobile game UI toggle, soft synthetic pop, very short, dry` |
| `error.webm` | 비활성·실패 입력 | `cute mobile game error blip, soft descending two-tone, dry, short` |

### 강화 (결과별 차등 — 핵심)
| 파일 | 트리거 | 프롬프트 |
|---|---|---|
| `enhance-start.webm` | 강화 시작 | `stylized mobile game forge hammer hit, punchy metallic clank with a bright tone, satisfying, short, dry` |
| `enhance-success.webm` | 성공(일반) | `bright cheerful mobile game success chime, sparkly ascending bells, juicy and satisfying, short` |
| `enhance-jackpot.webm` | 대박(+99급) | `epic mobile game jackpot fanfare, sparkling rising chimes and a bright triumphant bell burst, super satisfying, rewarding` |
| `enhance-keep.webm` | 유지(변화 없음) | `neutral muted mobile game blip, soft dull pop, short, dry` |
| `enhance-down.webm` | 하락(실패) | `cute mobile game fail sound, soft descending sad tone, short, dry` |

### 보급/가챠
| 파일 | 트리거 | 프롬프트 |
|---|---|---|
| `gacha-open.webm` | 보급 상자 열기 | `satisfying stylized mobile game chest unlock, magical sparkle pop with a soft whoosh, juicy, short` |
| `gacha-reveal.webm` | 아이템 등급 공개 | `exciting mobile game item reveal, glittering magical sparkle rising, bright and rewarding, short` |

### 전투 — 레이드
| 파일 | 트리거 | 프롬프트 |
|---|---|---|
| `raid-hit.webm` | 일반 타격 | `punchy stylized mobile game hit impact, short bright thud, satisfying, dry` |
| `raid-crit.webm` | 치명타 | `powerful stylized game critical hit, sharp impact with a bright metallic sparkle ring, juicy, short` |
| `raid-block.webm` | 방어(미연결·선택) | `stylized mobile game shield block, bright metallic clink, short, dry` |
| `raid-victory.webm` | 페이즈 돌파(미연결·선택) | `cheerful mobile game victory jingle, short bright triumphant fanfare` |

### 전투 — 대난투
| 파일 | 트리거 | 프롬프트 |
|---|---|---|
| `melee-hit.webm` | 라운드 타격(생존) | `punchy stylized mobile game melee hit, short bright thud, satisfying, dry` |
| `melee-ko.webm` | 처치·탈락(KO) | `stylized mobile game knockout blow, heavy punchy impact with a short whoosh, satisfying, dry` |
| `melee-victory.webm` | 우승(챔피언) | `cheerful mobile game champion victory fanfare, short bright triumphant jingle` |

### 보상/알림
| 파일 | 트리거 | 프롬프트 |
|---|---|---|
| `coin.webm` | 코인·골드 획득 | `satisfying mobile game coin pickup, bright cheerful synthetic jingle, short` |
| `gem.webm` | 보석 획득 | `mobile game gem collect, sparkly bright crystal chime, juicy, short` |
| `levelup.webm` | 레벨업 | `cheerful mobile game level-up jingle, ascending bright bells, rewarding, short` |
| `reward.webm` | 출석·임무·보상 수령 | `pleasant mobile game reward collect chime, bright ascending sparkle, satisfying, short` |

## 프롬프트 원칙 (ElevenLabs) — "모바일 게임답게" 핵심

ElevenLabs는 기본이 **사실적 폴리(real foley)**라, 그대로 뽑으면 진짜 쇠·진짜 불 소리가 나서
모바일 게임엔 안 어울린다. **양식화(stylized) 키워드로 사실성에서 떼어내는 게 핵심.**

- ✅ **넣을 단어**: `mobile game, stylized, synthetic, bright, juicy, satisfying, cute, dry, no reverb, short`.
  특히 **`stylized` + `mobile game`** 두 단어가 톤을 가장 크게 바꾼다.
- ❌ **뺄 단어**: `realistic, cinematic, heavy, deep, real metal/wood` — 사실적 폴리로 끌려간다.
- **톤 방향**: 성공/보상=`bright, ascending, sparkly, juicy`. 실패=`cute, soft, descending`(우울·무겁게 X).
- **짧게·드라이**: UI음 50~200ms, 연출음 최대 1~1.5s. UI엔 `dry, no reverb`로 공간감 제거(잔향 있으면 안 맞음).
- 한 효과음에 **여러 소리 욱여넣지 말 것**(클릭은 클릭 하나). 길어지고 지저분해짐.

### ElevenLabs 설정
- **Prompt influence 높게**(프롬프트 충실 → 양식화 키워드가 잘 먹힘).
- **Duration 수동 지정**(Auto는 길게 나옴): UI 0.3s, 연출 0.6~1.2s. 생성 후 앞뒤 무음 트림.
- 2~3개 생성 → 가장 또렷·짧은 것 채택. 음량은 코드 게인맵이 맞춤.

### 하이브리드 권장 (중요)
클릭·코인·레벨업·gem 같은 **UI/보상 단음은 jsfxr(또는 ChipTone)가 오히려 더 "게임답게"** 나온다
(합성 블립·코인 사운드가 본업). **임팩트·마법·대박·forge 계열만 ElevenLabs**로. 둘을 섞어 쓰면 결과가 가장 좋다.

## 합성음 폴백 / 프리로드

- 파일이 없는 효과음은 자동으로 8-bit 합성음(`lib/game/sound.ts`의 `synth`)으로 폴백 — 무음 아님.
- 파일을 채운 뒤 첫 재생 지연을 없애려면 `BgmController`에서 `preloadSfx([...])`로 핵심 효과음을
  미리 디코딩(파일 없을 때 호출하면 트랙당 404 1회 발생하므로 **파일 배치 후** 켤 것).

> 효과음 추가/이름 변경 시 `lib/audio/sfx.ts`(`SfxName`)·`lib/game/sound.ts`(`sounds`) 동기화.
