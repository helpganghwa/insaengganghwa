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

## 파일명 ↔ 트리거 ↔ ElevenLabs 프롬프트

영어 프롬프트 + **재질·길이** 묘사가 핵심. 2~3개 뽑아 가장 또렷·짧은 걸 고른다.

### UI
| 파일 | 트리거 | 프롬프트 |
|---|---|---|
| `click.webm` | 버튼·메뉴 탭 | `soft crisp UI button click, short, clean, subtle` |
| `toggle.webm` | 토글·탭 전환 | `light digital toggle blip, very short` |
| `error.webm` | 비활성·실패 입력 | `soft low error buzz, short, muted` |

### 강화 (결과별 차등 — 핵심)
| 파일 | 트리거 | 프롬프트 |
|---|---|---|
| `enhance-start.webm` | 강화 시작 | `single metal hammer striking a hot anvil, forge clang, short` |
| `enhance-success.webm` | 성공(일반) | `bright magical success chime, gentle ascending sparkle, short` |
| `enhance-jackpot.webm` | 대박(+99급) | `triumphant magical level-up flourish, rising shimmer and a soft bell burst, rewarding` |
| `enhance-keep.webm` | 유지(변화 없음) | `neutral soft thud, no change, muted, short` |
| `enhance-down.webm` | 하락(실패) | `disappointing descending tone, low magic fizzle, short` |

### 보급/가챠
| 파일 | 트리거 | 프롬프트 |
|---|---|---|
| `gacha-open.webm` | 보급 상자 열기 | `wooden treasure chest creaking open with a soft sparkle` |
| `gacha-reveal.webm` | 아이템 등급 공개 | `rare item reveal, glittering magical shimmer rising, short` |

### 전투 (레이드·대난투)
| 파일 | 트리거 | 프롬프트 |
|---|---|---|
| `raid-hit.webm` | 일반 타격 | `solid sword hit impact, short thud` |
| `raid-crit.webm` | 치명타 | `sharp powerful critical strike, metallic ring, short` |
| `raid-block.webm` | 방어 | `metal shield block clang, short` |
| `raid-victory.webm` | 페이즈 돌파·승리 | `short heroic victory sting, bright, triumphant` |

### 보상/알림
| 파일 | 트리거 | 프롬프트 |
|---|---|---|
| `coin.webm` | 코인·골드 획득 | `light coin pickup jingle, short` |
| `gem.webm` | 보석 획득 | `crystal gem chime, bright, short` |
| `levelup.webm` | 레벨업 | `cheerful level-up chime, ascending, short` |
| `reward.webm` | 출석·임무·보상 수령 | `pleasant reward collect chime, ascending, short` |

## 프롬프트 원칙 (ElevenLabs)

- **짧게**: UI음 50~200ms, 연출음 최대 1~1.5s. "short" 명시.
- **재질·동작 묘사**: `metal hammer striking anvil`, `glittering shimmer`, `wooden creak` 등 구체적으로.
- **방향성**: 성공=`ascending/rising/bright`, 실패=`descending/low/fizzle`.
- 한 효과음에 **여러 소리 욱여넣지 말 것**(클릭은 클릭 하나). 길어지고 지저분해짐.
- 2~3개 생성 → 가장 또렷하고 짧은 것 채택. 음량은 코드 게인맵이 맞춤.

## 합성음 폴백 / 프리로드

- 파일이 없는 효과음은 자동으로 8-bit 합성음(`lib/game/sound.ts`의 `synth`)으로 폴백 — 무음 아님.
- 파일을 채운 뒤 첫 재생 지연을 없애려면 `BgmController`에서 `preloadSfx([...])`로 핵심 효과음을
  미리 디코딩(파일 없을 때 호출하면 트랙당 404 1회 발생하므로 **파일 배치 후** 켤 것).

> 효과음 추가/이름 변경 시 `lib/audio/sfx.ts`(`SfxName`)·`lib/game/sound.ts`(`sounds`) 동기화.
