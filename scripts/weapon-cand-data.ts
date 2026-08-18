/**
 * 아바타 생성 테스트용 최종 후보 14종 데이터.
 *
 * 아바타 파이프라인(compose-v3)은 슬롯마다 **스프라이트 이미지 + wornDesc + lore**를
 * Claude 비전에 넘겨 프롬프트를 합성한다. 그래서 아이콘용 `art`만으로는 테스트가 안 되고
 * 세 가지가 전부 필요하다. 여기 모아 둔다.
 *
 * ⚠ 이 파일은 CATALOG_ITEMS에 **등재하지 않는다** — app/probability/page.tsx가 그 배열로
 *   확률공시 아이템 목록을 만들기 때문에, 채택 전에 넣으면 공시가 먼저 바뀐다(게임산업법 §33).
 *   테스트 스크립트가 실행 프로세스 안에서만 주입한다.
 *
 * wornDesc는 프롬프트가 아니라 **실제 생성된 스프라이트에 보이는 것**을 보고 썼다.
 * 실루엣이 무기로 안 읽히는 항목(활·양산·조종대)은 기존 angel_cherub_bow 방식대로
 * "(a weapon) held in one hand"를 박아 오독을 막는다. 깃털 표현은 피한다 — 아바타
 * 생성기가 등에 날개를 그린 프로덕션 사고가 있다(weapon-kind.ts 주석).
 */
export type CandData = {
  key: string;
  nameKo: string;
  region: string;
  wornDesc: string;
  lore: string;
};

