# 인생강화 — 아이템 카탈로그 설계 (ITEMS.md)

> 아이템 카탈로그의 **단일 진실 원천**. 코드: `lib/game/equipment/catalog-next.ts`(생성 결과) ·
> 스프라이트: `public/sprites/<slot>/<key>.png`. 본 문서는 *무엇을·왜* 만드는지의 설계 기준이다.

---

## 0. 철학 — "전투 기어"가 아니라 "아바타 코디"

아이템의 본질은 **아바타를 꾸미는 패션 스테이트먼트**다. 전투력은 강화·초월로 따로 돌고,
아이템 디자인의 목적은 오직 **비주얼 매력 · 개성 · 조합의 재미**다.

핵심 목표: **여러 조합을 계속 시도하게 만들어 아바타 생성을 유도한다.** 그래서 모든 아이템은
"이 조합 멋지다" 싶게, 그리고 *어떤 조합이든* 깨끗하게 합쳐지도록 설계한다.

### 0.1 세트 폐기 — 개성과 조합
과거 카탈로그의 문제는 아이템이 "맞춤 3종 세트"로 저작돼 섞는 재미가 봉인된 것이었다.
본 설계는 **세트를 버린다**:

- **타입(실루엣) = 개성의 원천** — 같은 슬롯·같은 지역 안에서도 모든 타입이 서로 다른 실루엣.
- **지역 = 마감(팔레트·모티프) + 스토리(로어)** — 어떤 실루엣에도 입혀지는 *얼굴*이지, 맞춤 세트가 아니다.
- 결과: "신전 장총 + 늪지 요정 드레스 + 왕국 모노클"이 진짜 새 캐릭터로 보인다.

---

## 1. 생성기 최적화 규칙 (협상 불가 — 아바타 파이프라인이 잘 그리는 것만 만든다)

아바타는 `lib/game/profile/compose-v3.ts` → Pixellab `create-character-v3`로 생성된다. 고정 앵커:

| 앵커 | 고정값 |
|------|--------|
| 스타일 | 정통 일본 애니/JRPG 키비주얼, 라인리스, 셀셰이딩, **밝고 채도 높은 색**, 256px |
| 주체 | **20~24세 미소녀/미소년**(동안·과성숙 금지) |
| 비율 | **7등신**(머리 ≈ 1/7), 긴 다리·슬림. 머리+머리장식 합쳐 ≤ 1/6 |
| 종족 | 인간 50% + 묘귀·요정·엘프·다크엘프·용인 각 10%. 귀·뿔·날개는 **항상 작게** |
| 포즈 | **정면 고정**, 차분, 무기는 **한 손에 쥐고 어깨 높이 이하**(머리 위·뜨는 무기 금지) |

### 1.1 슬롯 = 3개의 독립 시각 영역
세 슬롯이 겹치지 않는 영역을 차지해야 조합이 항상 깨끗하다.

| 슬롯 | 시각 영역 | 설계 규칙 |
|------|----------|----------|
| **무기** | 손·들린 것 | **한 손에 쥔 정지 자세 + 세로로 긴 형태**가 7등신을 강화. 활 당기기/오버헤드/뜨는 무기 ❌ |
| **방어구** | 전신 의상 | **슬림·세로 드레이프** 유지. 벨/후프형 넓은 드레스·벙벙한 갑옷 ❌(키를 줄임) |
| **장신구** | 얼굴·휴대품 | **휴대품·얼굴 소품 우선**. 머리장식은 작게. 거대 투구·큰 머리장식·거대 가면 ❌ |

### 1.2 종족 안전
종족은 서버 랜덤이라 **6종족 공통으로 안전**해야 한다. 큰 머리장식 회피 = 묘귀 귀·용인 뿔과 충돌 방지
(위 장신구 규칙이 그대로 해결). 등 장식은 요정 날개와 겹치지 않게 작게.

### 1.3 톤
애니 파이프라인은 **밝고 채도 높은 색**을 가장 잘 그린다. 탁하고 어두운 건 스타일과 싸운다.
전 카탈로그를 **화려·귀여움·멋·웅장** 중심으로. "귀여움"은 치비화가 아니라 **파스텔 팔레트 +
작은 마스코트 휴대품**으로(7등신 몸은 유지).

---

