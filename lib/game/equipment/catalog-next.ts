/**
 * 새 catalog (이미지-우선 워크플로).
 * Pixellab로 sprite 먼저 생성 → 사용자 선택 → 한국어 nameKo·lore 작성.
 *
 * 점진적 append (5종씩 batch). 150 완성 후 catalog.ts와 swap.
 * sprite 위치: public/sprites-next/<slot>/<key>.png
 *
 * lore 가이드 (memory: lore-shorter-shape-first):
 *  - 한 문단, 약 80~150자
 *  - 형태 묘사 우선 + 사연 녹임
 *  - "[장소/사람 도입] → [형태 핵심] → [그 형태가 어떻게 보이는지]" 흐름
 */

import type { CatalogItem } from './catalog';

export const CATALOG_NEXT: CatalogItem[] = [
  // ── batch 1: 늪지대 weapon × 5 (다양한 tone) ──
  {
    key: 'marsh_frog_leaf_dirk',
    slot: 'weapon',
    nameKo: '개구리 잎 단검',
    region: '늪지대',
    tone: '위트',
    lore: '늪의 한 어린아이가 첫 비 오는 새벽에 잎 한 장을 접어 만든 단검이다. 끝에 작은 개구리 머리가 가만히 앉아 있는데, 새벽마다 옆자리의 잎이 한 줄씩 더 자라난다. 아이는 단검을 자기 키만큼 자랐을 때 어른에게 넘기겠다고 한 줄을 자루에 작은 글씨로 적어 두었다.',
    art: 'humorous quirky charming silly marsh swamp fantasy dagger weapon item icon, green folded leaf blade with a small frog head perched at the tip, single inanimate game loot object on transparent background',
  },
  {
    key: 'marsh_dry_root_blade',
    slot: 'weapon',
    nameKo: '마른 뿌리의 검',
    region: '늪지대',
    tone: '비애',
    lore: '늪에 묻혀 있던 검을 한 늙은 마부가 자기 마차 옆에 세워 두고 떠난 자리다. 검은 자루 위로 마른 뿌리 한 줌이 죽은 채로 감겨 있고, 뿌리 끝은 검신을 향해 한 방향으로 굽어 있다. 마부가 누구를 묻고 왔는지는 마차의 다음 손님도 묻지 않았다.',
    art: 'mournful melancholy somber sad marsh swamp fantasy sword weapon item icon, slim black blade with dried root tendrils wrapped around the crossguard curving toward the blade, single inanimate game loot object on transparent background',
  },
  {
    key: 'marsh_skull_drip_axe',
    slot: 'weapon',
    nameKo: '점액 흐르는 도끼',
    region: '늪지대',
    tone: '기괴',
    lore: '늪 깊은 자리에서 한 사냥꾼이 들고 나온 도끼다. 자루 위 사람 머리뼈가 칼날을 가만히 내려다보는 자세로 박혀 있고, 칼날엔 짙은 녹색 점액이 한 줄로 천천히 흐른다. 사냥꾼은 도끼를 누구에게도 보여 주지 않고 자기 천막 안쪽에만 세워 두었다.',
    art: 'uncanny eerie creepy unsettling marsh swamp fantasy axe weapon item icon, a human skull mounted at the haft top looking down at the blade with thick green slime dripping along the iron axe head, single inanimate game loot object on transparent background',
  },
  {
    key: 'marsh_lantern_wand',
    slot: 'weapon',
    nameKo: '안개 등롱 wand',
    region: '늪지대',
    tone: '수수께끼',
    lore: '늪 가장 깊은 안개 안쪽에서 한 길잡이가 들고 다닌 wand다. 끝의 작은 등롱 안에 청록 룬 보석이 한 알 박혀 있고, 길이 어디로 굽었는지에 따라 보석의 빛이 한 박자 늦게 한 방향으로 기운다. 등롱은 길잡이가 자기 집에 두고 떠난 새벽에도 가만히 켜져 있었다.',
    art: 'mysterious enigmatic cryptic marsh swamp fantasy magic staff wand item icon, dark wand with a small iron lantern at the tip housing a glowing teal rune gemstone inside, single inanimate game loot object on transparent background',
  },
  {
    key: 'marsh_old_god_polearm',
    slot: 'weapon',
    nameKo: '늪 옛 신의 폴암',
    region: '늪지대',
    tone: '장엄',
    lore: '늪의 가장 오랜 신을 마지막으로 모셨던 자가 자기 자리에 세워 두고 떠난 폴암이다. 끝에 어둠 같은 보라색 꽃이 한 송이 굵게 피어 있고, 자루 가시 사이로 옅은 향이 한 새벽에 한 번 새어 나온다. 그 향을 맡은 늪 사람은 그날 자기 집 문 앞을 비질하지 않고 잠든다.',
    art: 'grand majestic legendary mythic ancient marsh swamp fantasy polearm weapon item icon, dark thorn-wrapped polearm shaft with a single large dark purple flower bloom at the top, single inanimate game loot object on transparent background',
  },

  // ── batch 2: 오크 부락 weapon × 5 ──
  {
    key: 'orc_tooth_band_club',
    slot: 'weapon',
    nameKo: '이빨 띠 곤봉',
    region: '오크 부락',
    tone: '위트',
    lore: '부락의 어린 오크가 처음 짐승을 잡았을 때 그 짐승의 이빨을 띠로 엮어 자기 곤봉 가운데에 둘러 박은 것이다. 곤봉의 둘레가 다 차도록 이빨이 늘어나면 어른 오크들이 그를 한 번 부락 가운데 자리에 서게 한다.',
    art: 'humorous boastful orcish tribal fantasy club bludgeon weapon item icon, crude wooden club with a band of carved fangs wrapped around its middle section, single inanimate game loot object on transparent background',
  },
  {
    key: 'orc_two_feather_sabre',
    slot: 'weapon',
    nameKo: '두 깃의 곡검',
    region: '오크 부락',
    tone: '비애',
    lore: '한 오크 전사가 자기 동무 둘을 잃은 새벽에 두 동무의 화살에서 깃을 하나씩 빼어 자기 곡검의 grip에 묶은 것이다. 깃 사이에 누덕한 천 한 자락이 검신을 향해 늘어져 있고, 천에는 두 동무의 이름이 한 자씩 박혀 있다.',
    art: 'mournful sorrowful orcish tribal fantasy curved sabre weapon item icon, dark curved blade with two feathers tied to the grip and a ragged cloth strip hanging toward the blade, single inanimate game loot object on transparent background',
  },
  {
    key: 'orc_spine_whip',
    slot: 'weapon',
    nameKo: '척추 채찍',
    region: '오크 부락',
    tone: '기괴',
    lore: '어느 짐승의 척추를 통째 꿰어 한 줄로 묶어 만든 채찍이다. 마디마다 한 알의 뼈가 가시처럼 굽어 있어 휘두를 때 자기들끼리 가는 소리를 낸다. 그 소리를 가까이서 들은 부락의 강아지는 사흘간 자기 천막 밖으로 나오지 않았다.',
    art: 'uncanny eerie unsettling orcish tribal fantasy bone whip weapon item icon, a chain whip made entirely of curved animal spine vertebrae linked together, single inanimate game loot object on transparent background',
  },
  {
    key: 'orc_horn_grown_axe',
    slot: 'weapon',
    nameKo: '뿔 자란 도끼',
    region: '오크 부락',
    tone: '수수께끼',
    lore: '부락의 가장 늙은 양 한 마리가 자기 뿔이 떨어지던 새벽 부락 가장자리에 와 그 뿔을 가만히 놓고 돌아갔다. 부락의 대장장이가 그 뿔을 자기 도끼의 머리 위에 굽혀 박았더니, 뿔이 마치 도끼 위에서 한 번 더 자라난 모양이 되었다.',
    art: 'mysterious enigmatic ritual orcish tribal fantasy ceremonial axe weapon item icon, axe head fused with a curled ram horn arching over the blade with tribal glyphs engraved, single inanimate game loot object on transparent background',
  },
  {
    key: 'orc_oldchief_maul',
    slot: 'weapon',
    nameKo: '옛 부족장의 망치',
    region: '오크 부락',
    tone: '장엄',
    lore: '부락의 가장 옛 부족장이 자기 마지막 새벽까지 어깨에 메고 다닌 망치다. 머리에 두른 황금 띠 위로 부락의 첫 일곱 부족장 이름이 한 줄로 새겨져 있고, 띠가 시작되는 자리는 정확히 그가 자기 손가락 끝으로 짚어 두었던 자리다.',
    art: 'grand legendary ancient orcish tribal fantasy chieftain two-handed maul weapon item icon, massive black stone head wrapped with a gold band engraved with seven names, single inanimate game loot object on transparent background',
  },
];
