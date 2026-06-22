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
| `enhance.m4a` | 강화소 | `easygoing orchestral game theme, light heart-pounding anticipation, gentle bouncy pizzicato and soft snappy percussion, a playful hopeful melody building toward a win, warm and fun not aggressive, soft gradual intro that eases in, moderate background dynamics not too loud, ~100bpm, instrumental, loopable` |
| `gacha.m4a` | 보급소 | `gentle magical game theme, soft sparkling celesta and glockenspiel melody, light harp arpeggios and pizzicato, wondrous and uplifting but calm, soft gradual intro, moderate background dynamics, cozy and not loud, ~96bpm, instrumental, loopable` |
| `raid.m4a` | 레이드 | `adventurous orchestral battle theme, steady heroic melody on strings and warm brass, light driving percussion not pounding, energetic yet controlled, eases in with a soft intro, moderate background dynamics not too loud, ~110bpm, instrumental, loopable` |
| `melee.m4a` | 대난투 | `spirited competitive theme, lively rhythmic groove, brass and strings melody with light percussion, energetic and fun but not harsh, smooth gradual intro, moderate background dynamics, ~115bpm, instrumental, loopable` |
| `guild.m4a` | 길드 홈 | `warm noble orchestral theme, gentle proud melody on horns and strings, soft choir pads, sense of fellowship, calm and stately, soft gradual intro, gentle background dynamics, ~84bpm, instrumental, loopable` |
| `conquest.m4a` | 정복(deploy) | `restrained strategic theme, steady low strings and soft marching snare, a determined but understated melody, quiet tension and momentum, eases in softly, moderate background dynamics not too loud, ~88bpm, instrumental, loopable` |
| `worldmap.m4a` | 지도(map) | `gentle exploration theme, soft soaring woodwind and string melody, calm rolling rhythm, vast hopeful wonder, soft gradual intro, light background dynamics, ~80bpm, instrumental, loopable` |
| `shop.m4a` | 상점 | `charming light shop theme, gentle catchy melody on plucked strings and marimba, soft bouncy rhythm, warm bells, cozy and inviting, soft gradual intro, moderate background dynamics, ~98bpm, instrumental, loopable` |
| `leaderboard.m4a` | 랭킹 | `dignified triumphant theme, warm brass melody over gentle strings, a sense of prestige, uplifting but not bombastic, soft gradual intro, moderate background dynamics, ~92bpm, instrumental, loopable` |

## 게임음악답게 — 프롬프트 원칙 (노잼 방지)

- `ambient·calm·soft·slow·gentle pad` 같은 단어 = **벽지(노잼)**의 원인 → 피한다.
- `memorable melody / motif / theme / catchy`로 **흥얼거릴 선율**을 명시한다.
- 가벼운 **리듬·그루브**(pizzicato, light percussion)와 **캐릭터 악기**(harp·celesta·woodwind·marimba)를 넣는다.
- 장르 태그 추가가 도움: `soundtrack, video game music, JRPG`.
- 2~3개 생성해 **멜로디가 또렷한 것**을 고르고, 테마가 살아있는 구간을 루프로 사용.

**그러나 과하지 않게 — 어디까지나 배경음악 (hub가 정답 기준):**
- `soft gradual intro that eases in`으로 **서서히 시작**(갑자기 훅 들어와 깜짝 놀라는 것 방지).
- `moderate background dynamics, not too loud`로 **음량 절제** — 게임플레이 밑에 깔리도록.
- bpm을 너무 올리지 말 것(전투곡도 ~110~115 상한). `aggressive·pounding·bombastic·harsh`는 피함.
- 코드(`lib/audio/bgm.ts`)에 **곡별 게인 맵**으로 음량 편차를 보정 — 생성물이 유난히 크면 그 트랙 게인을 낮춰 균형.

## 변환 (mp3/wav → m4a)

Suno 다운로드가 mp3면 AAC로 변환(선택):

```sh
ffmpeg -i hub.mp3 -c:a aac -b:a 160k -ac 2 hub.m4a
```

> 트랙 추가/이름 변경 시 `lib/audio/bgm.ts`(BgmTrack)·`lib/audio/bgm-map.ts`(라우트 매핑) 동기화.