## 2. 규모 · 분포 — 120종

슬롯 균형(무기 40 · 방어구 40 · 장신구 40), 왕국 가중.

| 지역 | 슬롯당 | 합계 | 미감 |
|------|:--:|:--:|------|
| **왕국** | 10 | **30** | 바로크 왕실 — 최고 화려·웅장 |
| **신전** | 6 | 18 | 설산 룬 신전 + 화려한 사냥총 |
| **오크 부락** | 6 | 18 | 화려한 부족 축제 전사(밝게) |
| **화산** | 6 | 18 | 용암의 광채·황금 대장간 |
| **늪지대** | 6 | 18 | 신비 발광 늪·요정(귀엽게) |
| **타락천사** | 6 | 18 | 천상의 광휘·날개(밝은 천상) |
| **합** | **40** | **120** | |

> region 키 매핑(코드): 왕국=`kingdom` · 신전=`temple` · 오크 부락=`orc` · 화산=`volcano` ·
> 늪지대=`swamp` · 타락천사=`angel`. (zones·catalog 동일.)

### 2.1 지역별 팔레트·모티프
| 지역 | 팔레트 | 모티프 |
|------|--------|--------|
| 왕국 | 로열블루·골드·와인·화이트 | 금선세공·보석·사자문장·다마스크·리본·별 |
| 신전 | 화이트·실버·아이스블루·골드룬 | 서리룬·모피트림·성각(聖刻)·각인 총기 |
| 오크 | 따뜻한 흙빛·선명한 주황/청록·골드·뼈백 | 워페인트·깃털·구슬·토템·부족 문양 |
| 화산 | 옵시디언 블랙·용암 주황/골드 발광·엠버레드 | 용암 균열·금상감·용비늘·불티(밝게 빛나게) |
| 늪지 | 파스텔 청록/민트·라벤더·반딧불 골드·연분홍 | 발광버섯·반딧불·이끼·덩굴·요정 날개·수련 |
| 천사 | 화이트·골드·천상 블루/바이올렛·깃털 | 후광·날개(작게)·깃털·광선·성문(聖文) |

---

## 3. 120종 타입 리스트

각 항목 = **타입(한국어) — 외형 컨셉(영문 art 시드)**. 지역 안에서 같은 슬롯 타입은 전부 다른 실루엣.

### 3.1 왕국 (W10 / A10 / Acc10)
**무기**
1. 레이피어 — slim gold blade with a wine-red ribbon
2. 의장 세이버 — ornate ceremonial saber, black-and-gold
3. 궁정 쌍검 — twin matched court blades (one per hand)
4. 대관식 의장창 — tall ornate spear with a lion crest and blue gem
5. 보석 장검 — jeweled longsword, royal blue and gold
6. 전쟁 부채(철선) — ornate folding war-fan with metal ribs
7. 지팡이검 — a gentleman's cane that conceals a thin blade
8. 결투 권총 — baroque ornate dueling pistol, gold filigree
9. 왕홀 메이스 — a royal scepter-mace topped with a jewel
10. 리본 채찍검 — a coiled ribbon-blade whip, crimson and gold

**방어구**
1. 무도회 드레스 — elegant masquerade ball gown, black-gold, wine trim
2. 왕실 군복 제복 — royal military dress uniform with epaulettes
3. 별의 망토 — royal blue velvet mantle with gold filigree and jeweled stars
4. 공주 A라인 가운 — slim floor-length princess gown
5. 근위 판금 — ornate royal-guard plate armor (slim)
6. 귀족 테일코트 — noble tailcoat suit, gold-buttoned
7. 대관식 예복 — long coronation robe with ermine and gold
8. 왕립 교복 — royal academy uniform, blazer and trim
9. 보석 흉갑 드레스 — jeweled cuirass over a slim dress
10. 오페라 가운 — opera evening gown, deep blue and silver

**장신구**
1. 보석 왕관 — small jeweled royal crown (kept low)
2. 깃털 가면 — feathered masquerade mask
3. 접선 부채 — folding hand fan, gold-painted
4. 모노클 — gold-rimmed monocle
5. 레이스 파라솔 — lace parasol (carried)
6. 진주 티아라 — pearl tiara
7. 훈장 사쉬 — medal sash across the chest
8. 장미 부케 — a bouquet of roses (carried)
9. 깃털 베레 — small plumed beret
10. 오페라 글라스 — ornate opera glasses (carried)

