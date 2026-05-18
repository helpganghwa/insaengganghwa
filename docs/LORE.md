# 인생강화 — 아이템 로어 (LORE.md)

> **상태: 프레임워크 + 샘플 (승인 대기).** 150종 일괄 작성 전, 세계관·톤·포맷을 본 문서로 합의한다.
> 승인 후 슬롯별 배치(예: 무기 1차 10~15종)로 작성→검토를 반복한다.
> 로어는 게임의 핵심 정체성 — `GDD §3.1`(차이는 외관·도감·**로어**뿐) / `GDD §6`(64×64 픽셀아트).

---

## 1. 세계관 프레임 — "다섯 재앙이 깨어난 땅" (느슨한 연결)

기존 세계관(레이드 보스 5종, `lib/game/raid/bosses.ts`)을 **앵커**로 둔다. 단, **모든 아이템을 세계관에 묶지 않는다** — 일부(권역 색채를 입힌 것들)는 보스의 땅과 엮어 통일감을 주고, 나머지는 **권역과 무관한 자유 판타지** 아이템으로 다양성을 확보한다. 대략 **세계관 연결 ~40% / 자유 ~60%** 비중을 기본으로 한다(강제 아님 — 톤만 일관되면 된다).

> 즉 §1 표의 다섯 권역은 *선택적 양념*이지 의무 틀이 아니다. `region: 자유`(권역 무관)도 1급 분류다.

| 권역 | 깨어난 재앙 | 로어 색채 |
|------|------------|-----------|
| **늪지대** | 슬라임킹 (천 년을 삼킨 점액의 군주) | 부식·침식, 마른 우물, 끈질김 |
| **오크 부락** | 오크족장 (전리품 두개골의 거구) | 부락·천막, 전열, 포효, 노획 |
| **고대 룬 산맥** | 돌골렘 (폭주한 수호 룬의 산) | 푸른 마력 균열, 다시 뭉치는 바위 |
| **서쪽 화산** | 드래곤 (잿빛 날개의 고룡) | 끓는 강, 비늘·불, 시험 |
| **타락천사** | 타락천사 (깨진 후광의 옛 전사) | 신성과 저주, 검은 깃털, 구원 |

### 톤·테마 다양성 (핵심 — 가장 중요)
아이템 하나하나가 **다른 목소리**를 가진다. 한 가지 정서로 수렴시키지 않는다.

- **금지: 모티프 남발.** "버려진 시간이 벼린 / 견딘 시간이 곧 …" 류의 시간·인내 마무리를 *기본값으로 쓰지 않는다.* 시간/idle 테마는 게임 정체성이라 **가끔(전체의 1/6 이하)** 슬쩍 스칠 뿐, 의무가 아니다.
- **톤 팔레트 — 섞어 쓴다:** 장엄/서사, 담백/무심, **위트/유머**, 비애/쓸쓸, 기괴/섬뜩, 일상/소소, 영웅담, 수수께끼. 한 배치 안에서 이 톤들이 고르게 분포해야 한다.
- **개성:** 아이템마다 고유한 출처·사연·디테일(누가·왜·어디서·무엇을 남겼나). 템플릿 재사용 금지 — 두 아이템의 문장 구조가 닮으면 다시 쓴다.
- 보스 스토리와 *문체의 격*은 통일(번역투·게임 카피체 금지)하되, *정서*는 자유롭다.

### 설계 제약 (어기지 말 것)
- **등급·희소성·성능 언급 금지.** "전설의/최강의/+공격력" 불가 — 장비는 전부 성능 동일, 차이는 외관·도감·로어뿐(`GDD §3.1`). 로어는 *유래와 정취*만.
- 보스를 직접 "처치 보상"으로 묶지 않는다. 권역의 *분위기*만 빌린다(스포일러·밸런스 결합 방지).
- 한국어. 과장된 카피체 금지, 문장은 또렷하게.

---

## 2. 아이템 포맷 (1종당)

```
### <한국어 이름>
- slot: weapon | armor | accessory
- key: <영문 소문자 스네이크, 스프라이트/시드 식별자>  ex) marsh_rusted_blade
- region: 늪지대 | 오크 부락 | 고대 룬 산맥 | 서쪽 화산 | 타락천사 | 자유(권역 무관)
- tone: 장엄 | 담백 | 위트 | 비애 | 기괴 | 일상 | 영웅담 | 수수께끼  (배치 내 고르게 분포)
- lore: <약 120~260자, 2~4문장. 고유한 출처·사연·디테일. tone 에 맞춘 목소리. 시간/인내 마무리는 가뭄에 콩.>
- art: <Pixellab 64×64 생성용 영문 키워드 6~10개 — 형태·재질·색·분위기. 등급/광원 글로우 제외(글로우는 강화 단계에서 코드가 입힘, GDD §6).>
```

