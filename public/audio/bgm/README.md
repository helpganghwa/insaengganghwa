# BGM 트랙 — 생성/배치 가이드

화면별 배경음악. 모던 시네마틱. **Suno에서 생성(Instrumental ON)** 후 아래 파일명으로
이 폴더에 넣으면 자동 적용된다(코드 변경 불필요). 파일이 없으면 그 화면은 조용히 무음 처리.

- 포맷: **`.m4a` (AAC)** — iOS/안드/데스크톱 호환. 스테레오 128~160kbps.
- **길이: ~1.5~2분 목표**. 처음부터 한 곡으로 길게 뽑는다(Extend는 이음새에서 이질감 → 비권장).
  방법: **Custom 모드 + Instrumental ON** → Style 칸에 프롬프트, **Lyrics 칸에 구조 태그**를 넣어
  다섹션 곡으로 유도(가사 없이 구조만), **최신 모델(v4.5+)** 선택. 섹션이 많을수록 길어진다.
  ```
  [Intro]
  [Theme A]
  [Theme B]
  [Theme A]
  [Bridge]
  [Theme A]
  [Outro]
  ```
  코드가 `loop=true`라 짧아도 반복은 되지만, 루프 주기가 짧으면 금방 질린다(끝/시작 음량이 잔잔한
  구간이면 루프 이음새가 매끄럽다).
- 볼륨·시작: **코드가 처리** — `lib/audio/bgm.ts`의 곡별 게인맵으로 음량을 균형 맞추고, 화면 전환 시
  1.6초 페이드인으로 부드럽게 시작한다. → 그래서 **프롬프트엔 "soft/quiet/not too loud" 같은
  완화어를 넣지 않는다**(밋밋해짐). 생성물이 유난히 크면 그 트랙의 게인 숫자만 낮춘다.
- 토글: 설정 > "배경음악"(기본 꺼짐). 첫 사용자 탭 이후 재생(자동재생 정책).

## 파일명 ↔ 화면 ↔ Suno 프롬프트