### 3.2 신전 — 설산 룬 신전 + 화려한 사냥총 (W6 / A6 / Acc6)
**무기**: 1. 의장 사냥 장총 ornate hunting rifle · 2. 각인 머스캣 engraved musket ·
3. 서리 창 frost-rune spear · 4. 룬 장궁 rune longbow (held, undrawn) ·
5. 룬 지팡이 rune staff · 6. 빙결 세이버 ice saber
**방어구**: 1. 모피 사냥 예복 fur-lined hunting coat · 2. 백금 사제복 white-gold vestment ·
3. 설백 룬 갑옷 rune-engraved snow plate · 4. 신성 사냥꾼 로브 sacred hunter robe ·
5. 모피 망토 드레스 fur-mantle dress · 6. 설원 레인저 롱코트 ranger longcoat
**장신구**: 1. 룬 스코프 모노클 rune-scope monocle · 2. 모피 모자 small fur cap ·
3. 서리 유물서 frost relic-tome (carried) · 4. 사냥 뿔피리 hunting horn (carried) ·
5. 룬 서클릿 rune circlet · 6. 모피 가방 fur muff-satchel

### 3.3 오크 부락 — 화려한 부족 축제 전사 (W6 / A6 / Acc6)
**무기**: 1. 대형 클리버 great cleaver (shoulder-rest) · 2. 부족 대도끼 tribal greataxe ·
3. 토템 전곤 totem war-club · 4. 뼈창 bone spear · 5. 쌍 손도끼 dual hatchets · 6. 엄니검 tusk-blade
**방어구**: 1. 모피·구슬 전사복 fur-and-bead warrior garb (fitted) · 2. 깃털 족장 망토 feathered chieftain mantle ·
3. 토템 채색 가죽갑옷 totem-painted hide armor · 4. 축제 전사 의상 colorful festival warrior outfit ·
5. 엄니 견갑 가죽옷 tusk-pauldron leathers · 6. 구슬 모피 드레스 beaded fur dress
**장신구**: 1. 부족 가면 small tribal mask · 2. 전쟁 북 war-drum (carried) · 3. 뼈·황금 목걸이 bone-and-gold necklace ·
4. 깃털 머리장식 modest feather headpiece · 5. 토템 부적 지팡이 small totem charm-staff (carried) · 6. 워페인트 face warpaint

### 3.4 화산 — 용암의 광채·황금 대장간 (W6 / A6 / Acc6)
**무기**: 1. 화염 대검 flaming greatsword · 2. 용암 워해머 molten warhammer · 3. 옵시디언 할버드 obsidian halberd ·
4. 용암 낫 lava scythe · 5. 엠버 쌍검 ember dual-blades · 6. 마그마 클로 magma claw gauntlet
**방어구**: 1. 황금 용암 판금 molten-gold plate · 2. 옵시디언 용비늘 갑옷 obsidian dragon-scale armor ·
3. 대장장이 코트 forge-master coat · 4. 엠버맥 흉갑 ember-vein cuirass · 5. 잿빛 금 로브 ash-and-gold robe ·
6. 용암기사 갑옷+방패 lava-knight armor with a small kite shield
**장신구**: 1. 엠버 보석 서클릿 ember-gem circlet · 2. 용비늘 가방 dragon-scale satchel · 3. 대장간 고글 forge goggles (face) ·
4. 황금 건틀릿 부적 molten-gold gauntlet-charm · 5. 잿빛 유물서 ash relic-book · 6. 엠버 등롱 ember lantern

### 3.5 늪지대 — 신비 발광 늪·요정 (W6 / A6 / Acc6)
**무기**: 1. 반딧불 단검 firefly dagger · 2. 덩굴 채찍 coiled vine whip · 3. 발광버섯 지팡이 glowing-mushroom staff ·
4. 수련 글레이브 water-lily glaive · 5. 가시 레이피어 thorn rapier · 6. 잎날 쌍검 dual leaf-blades
**방어구**: 1. 이끼 드레스 moss elegant dress · 2. 버섯갓 로브 mushroom-cap robe · 3. 요정 꽃잎 드레스 fairy petal dress ·
4. 늪 마녀 드레스 bright swamp-witch dress · 5. 덩굴 가운 vine-wrapped gown · 6. 반딧불 망토드레스 firefly cloak-dress
**장신구**: 1. 버섯 랜턴 mushroom lantern (carried) · 2. 요정 날개 장식 small fairy-wing charm · 3. 둥근 잎 안경 round leaf-glasses ·
4. 꽃 화관 small flower crown · 5. 마스코트 가방 mushroom-mascot satchel · 6. 발광 구슬 glowing orb (carried)

