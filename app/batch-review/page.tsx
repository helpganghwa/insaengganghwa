// 임시 batch 리뷰 — 새 sprite candidates 4×5 = 20장 시각 비교.
// 사용자가 각 슬롯에서 베스트 선택하면 promote + lore 단계로.
// 리뷰 후 디렉터리 통째 삭제.
//
// Next 16 prerender에서 발생한 빌드 에러 회피 — dynamic으로 강제.
export const dynamic = 'force-dynamic';

interface Item {
  slug: string;
  tone: string;
  region: string;
  slot: 'weapon' | 'armor' | 'accessory';
  /** 0~3 index of recommended candidate */
  recommend: number;
  hint: string; // 추천 사유 한 줄
  candidateNotes: string[]; // 각 candidate 한 줄 설명
}

const ITEMS: Item[] = [
  {
    slug: 'marsh_witty_dagger',
    tone: '위트',
    region: '늪지대',
    slot: 'weapon',
    recommend: 0,
    hint: '잎/개구리 모티프가 위트 톤을 가장 명확히 살림',
    candidateNotes: [
      '녹색 잎 단검 + 작은 개구리 머리',
      '물고기 형태 (생선뼈+머리)',
      '거친 뼈 단검 + 가시 crossguard',
      '청록 단검 + 와류 pommel + 작은 도마뱀',
    ],
  },
  {
    slug: 'marsh_mournful_sword',
    tone: '비애',
    region: '늪지대',
    slot: 'weapon',
    recommend: 0,
    hint: '마른 뿌리 ornament가 비애 톤과 가장 어울림',
    candidateNotes: [
      '검은 검 + 자루에 마른 뿌리/가지 ornament',
      '검정 검 + crossguard에 마른 잎',
      '어두운 비좁은 검 + 보석',
      '짧은 묘비형 검',
    ],
  },
  {
    slug: 'marsh_uncanny_axe',
    tone: '기괴',
    region: '늪지대',
    slot: 'weapon',
    recommend: 0,
    hint: '두개골+점액 모티프가 기괴 톤 최고치',
    candidateNotes: [
      '두개골 자루 + 칼날에 녹색 점액 흐름',
      '짧은 cleaver + 호박등불',
      '거미줄+검은 거미 박힌 양날 도끼',
      '녹/이끼 융합 도끼',
    ],
  },
  {
    slug: 'marsh_mystic_staff',
    tone: '수수께끼',
    region: '늪지대',
    slot: 'weapon',
    recommend: 2,
    hint: '랜턴 안에 갇힌 룬 보석이 수수께끼 톤에 가장 잘 맞음',
    candidateNotes: [
      '회색 지팡이 + 끝 청록 보석',
      '삼지창형 청록 룬 지팡이',
      '랜턴 wand + 안에 청록 룬 보석',
      '두개골 다발 wand + 녹색 점액 (기괴와 겹침)',
    ],
  },
  {
    slug: 'marsh_humble_spear',
    tone: '일상',
    region: '늪지대',
    slot: 'weapon',
    recommend: 1,
    hint: '청동 삼지창 = 늪 어부 일상 톤 명확 (※ 일상 → 장엄으로 변경, 본 항목은 폐기)',
    candidateNotes: [
      '단순 어두운 창 (가시 끝)',
      '청동 삼지창 어부의 작살',
      '막대형 창 + 가죽 끈',
      '짧은 어부 작살 + 단순 가죽 매듭',
    ],
  },
  {
    slug: 'marsh_legendary_polearm',
    tone: '장엄',
    region: '늪지대',
    slot: 'weapon',
    recommend: 3,
    hint: '가시 자루 폴암 + 거대 보라 꽃송이 → 늪의 전설 톤 최고치',
    candidateNotes: [
      '청록 도끼날 + 송장 머리 행거 + 가시 자루 (늪지 무덤 도끼)',
      '무거운 양손 battle axe (무게감 있지만 평이)',
      '회색 도끼날 + 두 보석 + 의례 술 (의례적)',
      '어두운 폴암 + 거대 보라 꽃송이 + 가시 자루 (늪의 전설)',
    ],
  },
  // ── batch 2: 오크 부락 weapon × 5 ──
  {
    slug: 'orc_witty_club',
    tone: '위트',
    region: '오크 부락',
    slot: 'weapon',
    recommend: 2,
    hint: '잭오랜턴 얼굴 곤봉 — 위트 톤 가장 명확',
    candidateNotes: [
      '거친 곤봉 + 가운데 작은 송곳니/이빨',
      '매끄러운 곤봉 + 끝에 깃털·치아 행거',
      '곤봉 + 큰 웃는 잭오랜턴 얼굴 새겨짐',
      '곤봉 끝에 짐승 두개골/이빨',
    ],
  },
  {
    slug: 'orc_mournful_sabre',
    tone: '비애',
    region: '오크 부락',
    slot: 'weapon',
    recommend: 2,
    hint: '잔뜩 매단 묘비 천 → 비애 최고치',
    candidateNotes: [
      '곡검 + grip에 어두운 헝겊 (단순)',
      '곡검 + 자루에 빨간/누덕 천 감김',
      '곡검 + 잔뜩 매단 묘비 천·헝겊',
      '곡검 + grip 천 + 깃털 두 개',
    ],
  },
  {
    slug: 'orc_uncanny_flail',
    tone: '기괴',
    region: '오크 부락',
    slot: 'weapon',
    recommend: 2,
    hint: '두개골 박힌 가시 공 — flail 형태 유지 + 기괴',
    candidateNotes: [
      '가시 공 + 체인 (평이)',
      '척추뼈 chain whip (unique하지만 flail 컨셉에서 벗어남)',
      '두개골 박힌 가시 공 + 체인',
      '가시 공 + 뼈 grip + 체인',
    ],
  },
  {
    slug: 'orc_mystic_warhorn_axe',
    tone: '수수께끼',
    region: '오크 부락',
    slot: 'weapon',
    recommend: 0,
    hint: '도끼날 위로 굽은 양머리 뿔 — 의례적 융합',
    candidateNotes: [
      '양머리 뿔이 도끼날 위로 굽어 모자 형태',
      '두 뿔이 양 옆으로 뻗은 양날 도끼',
      '두 뿔만 (도끼 모양 X)',
      '양머리 두개골 + 뿔 + 자루 (장식 무기)',
    ],
  },
  {
    slug: 'orc_legendary_chieftain_maul',
    tone: '장엄',
    region: '오크 부락',
    slot: 'weapon',
    recommend: 0,
    hint: '검은 maul + 황금 문장 — 부족장 장엄 명확',
    candidateNotes: [
      '큰 검은 maul + 황금 띠/문장',
      '가시 박힌 mace (덜 거대)',
      'brass 망치 + 황금 trim',
      'stone+brass 어두운 망치 + 뼈 grip',
    ],
  },
  // ── batch 3: 고대 룬 산맥 weapon × 5 ──
  {
    slug: 'rune_witty_chime_wand',
    tone: '위트',
    region: '고대 룬 산맥',
    slot: 'weapon',
    recommend: 0,
    hint: '단일 brass 종 + 룬 새김 — 가장 위트',
    candidateNotes: [
      '어두운 wand + 끝에 작은 brass 종 (룬 새김)',
      '동그란 룬 패널 wand (위트 약함)',
      '어두운 wand + 끝에 작은 종 3개 행거',
      '모자 형태 wand (이상)',
    ],
  },
  {
    slug: 'rune_mournful_shard_sword',
    tone: '비애',
    region: '고대 룬 산맥',
    slot: 'weapon',
    recommend: 2,
    hint: '깨진 stone 검 3조각 — 비애 톤 가장 명확',
    candidateNotes: [
      '큰 stone sword (룬 새김, 깨지지 않음)',
      '청록 룬 줄기 감긴 검 (자라난 룬)',
      '깨진 stone 검신 (3조각으로 깨짐)',
      '청록 곡검 (사선)',
    ],
  },
  {
    slug: 'rune_uncanny_eye_dagger',
    tone: '기괴',
    region: '고대 룬 산맥',
    slot: 'weapon',
    recommend: 0,
    hint: '빨간 동공의 눈 — 살아있는 눈 가장 명확',
    candidateNotes: [
      '어두운 단검 + crossguard에 빨간 눈',
      '청록 단검 + crossguard에 청록 보석 눈',
      '어두운 단검 + 4개 보석 (눈 같지 않음)',
      '청록 단검 + 가운데 푸른 보석 눈',
    ],
  },
  {
    slug: 'rune_mystic_seven_book_staff',
    tone: '수수께끼',
    region: '고대 룬 산맥',
    slot: 'weapon',
    recommend: 0,
    hint: 'wand + 옆에 매단 stone book 모티프 명확',
    candidateNotes: [
      '어두운 wand + 옆에 stone book (룬 글자) 행거',
      '갈색 wand + brass 책 (작은)',
      '갈색 wand + 흰 stone book + 두 보석',
      '검은 wand + 검정 stone book',
    ],
  },
  {
    slug: 'rune_legendary_first_thunder_hammer',
    tone: '장엄',
    region: '고대 룬 산맥',
    slot: 'weapon',
    recommend: 1,
    hint: '산 모양 hammer + 룬 글자 — 룬 산맥 region 정체성 최강',
    candidateNotes: [
      '회색 stone head + 가운데 큰 파란 번개 룬',
      '산 모양 stone hammer + 룬 글자 다수',
      'stone+brass 망치 + 룬 새김 + 자루 묶음',
      'stone 망치 + 파란 룬 줄 (단순)',
    ],
  },
  // ── batch 4: 서쪽 화산 weapon × 5 ──
  {
    slug: 'volcano_witty_pan_cleaver',
    tone: '위트',
    region: '서쪽 화산',
    slot: 'weapon',
    recommend: 1,
    hint: '프라이팬 + 잭오랜턴 + cleaver — 화로 부엌 위트',
    candidateNotes: [
      '작은 검은 cleaver in 프라이팬 (작은 sparks)',
      '프라이팬 안에 잭오랜턴 + cleaver + 불꽃',
      '단순 cleaver (위트 약함)',
      '프라이팬 + 잭오랜턴 + cleaver (큰 구성)',
    ],
  },
  {
    slug: 'volcano_mournful_widow_hammer',
    tone: '비애',
    region: '서쪽 화산',
    slot: 'weapon',
    recommend: 0,
    hint: '단순한 망치 + 리본 한 줄 — 잿더미 과부의 망치',
    candidateNotes: [
      '회색 망치 + 리본 한 줄 + 갈색 grip',
      '검정 망치 + 빨간 술 매달림 (화려)',
      '검은 작은 mace + 손가락 행거 (기괴 쪽)',
      '회색 망치 + 짧은 술 (단순)',
    ],
  },
  {
    slug: 'volcano_uncanny_molten_eye_dagger',
    tone: '기괴',
    region: '서쪽 화산',
    slot: 'weapon',
    recommend: 3,
    hint: '거대 용암 균열 + 오렌지 눈 — 가장 dramatic',
    candidateNotes: [
      '단검 + crossguard 가운데 오렌지 눈 (작음)',
      '단검 + 가운데 오렌지 눈 + 거대 + 용암 균열',
      '단순 단검 + 끝에 오렌지 눈 보석 (소용돌이)',
      '단검 + 끝에 오렌지 눈 + 거대한 균열',
    ],
  },
  {
    slug: 'volcano_mystic_ember_runesword',
    tone: '수수께끼',
    region: '서쪽 화산',
    slot: 'weapon',
    recommend: 2,
    hint: '룬 + 빨간 보석 pommel — 일관된 잉걸 룬 검',
    candidateNotes: [
      '검은 검 + 빨간 룬 줄 + crossguard 작은 곤충',
      '검은 검 + 빨간 룬 줄 (단순)',
      '검은 검 + 빨간 룬 줄 + 빨간 보석 pommel (균형)',
      '검은 검 + 빨간 룬 줄 + 가시 자루',
    ],
  },
  {
    slug: 'volcano_legendary_dragon_forge_axe',
    tone: '장엄',
    region: '서쪽 화산',
    slot: 'weapon',
    recommend: 2,
    hint: '용암 균열 + 가운데 황금 룬 — mythic 톤 최고',
    candidateNotes: [
      '검은 도끼 + 용암 균열 (양옆) + 비늘 머리',
      '빨간 도끼 + 거대한 + 비늘+가시 (강렬)',
      '검은 도끼 + 용암 균열 + 가운데 황금 룬',
      '갈색 도끼 + 용암 균열 + 뼈 자루',
    ],
  },
  // ── batch 5: 타락천사 weapon × 5 ──
  {
    slug: 'fallen_witty_cherub_rapier',
    tone: '위트',
    region: '타락천사',
    slot: 'weapon',
    recommend: 1,
    hint: 'cherub이 검 위에 누워 노는 자세 — 위트 톤 최고',
    candidateNotes: [
      '가는 rapier + pommel에 작은 cherub 아기',
      'rapier 위에 cherub 천사가 앉아 노는 모양',
      '검 + 위 cherub + 가운데 룬 줄기 (mystic 쪽)',
      '작은 rapier + 황금 swept guard + cherub (화려)',
    ],
  },
  {
    slug: 'fallen_mournful_choir_sword',
    tone: '비애',
    region: '타락천사',
    slot: 'weapon',
    recommend: 1,
    hint: '검은 깃털 + 천 — fallen 모티프 가장 명확',
    candidateNotes: [
      '단순 회색 검 + pommel 작은 보석 + grip 가죽',
      '어두운 검 + crossguard 검은 깃털 + 천',
      '회색 검 + 가시 crossguard + 가죽 wrap',
      '가시 crossguard + 천 늘어짐',
    ],
  },
  {
    slug: 'fallen_uncanny_decay_scythe',
    tone: '기괴',
    region: '타락천사',
    slot: 'weapon',
    recommend: 2,
    hint: '낫 + 두 부패 날개 + 가운데 보석 — dramatic',
    candidateNotes: [
      '어두운 낫 + 자루에 검은 깃털',
      '큰 황금+회색 깃털로 만든 낫 모양',
      '낫 + 두 깃털 날개 + 가운데 보석 (부패 신성)',
      '어두운 낫 + 흩어진 검은 깃털',
    ],
  },
  {
    slug: 'fallen_mystic_veiled_wand',
    tone: '수수께끼',
    region: '타락천사',
    slot: 'weapon',
    recommend: 0,
    hint: '신부 베일 wand — 가장 순수한 베일 모티프',
    candidateNotes: [
      '신부 베일 wand (흰 베일이 끝을 덮음)',
      '베일에 보라 보석 박힘 wand',
      '검은 보석 + 흰 베일 + 짧은 wand',
      '검 + 베일 (검 모양, wand 아님)',
    ],
  },
  {
    slug: 'fallen_legendary_seraph_glaive',
    tone: '장엄',
    region: '타락천사',
    slot: 'weapon',
    recommend: 2,
    hint: '황금 후광 + 깃털 + 가운데 룬 검 — 세라프 장엄',
    candidateNotes: [
      '후광 + 깃털 날개 + 가운데 보석 (날개 강조)',
      '어두운 fallen 깃털 + 후광 + 곡선 글레이브',
      '황금 후광 + 깃털 + 가운데 룬 검',
      '청록색 추상 베일+깃털 (추상적)',
    ],
  },
  // ── batch 6: 일반 region weapon × 5 ──
  {
    slug: 'common_witty_lucky_dagger',
    tone: '위트',
    region: '일반',
    slot: 'weapon',
    recommend: 0,
    hint: '단검 + 측면 클로버 — 단순+명확한 위트',
    candidateNotes: [
      '단순 단검 + 측면에 작은 클로버 매달림',
      '단검 + grip에 클로버 + pommel에 클로버 (3 클로버)',
      '단검 + 갈색 grip + 행운 부적들 (말굽 등)',
      '단검 + 클로버 + 가죽 끈',
    ],
  },
  {
    slug: 'common_mournful_widow_sword',
    tone: '비애',
    region: '일반',
    slot: 'weapon',
    recommend: 1,
    hint: '검 + crossguard 늘어진 검은 베일 — 비애 명확',
    candidateNotes: [
      '단순 회색 검 + grip 단순 검은 천',
      '회색 검 + crossguard에 검은 베일 늘어진 천',
      '가시 검 + 늘어진 천 (화려)',
      '검 + 검은 술 매달림',
    ],
  },
  {
    slug: 'common_uncanny_grave_pick',
    tone: '기괴',
    region: '일반',
    slot: 'weapon',
    recommend: 1,
    hint: '곡괭이 + grip에 흰 손가락뼈 — 기괴 톤 명확',
    candidateNotes: [
      '갈색 곡괭이 + grip 끈',
      '어두운 곡괭이 + grip에 흰 손가락뼈',
      '갈색 곡괭이 + 갈대 끈 묶음',
      '갈색 곡괭이 + grip 끈',
    ],
  },
  {
    slug: 'common_mystic_quill_wand',
    tone: '수수께끼',
    region: '일반',
    slot: 'weapon',
    recommend: 0,
    hint: 'brass nib + 황금 두 깃털 + 안 룬 — 가장 mystic',
    candidateNotes: [
      'brass nib + 가운데 황금 두 깃털 + 안 룬',
      'nib + 가운데 푸른 보석 + 두 흰 깃털',
      'nib + 가운데 brass 룬 + 두 흰 깃털',
      'nib + 가운데 brass + 가시 깃털',
    ],
  },
  {
    slug: 'common_legendary_hero_greatsword',
    tone: '장엄',
    region: '일반',
    slot: 'weapon',
    recommend: 0,
    hint: '황금 날개 crossguard + 푸른 보석 — 영웅 검 최고',
    candidateNotes: [
      '황금 trim 검 + 가운데 푸른 보석 + 황금 날개 crossguard',
      '황금 검 + 푸른 보석 + 가시 detail',
      '검 + 황금 trim + 가운데 별',
      '검 + 가운데 푸른 보석 + 황금 mounting',
    ],
  },
  // ── batch 7: 영웅담 2종만 유지 (담백/일상 제외) ──
  {
    slug: 'orc_heroic_first_tusk_axe',
    tone: '영웅담',
    region: '오크 부락',
    slot: 'weapon',
    recommend: 1,
    hint: '도끼 + 송곳니 + 빨간 천 — 영웅담 톤 가장 명확',
    candidateNotes: [
      '어두운 도끼 + 큰 노란 송곳니',
      '검은 도끼 + 가운데 송곳니 박힘 + 빨간 천',
      '검은 도끼 + 부서진 도끼날 + 송곳니',
      '양날 도끼 + 가운데 송곳니 다발',
    ],
  },
  {
    slug: 'volcano_heroic_first_ember_hammer',
    tone: '영웅담',
    region: '서쪽 화산',
    slot: 'weapon',
    recommend: 0,
    hint: '큰 검은 망치 + 가운데 잉걸 — 영웅 망치 명확',
    candidateNotes: [
      '큰 검은 망치 + 가운데 큰 오렌지 잉걸',
      '양면 망치 + 양 옆에 잉걸 + 십자',
      '큰 망치 + 가운데 잉걸 + 가시 detail',
      '화려한 brass 망치 + 십자 + 잉걸',
    ],
  },
  // ── batch 8: 영웅담 1종 (담백/일상 4종 폐기) ──
  {
    slug: 'marsh_heroic_ferry_harpoon',
    tone: '영웅담',
    region: '늪지대',
    slot: 'weapon',
    recommend: 2,
    hint: '굵은 코일 + iron tip — 영웅 작살 무게감 최고',
    candidateNotes: [
      '어두운 작살 + 가시 + 코일 (mystic)',
      '갈색 작살 + 흰 코일 + iron tip',
      '회색 작살 + 굵은 코일 + iron tip',
      '회색 작살 + 흰 코일 (단순)',
    ],
  },
  // ── batch 9: 전설 2종 (정밀 3종 폐기) ──
  {
    slug: 'orc_legendary_ancestor_axe',
    tone: '전설',
    region: '오크 부락',
    slot: 'weapon',
    recommend: 1,
    hint: '양날 도끼 + 부족 글리프 + 두개골 — 전설 톤 강함',
    candidateNotes: [
      '갈색 도끼 + 큰 송곳니 + 글리프 두개골',
      '검은 양날 도끼 + 가운데 작은 두개골 + 부족 글리프',
      '어두운 양날 도끼 + 가운데 X (단순)',
      '가시 부족 도끼 + 두 송곳니 (위협적)',
    ],
  },
  {
    slug: 'volcano_legendary_dragonbone_sword',
    tone: '전설',
    region: '서쪽 화산',
    slot: 'weapon',
    recommend: 1,
    hint: '척추뼈 검 + 용암 균열 — 용뼈 전설 명확',
    candidateNotes: [
      '검은 검 + 빨간 균열 줄 + 가시 자루',
      '척추뼈로 만든 검 + 용암 균열',
      '검은 검 + 가운데 황금 균열 + 뼈 grip',
      '검은 검 + 빨간 균열 + 발톱 crossguard',
    ],
  },
  // ── batch 10: 화려 톤 시범 × 5 ──
  {
    slug: 'marsh_ornate_jewel_wand',
    tone: '화려',
    region: '늪지대',
    slot: 'weapon',
    recommend: 3,
    hint: '다양한 보석 + 황금 망사 — 가장 화려',
    candidateNotes: [
      '황금 wand + 큰 청록 보석 + 황금 잎 (단순 화려)',
      '황금 wand + 청록 큰 보석 + 다수 청록 + 황금 가지',
      '황금 wand + 잎 + 청록 보석 끝 (자연 느낌)',
      '황금 wand + 청록 보석 + 다양한 보석 + 황금 망사',
    ],
  },
  {
    slug: 'orc_ornate_gilded_chief_axe',
    tone: '화려',
    region: '오크 부락',
    slot: 'weapon',
    recommend: 3,
    hint: '양날 도끼 + 빨간 보석 다수 + 깃털 — 부족장 화려 톤 최고',
    candidateNotes: [
      '양날 도끼 + 황금 trim + 빨간 보석 + 깃털',
      '사람 얼굴 모양 도끼 + 빨간 보석 + 황금 (totem)',
      '양날 도끼 + 황금 trim + 가운데 빨간 보석',
      '양날 도끼 + 황금 trim + 빨간 보석 다수 + 깃털',
    ],
  },
  {
    slug: 'rune_ornate_jeweled_warhammer',
    tone: '화려',
    region: '고대 룬 산맥',
    slot: 'weapon',
    recommend: 0,
    hint: '큰 망치 + 황금 + 파란 보석 4개 + "MXR" 글자 — 가장 ornate',
    candidateNotes: [
      '큰 망치 + 황금 + 파란 보석 4개 + "MXR" 글자',
      '양면 망치 + 가운데 큰 파란 보석 + 황금 (수직 elegant)',
      '망치 + 황금 룬 패턴 (보석 적음)',
      '양면 망치 + 가운데 큰 파란 보석 + 황금 룬',
    ],
  },
  {
    slug: 'volcano_ornate_phoenix_blade',
    tone: '화려',
    region: '서쪽 화산',
    slot: 'weapon',
    recommend: 0,
    hint: '황금 검 + 빨간 룬 + phoenix wing crossguard + 빨간 보석 — 이상적 phoenix',
    candidateNotes: [
      '황금 검 + 빨간 룬 + phoenix wing crossguard + 빨간 보석',
      '빨간 화염 검 + 황금 crossguard',
      '황금 검 + wing crossguard + 빨간 보석 (단순 elegant)',
      '황금 검 + phoenix tail crossguard (특이)',
    ],
  },
  {
    slug: 'fallen_ornate_golden_glaive',
    tone: '화려',
    region: '타락천사',
    slot: 'weapon',
    recommend: 3,
    hint: 'wing 후광 + 다수 보석 + 가운데 큰 보석 — 가장 화려',
    candidateNotes: [
      '황금 곡선 글레이브 + wings + 보석 ring + 푸른 보석',
      '황금 글레이브 + 큰 wings + 가운데 푸른 보석 (mythical)',
      '황금 글레이브 + 작은 wings + 가운데 보석 + 가시',
      '황금 글레이브 + wing 후광 + 다수 보석 + 가운데 큰 보석',
    ],
  },
  // ── batch 11: 일반 region 새 톤 보충 + 추가 전설 ──
  {
    slug: 'common_heroic_knight_lance',
    tone: '영웅담',
    region: '일반',
    slot: 'weapon',
    recommend: 0,
    hint: '파란 깃발 lance — 클래식 기사 톤',
    candidateNotes: [
      '검은 lance + 파란 깃발',
      '어두운 lance + 적색 깃발 + 가시',
      '회색 lance + 청록 깃발 (sword like)',
      '갈색 lance + 황금 깃발 + 가시',
    ],
  },
  {
    slug: 'common_legendary_anointed_sword',
    tone: '전설',
    region: '일반',
    slot: 'weapon',
    recommend: 2,
    hint: '회색 검 + 황금 crossguard — anointed 분위기',
    candidateNotes: [
      '두 검 (한쪽 회색 + 한쪽 황금) — twin blade',
      '황금 brass 검 (단순 전설)',
      '회색 검 + 황금 crossguard (균형)',
      '곡선 검 + 황금 swept guard',
    ],
  },
  {
    slug: 'common_ornate_royal_scepter',
    tone: '화려',
    region: '일반',
    slot: 'weapon',
    recommend: 0,
    hint: '왕관 모양 + 다수 보석 + 진주 — royal 화려',
    candidateNotes: [
      '황금 왕관 모양 scepter + 보석 + 큰 진주',
      '황금 sun-burst + 가운데 진주 + 보석 다수',
      '두 용 wings + 가운데 진주',
      '큰 보석 박힌 scepter + 진주',
    ],
  },
  {
    slug: 'rune_legendary_first_writer_pen',
    tone: '전설',
    region: '고대 룬 산맥',
    slot: 'weapon',
    recommend: 2,
    hint: '청록 깃털 펜 + nib — 가장 펜 형태',
    candidateNotes: [
      '청록 깃털 펜 + 작은 ink (mystic)',
      '어두운 자루 + 두 깃털 + 룬 (trident-like)',
      '청록 깃털 펜 + nib (가장 펜 형태)',
      '어두운 자루 + 깃털 (펜 모양)',
    ],
  },
  {
    slug: 'fallen_legendary_archangel_flail',
    tone: '전설',
    region: '타락천사',
    slot: 'weapon',
    recommend: 0,
    hint: '가시 공 + 검은 깃털 + 체인 — fallen 모티프 명확',
    candidateNotes: [
      '회색 spiked ball + chain + 검은 깃털',
      '회색 spiked ball + chain + 작은 깃털',
      '회색 star + chain + 검은 깃털 (star ball, holy)',
      '회색 spiked ball + chain + 두 깃털',
    ],
  },
  // ── batch 12: weapon 마지막 5종 ──
  {
    slug: 'rune_heroic_guardian_warhammer',
    tone: '영웅담',
    region: '고대 룬 산맥',
    slot: 'weapon',
    recommend: 0,
    hint: '회색 stone 망치 + 양면 큰 룬 — 영웅 망치 명확',
    candidateNotes: [
      '회색 stone 망치 + 양면 큰 룬 + nail 자루',
      '흰 stone 망치 + 큰 황금 룬 (화려 쪽)',
      '흰 stone 망치 + 작은 룬 다수',
      '회색 stone 망치 + 작은 룬 + 가시 자루',
    ],
  },
  {
    slug: 'fallen_heroic_avenger_sword',
    tone: '영웅담',
    region: '타락천사',
    slot: 'weapon',
    recommend: 0,
    hint: '검 + 황금 wing + 푸른 보석 — 영웅 천사 검',
    candidateNotes: [
      '어두운 검 + 자루 황금 wing + 가운데 푸른 보석',
      '회색 검 + crossguard 흰 깃털',
      '회색 검 + crossguard 가운데 흰 깃털',
      '어두운 검 + crossguard 흰 깃털 + 가시',
    ],
  },
  {
    slug: 'orc_heroic_warband_axe',
    tone: '영웅담',
    region: '오크 부락',
    slot: 'weapon',
    recommend: 1,
    hint: '양날 도끼 + 자루 깃털 + 송곳니 + 끈 — 워밴드 톤 최고',
    candidateNotes: [
      '어두운 cleaver + 자루 두개골·끈 + 두 깃털',
      '큰 양날 도끼 + 자루 깃털 + 송곳니 + 끈',
      '어두운 곡선 도끼 + 자루 깃털 + 두개골',
      '어두운 도끼 + 자루 황금 메달 + 가시',
    ],
  },
  {
    slug: 'marsh_legendary_witch_queen_staff',
    tone: '전설',
    region: '늪지대',
    slot: 'weapon',
    recommend: 1,
    hint: '어두운 staff + 청록 orb + root 곡선 — 마녀 queen 톤',
    candidateNotes: [
      '어두운 staff + 큰 청록 orb (식물 root)',
      '어두운 staff + 큰 청록 orb + 거대 root 곡선',
      '어두운 staff + 작은 청록 orb + 뼈 곡선',
      '어두운 staff + 청록 orb + root 곡선 (작음)',
    ],
  },
  {
    slug: 'volcano_uncanny_skull_furnace_mace',
    tone: '기괴',
    region: '서쪽 화산',
    slot: 'weapon',
    recommend: 0,
    hint: '검은 두개골 + 안쪽 오렌지 잉걸 — 기괴 톤 명확',
    candidateNotes: [
      '검은 두개골 + 안쪽 오렌지 잉걸',
      '검은 두개골 + 균열 잉걸 + 자루 오렌지',
      '검은 두개골 (horns) + 잉걸 흐름',
      '검은 두개골 + 체인 + 황금 자루 (화려 쪽)',
    ],
  },
  // ── batch 13: armor 시작 5종 (아름다운 시범) ──
  {
    slug: 'marsh_beautiful_lily_dress',
    tone: '아름다운',
    region: '늪지대',
    slot: 'armor',
    recommend: 0,
    hint: '긴 흰 dress + 가운데 청록 보석 — 아름다운 톤 dress 명확',
    candidateNotes: [
      '긴 흰 dress + 가운데 청록 보석',
      'wand 형태 (armor 아님)',
      '흉갑 + 백합 두 송이 (armor지만 dress 아님)',
      'wand/staff 형태 (armor 아님)',
    ],
  },
  {
    slug: 'orc_witty_warpaint_vest',
    tone: '위트',
    region: '오크 부락',
    slot: 'armor',
    recommend: 3,
    hint: '갈색 vest + 청록·빨강 번개 워페인트 — 위트 강함',
    candidateNotes: [
      '갈색 vest + 빨간 X 워페인트 + 뼈',
      '청록 vest + 청록·황금 워페인트',
      '갈색 vest + 빨간 손바닥 + 송곳니',
      '갈색 vest + 청록·빨강 번개 워페인트',
    ],
  },
  {
    slug: 'rune_uncanny_living_stone_plate',
    tone: '기괴',
    region: '고대 룬 산맥',
    slot: 'armor',
    recommend: 1,
    hint: '어두운 stone breastplate + 가운데 큰 눈 룬 — 가장 살아있는 톤',
    candidateNotes: [
      '어두운 stone + 가운데 얼굴 룬',
      '어두운 stone + 가운데 큰 눈 룬',
      '어두운 stone + 벌어진 입 + 두 눈 (드라마)',
      '회색 stone + 큰 곡선 (단순)',
    ],
  },
  {
    slug: 'volcano_mystic_ashen_cloak',
    tone: '수수께끼',
    region: '서쪽 화산',
    slot: 'armor',
    recommend: 0,
    hint: '어두운 hood cloak + ember 자수 — 가장 cloak 형태',
    candidateNotes: [
      '어두운 hood cloak + 가운데 ember + 잉걸 자수',
      '대장간 도구들 (armor 아님)',
      '어두운 gauntlet (armor지만 cloak 아님)',
      '둥근 ember 부적 (armor 아님)',
    ],
  },
  {
    slug: 'fallen_grand_seraph_breastplate',
    tone: '장엄',
    region: '타락천사',
    slot: 'armor',
    recommend: 0,
    hint: '흰 breastplate + 황금 후광 + 흰 날개 — 세라프 장엄',
    candidateNotes: [
      '흰 breastplate + 황금 후광 + 양옆 흰 날개',
      '검은 breastplate + 황금 후광 + 검은 날개 (fallen)',
      '황금 brass breastplate + 깃털·후광 (화려)',
      '흰 breastplate + 황금 후광 + 흰 날개 (균형)',
    ],
  },
];