export const CAND_DATA: CandData[] = [
  {
    key: 'kingdom_lionheart_axe',
    nameKo: '사자심 대부',
    region: '왕국',
    wornDesc:
      'broad double-bitted silver battle axe, gold scrollwork along both crescent blades, ' +
      'a roaring gold lion head at the center collar, deep blue haft banded with gold rings',
    lore:
      '양날 초승달에 금 당초가 흐르고, 자루 한가운데엔 포효하는 사자가 앉았다. ' +
      '대관식마다 이 도끼가 제일 먼저 들어온다. 무겁다고 투덜대던 근위병도 막상 손에 쥐면 등이 펴진다더라.',
  },
  {
    key: 'temple_sanctus_mace',
    nameKo: '성전 철퇴',
    region: '신전',
    wornDesc:
      'slim ivory-and-gold mace, its flanged crown-shaped head glowing warm gold from within, ' +
      'gold bands down the pale shaft, a pointed gold ferrule at the butt',
    lore:
      '상아빛 자루 끝, 왕관을 닮은 머리 안에서 금빛이 따뜻하게 새어 나온다. ' +
      '새벽 기도가 끝나면 그 빛이 한 뼘쯤 더 밝아진다. 기름을 채운 사람은 아무도 없다.',
  },
  {
    key: 'angel_lace_parasol',
    nameKo: '레이스 양산검',
    region: '타락천사',
    // 3차 정밀화: 1·2차에서 "그냥 우산"으로 읽혔다 — 창날을 문장의 주인공으로 올리고
    // 양산 캐노피를 그 뒤에 붙인다. 길이·잎사귀꼴을 명시해 장식용 뾰족끝이 되지 않게 한다.
    wornDesc:
      'a long leaf-shaped silver spear blade at the end of a slim gold shaft, the shaft rising ' +
      'into an opened round white lace parasol canopy with thin gold ribs and a scalloped frilled ' +
      'hem, a small gold finial at the very top, a looped white ribbon strap tied just above the blade',
    lore:
      '흰 레이스 위로 금실 살이 지나가고, 손잡이 반대편은 은빛으로 벼려져 있다. ' +
      '접는 순간 그늘이 사라지고 날이 선다. 펼치면 다시 숙녀의 한가한 오후가 된다.',
  },
  {
    key: 'temple_ringstaff_khakkhara',
    nameKo: '육환 석장',
    region: '신전',
    wornDesc:
      'tall pale wooden staff topped with an ornate gold finial of curling scrollwork hung with ' +
      'loose gold rings, a red silk knot tassel tied below the head',
    lore:
      '흰 나무 지팡이 끝에 금 고리 여섯이 헐겁게 걸려 한 걸음마다 짤랑인다. ' +
      '그 소리를 들으면 길 위의 작은 것들이 먼저 비켜난다. 밟지 않으려고 일부러 내는 소리다.',
  },
  {
    key: 'angel_orb_scepter',
    nameKo: '보주 홀',
    region: '타락천사',
    // 4차: 길게 쓸수록 장대가 됐다(3회 실측). 짧은 완드로 잘 나오는 angel_star_wand의
    // 문장 길이·구조를 그대로 따라 간결하게 줄인다 — 묘사가 길면 물건도 커진다.
    // ⚠ "각지지 않은"처럼 없는 것을 명명하면 생성기가 그것을 그린다 — 긍정형으로만 쓴다.
    wornDesc:
      'a very short slim gold wand, small enough to hold in one hand, topped with a small smooth ' +
      'round pearl-white orb, one thin gold ring tilted around the orb, ' +
      'small gold wings and a tasseled cord at its base',
    lore:
      '금 자루 위에 맑은 보주가 떠 있고, 얇은 고리 하나가 비스듬히 감돈다. ' +
      '고리는 한 번도 멈춘 적이 없다. 들고 있으면 손목이 자꾸 그 속도를 따라간다.',
  },
  {
    key: 'volcano_flame_blade',
    nameKo: '화염 검',
    region: '화산',
    wornDesc:
      'sword with a dark ornate iron crossguard and a short wrapped grip, ' +
      'its blade a tall tapering body of bright orange flame with licking edges',
    lore:
      '자루만 무쇠이고 날은 통째로 불꽃이다. 손잡이는 서늘한데 눈앞은 계속 일렁인다. ' +
      '칼집이 없어 벽에 세워 둘 수도 없다. 그래서 주인은 늘 무언가를 든 사람으로 기억된다.',
  },
  {
    key: 'swamp_antler_bow',
    nameKo: '사슴뿔 활',
    region: '늪지대',
    wornDesc:
      'a hunting bow (a weapon) held in one hand, its two limbs a matched pair of pale branching ' +
      'stag antlers joined at a cord-wrapped grip, a taut dark bowstring drawn between the tips',
    lore:
      '활대 두 짝이 사슴뿔 그대로다. 가지 끝마다 잔가지가 살아 있어 시위 걸 자리를 찾는 데 한참 걸린다. ' +
      '늪의 사냥꾼은 그 시간을 좋아했다. 뿔의 주인에게 인사하는 시간이라고 했다.',
  },
  {
    key: 'westvolcano_dragonscale_greataxe',
    nameKo: '용린 대부',
    region: '서쪽 화산',
    // 3차 정밀화: 두 날이 서로 다르다는 게 이 도끼의 전부인데 1·2차에서 양쪽 다 비늘로
    // 뭉개졌다. 한 문장에 붙여 쓰면 재질이 번지므로 날을 따로 떼어 대비시킨다.
    wornDesc:
      'a large two-handed greataxe whose two crescent blades are deliberately unlike each other — ' +
      'the upper blade sheathed in teal iridescent dragon scales, the lower blade bare polished ' +
      'silver steel with no scales — joined by an ornate gold collar set with one round red gem, ' +
      'a teal scaled haft banded in gold with a flared gold cap at the butt',
    lore:
      '한쪽 날은 청록 비늘로 덮이고 반대쪽은 맨 강철이다. 금 세공 가운데 붉은 보석이 박혔다. ' +
      '비늘 쪽으로 베면 소리가 없고 강철 쪽은 요란하다. 어느 쪽을 쓰는지가 그날의 기분을 말해 준다.',
  },
  {
    key: 'kingdom_goldwound_rapier',
    nameKo: '금선 세검',
    region: '왕국',
    wornDesc:
      'slender rapier, its steel blade veined all over with fine gold-filled cracks, ' +
      'an ornate gold swept knuckle guard, a pink gem pommel',
    lore:
      '날 전체에 잔금이 흘렀고 그 모든 자리에 금이 채워졌다. 한 번 부러질 때마다 금이 한 줄씩 늘었다. ' +
      '지금은 강철보다 금이 더 많아 보인다. 주인은 그걸 흉터가 아니라 이력이라 불렀다.',
  },
  {
    key: 'plague_doctor_cane',
    nameKo: '역병 의사의 지팡이',
    region: '일반',
    wornDesc:
      'tall dark cane staff topped with a bone-white beaked plague-doctor mask, ' +
      'a small silver censer at its side trailing pale green smoke, ' +
      'dark shaft with silver fittings and a flared foot',
    lore:
      '검은 지팡이 끝에 흰 부리 가면이 얹히고, 옆의 작은 향로에서 옅은 초록 연기가 샌다. ' +
      '그 연기가 지나간 골목은 하루쯤 조용해진다. 낫는 소리도 앓는 소리도 없이.',
  },
  {
    key: 'druid_antler_staff',
    nameKo: '드루이드의 지팡이',
    region: '일반',
    wornDesc:
      'tall twisted dark-wood staff whose crown forks into branching stag antlers, ' +
      'a glowing amber stone cradled in the fork, green moss and vines wound down the shaft',
    lore:
      '뒤틀린 나무가 위에서 사슴뿔로 갈라지고 그 사이에 호박석이 얹혔다. ' +
      '돌 안에는 아주 오래된 여름이 갇혀 있다. 겨울에 들면 손끝부터 먼저 따뜻해진다.',
  },
  {
    key: 'puppeteer_thread_claw',
    nameKo: '인형사의 실',
    region: '일반',
    wornDesc:
      'an ornate black-and-crimson cross-shaped puppet control bar (a weapon) held in one hand, ' +
      'edged in gold, a single red thread hanging from its base with a tiny jointed doll dangling at the end',
    lore:
      '검붉은 십자 조종대 아래로 붉은 실 한 가닥이 늘어지고, 끝에 작은 관절 인형이 매달렸다. ' +
      '손목을 까딱이면 인형이 먼저 웃는다. 인형사는 대신 웃어 주는 쪽이 있으니 됐다고 했다.',
  },
  {
    key: 'oni_slayer_odachi',
    nameKo: '귀참의 대태도',
    region: '일반',
    // 4·5차: 오니 얼굴·검은 날·불꽃 문양·전체적으로 붉은 인상 네 가지에만 집중한다.
    // ⚠ 뿔·부적은 뺀다(사용자 지정) — 3차에서 뿔을 두 번 쓰자 얼굴이 뿔에 밀려 뭉개졌다.
    // ⚠ 로어도 compose에 함께 넘어간다 — wornDesc에서만 빼면 로어에 남은 뿔·부적이
    //   그대로 그려진다(4차 실측). 두 곳을 같이 손봐야 한다.
    wornDesc:
      'a very long odachi that reads red overall — a matte black blade veined with burning crimson ' +
      'flame patterns and a glowing red-orange cutting edge, the iron guard cast as a snarling red ' +
      'oni demon face, a red cord-wrapped hilt',
    lore:
      '검은 날 위로 진홍 불꽃이 흐르고, 코등이에는 성난 도깨비 얼굴이 붉게 앉았다. ' +
      '칼을 뽑으면 그 얼굴이 먼저 웃는다. 베고 나면 다시 무표정으로 돌아간다.',
  },
  {
    key: 'druid_thorn_staff',
    nameKo: '가시 드루이드 지팡이',
    region: '일반',
    wornDesc:
      'twisted black bramble staff bristling with thorns along its length, ' +
      'a deep red rose blooming at its crown',
    lore:
      '검은 덤불이 꼬여 지팡이가 되고 온몸에 가시가 돋았다. 꼭대기엔 진홍 장미 한 송이가 피어 있다. ' +
      '쥐는 자리마다 피가 난다. 그래도 다들 위쪽만 보고 손을 뻗는다.',
  },
];
