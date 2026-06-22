# BGM 트랙 — 생성/배치 가이드

화면별 배경음악. 모던 시네마틱. **Suno에서 생성(Instrumental ON)** 후 아래 파일명으로
이 폴더에 넣으면 자동 적용된다(코드 변경 불필요). 파일이 없으면 그 화면은 조용히 무음 처리.

- 포맷: **`.m4a` (AAC)** — iOS/안드/데스크톱 호환. 스테레오 128~160kbps.
- 길이: ~1.5~2분 생성 → `loop=true`로 반복(끊김 최소화하려면 끝/시작 음량이 잔잔한 구간 선택).
- 볼륨: 코드에서 0.35로 깔림. 트랙끼리 체감 음량을 비슷하게 맞추면 전환이 자연스러움.
- 토글: 설정 > "배경음악"(기본 꺼짐). 첫 사용자 탭 이후 재생(자동재생 정책).

## 파일명 ↔ 화면 ↔ Suno 프롬프트

| 파일 | 화면 | Suno 스타일 프롬프트 |
|---|---|---|
| `hub.m4a` | 홈·내정보·인벤·우편·출석·패스·친구(기본) | `orchestral video game main theme, memorable hummable melody on strings and woodwinds, gentle pizzicato and light percussion groove, warm adventurous and cozy, harp and celesta flourishes, hopeful JRPG town vibe, catchy motif, ~100bpm, instrumental, loopable` |
| `enhance.m4a` | 강화소 | `exciting orchestral game theme, heart-pounding upbeat tension, bright bouncy pizzicato strings and snappy percussion, a thrilling build-up toward a big win, playful suspense and hopeful anticipation, energetic and fun high-stakes gamble, sparkling celesta accents, major key, ~112bpm, instrumental, loopable` |
| `gacha.m4a` | 보급소 | `playful magical game theme, sparkling celesta and glockenspiel melody, harp arpeggios, bouncy pizzicato and light percussion, wondrous gift-opening excitement, catchy uplifting motif, ~108bpm, instrumental, loopable` |
| `raid.m4a` | 레이드 | `epic battle game theme, heroic brass melody over driving taiko and timpani, soaring string countermelody, intense and triumphant, boss battle energy, memorable combat motif, ~140bpm, instrumental, loopable` |
| `melee.m4a` | 대난투 | `aggressive hybrid combat theme, relentless percussive groove, distorted brass and electronic pulses, a punchy competitive riff, PvP arena intensity, driving and adrenaline-fueled, ~150bpm, instrumental, loopable` |
| `guild.m4a` | 길드 홈 | `noble orchestral anthem, proud memorable theme on horns and strings, choir swells, sense of fellowship and grandeur, warm yet stirring, fantasy guild hall, uplifting motif, ~92bpm, instrumental, loopable` |
| `conquest.m4a` | 정복(deploy) | `tense strategic war theme, militaristic marching snare and low brass, a determined driving motif, territorial conquest pressure, building momentum, cinematic war-room, ~100bpm, instrumental, loopable` |
| `worldmap.m4a` | 지도(map) | `adventurous exploration theme, soaring woodwind and string melody, gentle rolling rhythm, vast world map wonder and discovery, hopeful journeying motif, orchestral momentum, ~96bpm, instrumental, loopable` |
| `shop.m4a` | 상점 | `charming merchant shop theme, catchy playful melody on plucked strings and marimba, bouncy swing rhythm, bells and accordion flavor, inviting cozy bazaar, whimsical motif, ~112bpm, instrumental, loopable` |
| `leaderboard.m4a` | 랭킹 | `triumphant competitive theme, bold brass fanfare motif over driving strings and percussion, prestige and glory, rising heroic energy, ranking showdown, memorable victorious hook, ~104bpm, instrumental, loopable` |

## 게임음악답게 — 프롬프트 원칙 (노잼 방지)

- `ambient·calm·soft·slow·gentle pad` 같은 단어 = **벽지(노잼)**의 원인 → 피한다.
- `memorable melody / motif / theme / catchy`로 **흥얼거릴 선율**을 명시한다.
- 가벼운 **리듬·그루브**(pizzicato, light percussion)와 **캐릭터 악기**(harp·celesta·woodwind·marimba)를 넣는다.
- 장르 태그 추가가 도움: `soundtrack, video game music, JRPG`.
- 2~3개 생성해 **멜로디가 또렷한 것**을 고르고, 테마가 살아있는 구간을 루프로 사용.

## 변환 (mp3/wav → m4a)

Suno 다운로드가 mp3면 AAC로 변환(선택):

```sh
ffmpeg -i hub.mp3 -c:a aac -b:a 160k -ac 2 hub.m4a
```

> 트랙 추가/이름 변경 시 `lib/audio/bgm.ts`(BgmTrack)·`lib/audio/bgm-map.ts`(라우트 매핑) 동기화.