### 3.6 타락천사 — 천상의 광휘·날개 (W6 / A6 / Acc6)
**무기**: 1. 광휘 대검 radiant greatsword · 2. 빛의 활 light bow (held) · 3. 깃털 글레이브 feather glaive ·
4. 후광 차크람 halo chakram (held) · 5. 천상 세이버 celestial saber · 6. 빛의 왕홀 light scepter
**방어구**: 1. 날개 갑옷 winged armor (modest wings) · 2. 광휘 가운 radiant gown · 3. 성기사 판금 holy-knight plate ·
4. 깃털 망토 로브 feathered-mantle robe · 5. 천상 드레스 celestial dress · 6. 빛의 사제복 light-priest vestment
**장신구**: 1. 후광 halo (flat behind head) · 2. 깃털 서클릿 feather circlet · 3. 성유물서 holy relic-tome (carried) ·
4. 깃털 부채 feather fan · 5. 별 티아라 small star tiara · 6. 빛 구슬 light orb (carried)

---

## 4. 필드 작성 규칙 (CatalogItem)

| 필드 | 규칙 |
|------|------|
| `key` | `<region>_<짧은영문>` snake_case, 전역 유니크 (예: `kingdom_ribbon_rapier`, `temple_hunting_rifle`). region 접두는 영문 키(kingdom/temple/orc/volcano/swamp/angel) |
| `slot` | weapon / armor / accessory |
| `nameKo` | **부위마다 고유·여운 있는 단독 이름**. "세트접두+부위" 단조구조 금지 (예: "무도회의 한 수", "이름 없는 드레스") |
| `region` | 한국어 권역 값 |
| `tone` | 로어 정서 6종 중 1(영웅담·수수께끼·전설·화려·아름다운·희망). **담백·일상 금지** |
| `lore` | 한국어 한 문단(80~150자), **형태 묘사 위주 + 스토리 녹임**. 등급/성능 언급 금지. 이미지에 보이는 것만 |
| `art` | Pixellab 64px 영문 키워드 — **외형(형태·재질·색)만**. 글로우/등급/감각·온도·서사 표현 제외 |
| `wornDesc` | 아바타 합성용 착용 외형(영문·간결·성별중립) |

### 4.1 로어 톤 배분
- **밝음 55~60%** 우선(화려·아름다운·희망), 우울 쏠림 금지.
- **지역×톤 세트마다 정서·서술 방식 완전 다르게**(읽는 재미). 이미지에 보이는 것만 묘사.
- '룬' 단어 과사용 금지 — 신전 외 지역은 룬 외 장치로 수수께끼를 다양화.

---

## 5. 유지할 기존 아이템

현재 108종 중 **단독으로도 개성 있고 + 새 지역 미감에 맞고 + 잘 렌더되는** 것만 소수 유지(지역당 1~2개).
선별 기준:
1. 실루엣이 독특해 다른 아이템과 안 겹침
2. 새 팔레트·미감에 자연스럽게 편입
3. 세트 의존 없이 혼자서도 멋짐

→ 선별은 별도 단계(현 108종 일람 검토 후 확정). 유지 항목은 위 120 카운트에 흡수(신규 생성분에서 차감).

---

## 6. 다음 단계
1. **120 타입 리스트 확정** (본 문서 §3 리뷰·조정)
2. **유지 아이템 선별** (현 108종 검토 → 지역당 1~2개)
3. **항목별 nameKo · lore · art · wornDesc 작성** (슬롯/지역별 배치, 검토 반복)
4. **Pixellab 스프라이트 생성** — 유료, 배치 단위, **생성 전 확인 필수**
5. 카탈로그 시드 교체 · 전투력/초월 매핑 · 마이그레이션(별도)
