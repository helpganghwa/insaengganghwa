# BGM 트랙 — 생성/배치 가이드

화면별 배경음악. 모던 시네마틱. **Suno에서 생성(Instrumental ON)** 후 아래 파일명으로
이 폴더에 넣으면 자동 적용된다(코드 변경 불필요). 파일이 없으면 그 화면은 조용히 무음 처리.

- 포맷: **`.m4a` (AAC)** — iOS/안드/데스크톱 호환. 스테레오 128~160kbps.
- **길이: ~1.5~2분 목표**. Suno 기본 생성이 짧으면(예: 50초대) → 마음에 든 트랙에서 `...` →
  **Extend(이어 생성)** 로 뒤를 이어 1.5~2분까지 늘린다(멜로디·분위기 유지). 또는 Custom 모드에서
  구조 태그(`[Intro] [Theme A] [Theme B] [Theme A] [Outro]`)로 더 길게. 코드가 `loop=true`라
  짧아도 반복은 되지만, 루프 주기가 짧으면 금방 질리니 길게 뽑는 게 좋다(끝/시작 음량이 잔잔한
  구간이면 루프 이음새가 매끄럽다).
- 볼륨·시작: **코드가 처리** — `lib/audio/bgm.ts`의 곡별 게인맵으로 음량을 균형 맞추고, 화면 전환 시
  1.6초 페이드인으로 부드럽게 시작한다. → 그래서 **프롬프트엔 "soft/quiet/not too loud" 같은
  완화어를 넣지 않는다**(밋밋해짐). 생성물이 유난히 크면 그 트랙의 게인 숫자만 낮춘다.
- 토글: 설정 > "배경음악"(기본 꺼짐). 첫 사용자 탭 이후 재생(자동재생 정책).

## 파일명 ↔ 화면 ↔ Suno 프롬프트

| 파일 | 화면 | Suno 스타일 프롬프트 |
|---|---|---|
| `hub.m4a` | 홈·내정보·인벤·우편·출석·패스·친구(기본) | `orchestral video game main theme, memorable hummable melody on strings and woodwinds, gentle pizzicato and light percussion groove, warm adventurous and cozy, harp and celesta flourishes, hopeful JRPG town vibe, catchy motif, ~100bpm, instrumental, loopable` |
| `enhance.m4a` | 강화소 | `orchestral game theme, a catchy suspenseful melody on pizzicato strings and celesta, light ticking percussion groove, heart-pounding playful anticipation building to a bright payoff, warm and exciting JRPG forge, memorable motif, ~104bpm, instrumental, loopable` |
| `gacha.m4a` | 보급소 | `sparkling magical game theme, a catchy uplifting melody on celesta, glockenspiel and harp, bouncy pizzicato groove, wondrous gift-opening excitement, charming and bright JRPG, memorable motif, ~100bpm, instrumental, loopable` |
| `raid.m4a` | 레이드 | `adventurous orchestral battle theme, a heroic memorable melody on strings and warm brass, driving but light taiko groove, energetic and brave boss quest, JRPG, catchy motif, ~112bpm, instrumental, loopable` |
| `melee.m4a` | 대난투 | `spirited competitive arena theme, a lively catchy melody on brass and strings, snappy rhythmic groove, energetic and fun adrenaline (not harsh), JRPG, memorable riff, ~116bpm, instrumental, loopable` |
| `guild.m4a` | 길드 홈 | `noble warm orchestral theme, a proud memorable melody on horns and strings with soft choir, gentle stately groove, fellowship and pride, JRPG guild hall, catchy motif, ~88bpm, instrumental, loopable` |
| `conquest.m4a` | 정복(deploy) | `strategic war-room theme, a determined memorable melody on low strings and brass, steady marching snare groove, building tension and momentum, JRPG conquest, catchy motif, ~96bpm, instrumental, loopable` |
| `worldmap.m4a` | 지도(map) | `adventurous exploration theme, a soaring memorable melody on woodwinds and strings, gentle rolling groove, vast wonder and journey, hopeful JRPG overworld, catchy motif, ~92bpm, instrumental, loopable` |
| `shop.m4a` | 상점 | `charming merchant theme, a catchy playful melody on marimba, plucked strings and bells, bouncy swing groove, cozy inviting bazaar, whimsical JRPG, memorable motif, ~104bpm, instrumental, loopable` |
| `leaderboard.m4a` | 랭킹 | `triumphant prestige theme, a bold memorable melody on brass over warm strings, steady uplifting groove, glory and competition (not bombastic), JRPG, catchy motif, ~100bpm, instrumental, loopable` |

## 프롬프트 원칙 — hub가 정답 기준

hub가 잘 나온 이유: **완화어 없이** 멜로디·따뜻함·가벼운 그루브·모티프만으로 자연스럽게 배경음악다웠다.
나머지도 같은 패턴으로 — 구조: `[장르 테마] + [악기 위의 기억나는 멜로디] + [가벼운 리듬·그루브] +
[분위기/JRPG vibe] + [캐릭터 악기] + [catchy motif] + [bpm]`.

- `memorable melody / motif / catchy`로 **흥얼거릴 선율**을 명시한다(가장 중요).
- 가벼운 **리듬·그루브**(pizzicato, light/snappy percussion)와 **캐릭터 악기**(harp·celesta·woodwind·marimba·brass)를 넣는다.
- 장르 태그가 도움: `JRPG, video game soundtrack`.
- **피할 단어**: `ambient·calm·slow·gentle pad` (벽지/노잼) **그리고** `soft·quiet·not too loud·
  moderate background dynamics` (밋밋해짐) — 음량·시작 부드러움은 **코드(게인맵+페이드인)가 담당**하므로
  프롬프트에 넣지 않는다. `aggressive·pounding·bombastic·harsh`도 피함(과격 방지는 단어 1개 "not harsh"면 충분).
- bpm은 분위기대로(휴식 ~85~100, 전투 ~110~116). 너무 빠르게 X.
- 2~3개 생성해 **멜로디가 또렷한 것**을 고르고, 마음에 들면 Extend로 길이를 늘린다.

## 변환 (mp3/wav → m4a)

Suno 다운로드가 mp3면 AAC로 변환(선택):

```sh
ffmpeg -i hub.mp3 -c:a aac -b:a 160k -ac 2 hub.m4a
```

> 트랙 추가/이름 변경 시 `lib/audio/bgm.ts`(BgmTrack)·`lib/audio/bgm-map.ts`(라우트 매핑) 동기화.