export default function BatchReviewPage() {
  return (
    <main className="mx-auto w-full max-w-[390px] px-3 py-4 text-neutral-900 dark:text-neutral-100">
      <header className="mb-4">
        <h1 className="text-lg font-bold">Batch 1 리뷰</h1>
        <p className="text-[11px] text-neutral-500">
          늪지대 weapon × 5 톤 · 각 4 candidates · ⭐ = 추천 · 사용자 선택 후 promote + lore 작성
        </p>
      </header>

      {ITEMS.map((it) => (
        <section key={it.slug} className="mb-6">
          <h2 className="sticky top-0 z-10 -mx-3 mb-2 bg-white/95 px-3 py-1 text-sm font-semibold backdrop-blur dark:bg-neutral-950/95">
            {it.slug}{' '}
            <span className="text-neutral-500 text-xs">
              ({it.region} · {it.tone} · {it.slot})
            </span>
          </h2>
          <p className="mb-2 text-[10px] text-amber-700 dark:text-amber-300">⭐ 추천: c{it.recommend} — {it.hint}</p>
          <ul className="grid grid-cols-2 gap-2">
            {[0, 1, 2, 3].map((i) => {
              const isReco = i === it.recommend;
              return (
                <li
                  key={i}
                  className={`rounded-md border p-2 ${
                    isReco
                      ? 'border-amber-400 bg-amber-50 ring-2 ring-amber-400/50 dark:bg-amber-950/30'
                      : 'border-neutral-200 bg-neutral-50/40 dark:border-neutral-800 dark:bg-neutral-900/30'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="font-mono text-neutral-500">c{i}</span>
                    {isReco && <span className="text-amber-700 dark:text-amber-300">⭐</span>}
                  </div>
                  <div className="my-1 flex justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/batch-review/${it.slug}/candidate_${i}.png`}
                      alt={`${it.slug} c${i}`}
                      width={128}
                      height={128}
                      className="block h-32 w-32 bg-neutral-100 dark:bg-neutral-800"
                      style={{ imageRendering: 'pixelated' }}
                    />
                  </div>
                  <p className="text-[10px] leading-snug text-neutral-700 dark:text-neutral-300">
                    {it.candidateNotes[i]}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <footer className="mt-8 border-t border-neutral-200 pt-3 text-center text-[10px] text-neutral-400 dark:border-neutral-800">
        리뷰 종료 후 <code>app/batch-review/</code> + <code>public/batch-review/</code> 삭제
      </footer>
    </main>
  );
}