- `key`는 `catalogItems` 시드 + `public/sprites/<slot>/<key>.png` 파일명으로 직결(후속 `spriteKey` 컬럼).
- 슬롯별 50종 목표(무기/방어구/장신구 = 총 150), 이후 가변 추가(`GDD §10`).
- 권역 배분(슬롯 50): 세계관 연결 ~20 + 자유 ~30. 톤 배분(슬롯 50): 한 톤이 ~1/4 넘지 않게.

---

## 3. 샘플 5종 (승인 대상)

### 녹슨 늪칼
- slot: weapon
- key: marsh_rusted_blade
- region: 늪지대
- tone: 담백
- lore: 늪 마을 대장간에서 흔하게 찍어내던 한손검이다. 특별한 사연도, 이름난 주인도 없다. 다만 마른 우물을 치우다 한 자루가 올라왔고, 점액에 절어 날이 검붉게 변해 있었다. 닦아 보니 멀쩡히 들었다. 그뿐이다.
- art: plain one-handed sword, pitted reddish-rusted iron blade, swamp residue, leather-wrapped grip, simple crossguard, understated, pixel art

### 화산재 흑요석 단검
- slot: weapon
- key: ashfall_obsidian_dagger
- region: 서쪽 화산
- tone: 기괴
- lore: 끓는 강에서 건진 흑요석 단검. 칼날에 비친 얼굴이 잠깐, 제 것이 아닌 표정을 짓는다고들 했다. 고룡의 숨결을 너무 가까이서 쬔 유리는 무언가를 본 채로 굳어 버린 모양이다. 누구도 오래 들여다보지 않는다.
- art: short dagger, glassy black obsidian blade, distorted faint reflection, fractured edge, charred bone handle, eerie, pixel art

### 룬각 흉갑
- slot: armor
- key: runescar_breastplate
- region: 고대 룬 산맥
- tone: 장엄
- lore: 산이 스스로 일어서던 날, 무너진 비탈에서 떨어져 나온 한 조각을 두드려 편 흉갑이다. 표면을 가로지른 푸른 균열은 식지 않았고, 두드릴수록 금이 안으로 더 깊이 뭉친다. 산의 분노를 한 줌 떼어 가슴에 두른 셈이다.
- art: heavy breastplate, grey carved-stone plating, deep blue hairline rune cracks, riveted edges, monumental, ancient, pixel art

### 깃털 두른 망토
- slot: armor
- key: fallen_feather_mantle
- region: 타락천사
- tone: 비애
- lore: 추락한 자리에 검은 깃이 눈처럼 쌓여 있었다. 누군가 그것을 주워 어깨망토로 엮었다. 깃 사이로 아직 옅은 온기가 돌아, 두른 이들은 종종 등 뒤에서 누가 부르는 듯한 기분이 든다고 한다. 돌아보면 아무도 없다.
- art: shoulder mantle cloak, layered black feathers, faded gold-thread trim, pale grey sheen, draped, mournful, pixel art

### 부족 전리 목걸이
- slot: accessory
- key: warband_trophy_necklace
- region: 오크 부락
- tone: 위트
- lore: 오크 족장이 평생 모은 전리품—이빨, 깨진 칼끝, 누군가의 단추—을 한 줄에 꿴 목걸이다. 본인은 위대한 무용담이라 믿었겠으나, 솔직히 잡동사니 모음에 가깝다. 그래도 절그럭거리는 소리만큼은 제법 위협적이다.
- art: tribal necklace, mismatched bone teeth and broken blade tips and odd buttons, frayed cord, cluttered, rugged, pixel art

---

## 4. 단일 소스 & 진행

**구조 확정:** 150종은 `lib/game/equipment/catalog.ts`(`CATALOG_ITEMS`)가 단일 진실 원천 —
DB 시드 · 스프라이트 파이프라인 · UI 표시명 · 확률공시 종수를 모두 여기서 공급.
본 LORE.md는 세계관·톤·포맷 가이드(메타), 실제 150 엔트리는 `catalog.ts`.

진행:
1. ✅ 프레임/포맷/톤 확정 + `catalog.ts` 구조 + 무기 배치1(15종)
2. ⏳ 무기 잔여(~35) → 방어구 50 → 장신구 50 (배치별 작성)
3. 파이프라인 포팅: `scripts/_sprite-prompt.ts`(catalog→jobs, 등급 없음·LORE `art` 구동) +
   `scripts/sprite-pipeline.ts`(상태/다운로드) + `catalogItems.spriteKey` 컬럼·마이그레이션
4. Pixellab MCP(연결됨 ✓, 다음 세션부터 호출 가능) `Create M-XL image`(GDD §6) 64×64 일괄 → 큐레이션 → UI 연결
