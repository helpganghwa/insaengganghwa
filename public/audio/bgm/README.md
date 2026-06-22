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
| `hub.m4a` | 홈·내정보·인벤·우편·출석·패스·친구(기본) | `cinematic ambient, warm orchestral, soft strings and piano, gentle fantasy adventure, hopeful and calm, slow ~70bpm, seamless loop, instrumental` |
| `enhance.m4a` | 강화소 | `cinematic tension, dark fantasy forge, pulsing low strings, ticking percussion, anticipation and risk, building suspense, ~90bpm, loopable, instrumental` |
| `gacha.m4a` | 보급소 | `magical cinematic, shimmering bells harp celesta, wondrous uplifting, gift-opening anticipation, light orchestral, ~100bpm, loopable, instrumental` |
| `raid.m4a` | 레이드 | `epic battle orchestral, driving taiko timpani, brass stabs, intense heroic, ~140bpm, cinematic combat, loopable, instrumental` |
| `melee.m4a` | 대난투 | `aggressive epic combat, fast percussion and distorted brass, competitive PvP arena, relentless drive, ~150bpm, cinematic, loopable, instrumental` |
| `guild.m4a` | 길드 홈 | `noble orchestral, warm brass and strings, sense of belonging and pride, steady ~80bpm, cinematic fantasy guild hall, loopable, instrumental` |
| `conquest.m4a` | 정복(deploy) | `tense strategic orchestral, militaristic snare and low brass, territorial war tension, ~90bpm, cinematic, loopable, instrumental` |
| `worldmap.m4a` | 지도(map) | `expansive cinematic, airy strings and woodwinds, exploration and vast horizon, calm wonder, ~75bpm, loopable, instrumental` |
| `shop.m4a` | 상점 | `light playful orchestral, plucked strings and bells, charming commercial bazaar, inviting upbeat, ~105bpm, loopable, instrumental` |
| `leaderboard.m4a` | 랭킹 | `triumphant cinematic, regal brass fanfare motifs over steady strings, competition and glory, ~95bpm, loopable, instrumental` |

## 변환 (mp3/wav → m4a)

Suno 다운로드가 mp3면 AAC로 변환(선택):

```sh
ffmpeg -i hub.mp3 -c:a aac -b:a 160k -ac 2 hub.m4a
```

> 트랙 추가/이름 변경 시 `lib/audio/bgm.ts`(BgmTrack)·`lib/audio/bgm-map.ts`(라우트 매핑) 동기화.
