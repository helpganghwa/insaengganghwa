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

**관통 테마 — "떠나 있어도 강화는 진행된다"(`GDD §1`).** 이 땅의 장비는 *버려진 채로도 단련된다*. 늪에 잠겨, 잿더미에 묻혀, 룬에 깎이며 — 주인이 떠난 시간조차 무기를 벼린다. 모든 로어는 **시간·인내·기다림**의 잔향을 한 줄이라도 머금는다. (강화 = 시간, 초월 = 같은 것을 거듭 바침 → 로어와 메커니즘의 은유 일치.)

### 설계 제약 (어기지 말 것)
- **등급·희소성·성능 언급 금지.** "전설의/최강의/+공격력" 같은 표현 불가 — 장비는 전부 성능 동일, 차이는 외관·도감·로어뿐(`GDD §3.1`). 로어는 *유래와 정취*만 말한다.
- 보스를 직접 "처치 보상"으로 묶지 않는다. 권역의 *분위기*만 빌린다(스포일러·밸런스 결합 방지).
- 한국어. 보스 스토리와 **톤 통일**: 장엄·서사·간결. 과장된 게임 카피체 금지.

---

## 2. 아이템 포맷 (1종당)

```
### <한국어 이름>
- slot: weapon | armor | accessory
- key: <영문 소문자 스네이크, 스프라이트/시드 식별자>  ex) marsh_rusted_blade
- region: 늪지대 | 오크 부락 | 고대 룬 산맥 | 서쪽 화산 | 타락천사 | 자유(권역 무관)
- lore: <60~120자, 한 문장~두 문장. 유래 + 시간/인내의 잔향 1조각.>
- art: <Pixellab 64×64 생성용 영문 키워드 6~10개 — 형태·재질·색·분위기. 등급/광원 글로우 제외(글로우는 강화 단계에서 코드가 입힘, GDD §6).>
```

- `key`는 `catalogItems` 시드 + `public/sprites/<slot>/<key>.png` 파일명으로 직결(후속 `spriteKey` 컬럼).
- 슬롯별 50종 목표(무기/방어구/장신구 = 총 150), 이후 가변 추가(`GDD §10`).
- 권역 배분 가이드(슬롯 50종 기준): 세계관 연결 ~20종(5권역 ×~4종) + 자유 ~30종. 강제 아님 — 톤만 일관되면 비중은 유연.

---

## 3. 샘플 5종 (승인 대상)

### 녹슨 늪칼
- slot: weapon
- key: marsh_rusted_blade
- region: 늪지대
- lore: 마른 우물 바닥에서 건져 올린 한손검. 점액에 천 년을 잠겨 날이 거뭇하게 삭았으나, 녹이 오히려 칼날을 더 질기게 만들었다. 버려진 시간이 벼린 검.
- art: one-handed sword, pitted corroded iron blade, mossy green tarnish, leather-wrapped grip, swamp grime, weathered, pixel art

### 화산재 대거
- slot: weapon
- key: ashfall_obsidian_dagger
- region: 서쪽 화산
- lore: 끓는 강가에 식은 흑요석을 깎아 만든 단검. 고룡의 숨결이 지나간 자리에서 천천히 단단해졌다. 식는 데 백 년이 걸린 칼날은 쉬이 무뎌지지 않는다.
- art: short dagger, glassy black obsidian blade, sharp fractured edge, charred bone handle, faint ember-grey ash, volcanic, pixel art

### 룬각 흉갑
- slot: armor
- key: runescar_breastplate
- region: 고대 룬 산맥
- lore: 폭주한 수호 룬에 깎여 떨어진 산의 살점을 두드려 편 흉갑. 표면의 푸른 균열은 아직 식지 않았고, 부술수록 다시 단단히 뭉친다.
- art: heavy breastplate, grey carved stone plating, glowing-blue hairline rune cracks, riveted edges, ancient, weathered, pixel art

### 깃털 두른 망토
- slot: armor
- key: fallen_feather_mantle
- region: 타락천사
- lore: 타락천사가 흘린 검은 깃을 모아 엮은 어깨망토. 신성과 저주가 함께 짜였다. 빛을 등진 자의 온기가 아직 깃 사이에 남아 있다.
- art: shoulder mantle cloak, layered black feathers, tarnished gold-thread trim, faint halo-grey sheen, draped fabric, somber, pixel art

### 부족 전리 목걸이
- slot: accessory
- key: warband_trophy_necklace
- region: 오크 부락
- lore: 오크 부락에서 거둔 뼈와 깨진 무기 조각을 꿰어 만든 목걸이. 족장의 포효를 견딘 자만이 그 무게를 안다. 견뎌낸 시간이 곧 장식이다.
- art: tribal necklace, bone fragments and broken metal shards, frayed cord, dried leather beads, rugged, earthy tones, pixel art

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
