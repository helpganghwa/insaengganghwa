/**
 * 레이드 보스 5종 — GDD §3.5. 난이도 동일, 스토리/이미지만 차이.
 * 스프라이트는 Pixellab 후속(현재 이모지 placeholder).
 */
export type RaidBoss =
  | 'slime_king'
  | 'orc_chief'
  | 'stone_golem'
  | 'dragon_west'
  | 'fallen_angel';

export const RAID_BOSSES: Record<
  RaidBoss,
  { name: string; emoji: string; story: string }
> = {
  slime_king: {
    name: '슬라임킹',
    emoji: '🟢',
    story:
      '늪 깊은 곳, 천 년을 삼켜 비대해진 점액의 군주가 깨어났다. 무엇이든 녹여 제 몸으로 만드는 그것 앞에 마을 우물이 마르기 시작한다. 끈질긴 점액을 끝없이 두들겨라.',
  },
  orc_chief: {
    name: '오크족장',
    emoji: '🪓',
    story:
      '부러진 어금니와 수십 개의 전리품 두개골을 단 거구의 족장. 그의 포효 한 번에 변경 요새가 무너졌다. 전열을 갖춘 부족이 당도하기 전, 족장을 쓰러뜨려야 한다.',
  },
  stone_golem: {
    name: '돌골렘',
    emoji: '🗿',
    story:
      '고대 수호 룬이 폭주해 스스로 움직이는 산. 표면의 균열마다 푸른 마력이 새어 나온다. 부숴도 다시 뭉치는 바위 몸을 한계까지 깎아내라.',
  },
  dragon_west: {
    name: '드래곤',
    emoji: '🐉',
    story:
      '서쪽 화산에서 잿빛 날개를 펼친 고룡. 그 숨결은 강을 끓이고 하늘을 태운다. 비늘 한 장이 방패만 한 그 앞에서, 인간의 무기가 통할지 시험할 시간이다.',
  },
  fallen_angel: {
    name: '타락천사',
    emoji: '😇',
    story:
      '빛을 등진 채 추락한 옛 천상의 전사. 깨진 후광 아래 검은 깃털이 흩날린다. 신성과 저주가 뒤섞인 그 검을 멈추지 않으면, 구원은 오지 않는다.',
  },
};

export const RAID_BOSS_CODES = Object.keys(RAID_BOSSES) as RaidBoss[];