| 파일 | 화면 | Suno 스타일 프롬프트 |
|---|---|---|
| `hub.m4a` | 홈·내정보·인벤·우편·출석·패스·친구(기본) | **[게임테마]** `gentle peaceful fantasy game main theme, a calm warm hummable melody on music box, soft piano and mellow strings, a tender heart-fluttering hopefulness, the quiet cozy patience of a blacksmith's home, soft pizzicato and harp glimmers, soothing and intimate, slow and serene, ~80bpm, instrumental, loopable` <br>**[일반]** `orchestral video game main theme, memorable hummable melody on strings and woodwinds, gentle pizzicato and light percussion groove, warm adventurous and cozy, harp and celesta flourishes, hopeful JRPG town vibe, catchy motif, ~100bpm, instrumental, loopable` <br>**[환경음]** `cozy fantasy town ambience at a blacksmith's home, gentle wind and faint wind chimes, soft crackle of a hearth fire, distant village murmur and birdsong, warm sparse ambient drone underneath, no melody, atmospheric soundscape, instrumental, loopable` |
| `enhance.m4a` | 강화소 | **[게임테마]** `cozy warm fantasy forge theme, a gentle heart-fluttering melody on celesta, soft piano and pizzicato strings, the sweet quiet anticipation of an enhancement, a soft anvil tap and light twinkling ticks, hopeful and tender, calm and shimmering, ~88bpm, instrumental, loopable` <br>**[일반]** `orchestral game theme, a catchy suspenseful melody on pizzicato strings and celesta, light ticking percussion groove, heart-pounding playful anticipation building to a bright payoff, warm and exciting JRPG forge, memorable motif, ~104bpm, instrumental, loopable` <br>**[환경음]** `dark industrial forge ambience, rhythmic anvil hammer clangs and metal striking, deep bellows breathing, crackling forge fire and ember hiss, low ominous drone underneath, no melody, atmospheric soundscape, instrumental, loopable` |
| `gacha.m4a` | 보급소 | **[게임테마]** `gentle magical fantasy theme for opening supply chests, a soft twinkling melody on celesta, glockenspiel and harp, a calm warm sense of wonder and sweet anticipation, light airy and cozy, soothing and shimmering, ~84bpm, instrumental, loopable` <br>**[일반]** `sparkling magical game theme, a catchy uplifting melody on celesta, glockenspiel and harp, bouncy pizzicato groove, wondrous gift-opening excitement, charming and bright JRPG, memorable motif, ~100bpm, instrumental, loopable` <br>**[환경음]** `magical supply depot ambience, wooden crates creaking open, shimmering arcane chimes and soft sparkle twinkles, faint rustling of treasure and clinking coins, gentle warm ambient drone, no melody, atmospheric soundscape, instrumental, loopable` |
| `raid.m4a` | 레이드 | **[게임테마]** `calm gentle fantasy quest theme, a soft hopeful melody on warm strings and woodwinds, a light steady heartbeat-like pulse, a quiet tender resolve before facing a great beast (not grand or epic), warm and serene, ~92bpm, instrumental, loopable` <br>**[일반]** `adventurous orchestral battle theme, a heroic memorable melody on strings and warm brass, driving but light taiko groove, energetic and brave boss quest, JRPG, catchy motif, ~112bpm, instrumental, loopable` <br>**[환경음]** `deep monster lair ambience, slow heavy dragon breathing and distant low growls, dripping water echoing in a vast cavern, smoldering embers and faint wind, ominous low drone, no melody, atmospheric soundscape, instrumental, loopable` |
| `melee.m4a` | 대난투 | **[게임테마]** `light playful fantasy theme, a gentle catchy melody on plucked strings and soft mellow brass, a soft bouncy lilt, a sweet flutter of friendly competition (not intense or harsh), warm and cozy, ~96bpm, instrumental, loopable` <br>**[일반]** `spirited competitive arena theme, a lively catchy melody on brass and strings, snappy rhythmic groove, energetic and fun adrenaline (not harsh), JRPG, memorable riff, ~116bpm, instrumental, loopable` <br>**[환경음]** `grand fantasy arena ambience, distant roaring crowd murmur, echoing clashes of steel, banners snapping in the wind, tense expectant air, low rumbling drone, no melody, atmospheric soundscape, instrumental, loopable` |
| `guild.m4a` | 길드 홈 | **[게임테마]** `warm peaceful guild theme, a gentle melody on soft horns, piano and mellow strings, a calm tender sense of belonging among friends, cozy and heartwarming, slow and serene, ~80bpm, instrumental, loopable` <br>**[일반]** `noble warm orchestral theme, a proud memorable melody on horns and strings with soft choir, gentle stately groove, fellowship and pride, JRPG guild hall, catchy motif, ~88bpm, instrumental, loopable` <br>**[환경음]** `stone guild hall ambience, crackling torches and a warm hearth, heavy banners flapping, faint distant footsteps and low murmur echoing on stone, calm noble ambient drone, no melody, atmospheric soundscape, instrumental, loopable` |
| `conquest.m4a` | 정복(deploy) | **[게임테마]** `calm contemplative fantasy theme, a soft thoughtful melody on piano and warm low strings, a gentle steady pulse, a quiet focused calm while planning the map (not a war march), warm and serene, ~84bpm, instrumental, loopable` <br>**[일반]** `strategic war-room theme, a determined memorable melody on low strings and brass, steady marching snare groove, building tension and momentum, JRPG conquest, catchy motif, ~96bpm, instrumental, loopable` <br>**[환경음]** `war camp ambience at the front, distant war drums and marching boots, wind snapping over banners, parchment maps rustling, a crackling campfire, tense low drone, no melody, atmospheric soundscape, instrumental, loopable` |
| `worldmap.m4a` | 지도(map) | **[게임테마]** `gentle peaceful exploration theme, a soft wandering melody on woodwinds and warm strings, a calm rolling lilt, the quiet wonder of a wide tranquil continent, soothing and hopeful, slow and serene, ~82bpm, instrumental, loopable` <br>**[일반]** `adventurous exploration theme, a soaring memorable melody on woodwinds and strings, gentle rolling groove, vast wonder and journey, hopeful JRPG overworld, catchy motif, ~92bpm, instrumental, loopable` <br>**[환경음]** `vast overworld ambience, wide sweeping wind across open land, faint distant birdsong and flowing water, a sense of great open space, gentle airy ambient drone, no melody, atmospheric soundscape, instrumental, loopable` |
| `shop.m4a` | 상점 | **[게임테마]** `cozy gentle merchant theme, a soft playful melody on marimba, soft bells and plucked strings, a calm warm lilt, an inviting peaceful little shop, whimsical and soothing, ~88bpm, instrumental, loopable` <br>**[일반]** `charming merchant theme, a catchy playful melody on marimba, plucked strings and bells, bouncy swing groove, cozy inviting bazaar, whimsical JRPG, memorable motif, ~104bpm, instrumental, loopable` <br>**[환경음]** `cozy fantasy merchant shop ambience, coins clinking, soft market murmur, gentle door bell and wind chimes, rustling fabric and crates, warm inviting ambient drone, no melody, atmospheric soundscape, instrumental, loopable` |
| `leaderboard.m4a` | 랭킹 | **[게임테마]** `warm gentle hall-of-fame theme, a soft uplifting melody on piano and mellow strings with light bells, a calm tender sense of quiet pride (not triumphant or grand), serene and heartwarming, ~84bpm, instrumental, loopable` <br>**[일반]** `triumphant prestige theme, a bold memorable melody on brass over warm strings, steady uplifting groove, glory and competition (not bombastic), JRPG, catchy motif, ~100bpm, instrumental, loopable` <br>**[환경음]** `grand hall of fame ambience, vast echoing reverberant stone hall, soft distant airy choir-like tones, banners stirring, solemn prestigious atmosphere, low majestic drone, no melody, atmospheric soundscape, instrumental, loopable` |

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
- **[게임테마]는 잔잔·평화·두근두근 지향** — 웅장/모험/영웅/행진/승전 톤 배제. `gentle·calm·peaceful·warm·
  cozy·serene·soothing·heart-fluttering` 위주, ~80~96bpm 저속. 전투 화면(레이드·대난투·정복)도 격렬하게 X,
  '잔잔한 두근거림' 정도로. (반대로 [일반]은 더 활기찬 JRPG 톤 — 취향대로 선택)
- 2~3개 생성해 **멜로디가 또렷한 것**을 고르고, 마음에 들면 Extend로 길이를 늘린다.
- **원치 않는 악기 빼기**: Suno가 자동으로 넣는 악기(예: 셰이커=모래알 흔들리는 "차르륵" 타악기, 마라카스 등)는
  **`Exclude Styles` 칸에 `shaker, maracas, percussion` 입력**하면 가장 확실히 배제된다(프롬프트 부정어
  `no shaker`는 가끔 무시됨). 잔잔 트랙엔 셰이커류가 거슬릴 수 있으니 필요 시 제외.

## 세 가지 버전 — 골라서 생성

각 트랙엔 3종 프롬프트가 있다. **하나만 골라** 같은 파일명(`hub.m4a` 등)으로 넣으면 된다.

- **[게임테마]** — 게임 서사 반영 멜로디 음악(대장간·토벌·점령 등). 기본 추천.
- **[일반]** — 무난한 JRPG 멜로디 음악.
- **[환경음]** — 멜로디 없는 현장 분위기(제련소 망치·용의 숨결·시장 소음 등). "거기 있는 느낌".

### 환경음 생성 팁 (Suno)
- Suno는 음악 우선이라 멜로디가 새기 쉽다 → `no melody, ambience, soundscape, drone`을 꼭 넣고,
  **2~3개 생성해 가장 멜로디가 적고 분위기만 흐르는 것**을 고른다.
- Lyrics 칸은 비우거나 `[Ambient]` 한 줄만(섹션 전개 불필요 — 환경음은 변화 없이 길게 흐르는 게 자연스럽다).
- 루프 이음새: 환경음은 시작·끝 음량차가 작아 루프가 잘 맞는 편. 그래도 어색하면 게인맵으로 조정.
- 게임테마/일반 음악과 **섞어 써도 됨** — 예: hub·shop은 음악, enhance·raid는 환경음 식으로 화면 성격 따라 혼용.

## 변환 (mp3/wav → m4a)

Suno 다운로드가 mp3면 AAC로 변환(선택):

```sh
ffmpeg -i hub.mp3 -c:a aac -b:a 160k -ac 2 hub.m4a
```

> 트랙 추가/이름 변경 시 `lib/audio/bgm.ts`(BgmTrack)·`lib/audio/bgm-map.ts`(라우트 매핑) 동기화.
