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
      '늪의 모든 슬라임이 하나로 뭉쳐 왕이 되었다. 베면 갈라지고 갈라지면 다시 삼킨다. 작은 모험가들이 "고작 슬라임"이라 비웃다 늪 바닥에 가라앉은 이야기는 술집마다 한 자루씩 쌓여 있다. 끈질김 그 자체가 왕관이다.',
  },
  orc_chief: {
    name: '오크족장',
    emoji: '🪓',
    story:
      '백 번의 약탈에서 단 한 번도 등을 보이지 않은 오크 족장. 부족의 도끼 자국이 그의 갑옷에 훈장처럼 박혀 있다. 그가 전쟁북을 울리면 변경의 마을은 하룻밤 새 잿더미가 되었고, 살아남은 자들이 모험가를 부른다.',
  },
  stone_golem: {
    name: '돌골렘',
    emoji: '🗿',
    story:
      '잊힌 신전을 지키라 빚어진 돌의 거인. 명령을 내린 사제는 천 년 전 흙으로 돌아갔지만 골렘은 아직도 빈 제단 앞에 서 있다. 부서진 팔로도 침입자를 짓이긴다 — 사명을 잊지 못한 돌은 결코 멈추지 않는다.',
  },
  dragon_west: {
    name: '드래곤',
    emoji: '🐉',
    story:
      '서쪽 화산 위를 도는 비늘의 폭군. 그가 날개를 펼치면 정오에도 골짜기에 밤이 내린다. 한 왕국이 보물을 바쳐 잠재우려 했으나, 용은 보물과 사신을 함께 삼켰다. 불길이 닿지 않은 땅을 사람들은 "용의 자비"라 부른다.',
  },
  fallen_angel: {
    name: '타락천사',
    emoji: '😇',
    story:
      '하늘에서 가장 빛나던 날개가 가장 깊은 어둠으로 떨어졌다. 구원하려던 손을 거두고 심판의 검을 든 그 앞에서, 기도는 메아리조차 없다. 부러진 후광이 아직도 희미하게 타오른다 — 가장 높았던 자의 가장 긴 추락.',
  },
};

export const RAID_BOSS_CODES = Object.keys(RAID_BOSSES) as RaidBoss[];

/**
 * 카카오 공유용 title/body 후보 — 각 보스의 컨셉/스토리에 맞춘 판타지 로어 톤.
 * 이모지 금지(2026-06-01). title은 카드 헤더에 짧게(12~24자), body는 1줄(28~50자).
 * pickRaidShareCopy()로 매 공유마다 랜덤 1개 노출.
 */
export type RaidShareCopy = { title: string; body: string };

export const RAID_SHARE_COPIES: Record<RaidBoss, RaidShareCopy[]> = {
  slime_king: [
    {
      title: '늪 깊은 곳, 왕이 깨어났다',
      body: '끈질긴 점액을 함께 부수러 가자.',
    },
    {
      title: '고작 슬라임이라 비웃었던 자들',
      body: '그 말은 늪 바닥에 잠들었다. 합세하라.',
    },
    {
      title: '한 자루씩 쌓이는 늪의 이야기',
      body: '다음 장은 당신이 새긴다.',
    },
    {
      title: '늪의 왕관은 끈질김이다',
      body: '그 끈을 함께 끊으러 가자.',
    },
  ],
  orc_chief: [
    {
      title: '전쟁북이 변경을 흔든다',
      body: '잿더미가 되기 전에 함께 막아서자.',
    },
    {
      title: '백 번을 약탈하고 등을 보이지 않았다',
      body: '이번엔 우리가 그 앞을 막는다.',
    },
    {
      title: '도끼 자국이 훈장처럼 박혔다',
      body: '그 갑옷에 새 자국을 새기러 가자.',
    },
    {
      title: '부족의 함성이 골짜기를 메웠다',
      body: '같은 함성으로 갚아 주자.',
    },
  ],
  stone_golem: [
    {
      title: '잊힌 신전의 파수꾼',
      body: '천 년의 사명을 함께 끝내주러 가자.',
    },
    {
      title: '사제는 흙이 되었고 명령만 남았다',
      body: '그 명령을 함께 거둬 주자.',
    },
    {
      title: '부서진 팔로도 짓이긴다',
      body: '혼자선 무리, 함께라면 다르다.',
    },
    {
      title: '빈 제단 앞에 선 거인',
      body: '그 자세를 풀어 주러 가자.',
    },
  ],
  dragon_west: [
    {
      title: '정오에도 골짜기에 밤이 내린다',
      body: '그 날개가 펴지기 전에 합세하라.',
    },
    {
      title: '보물과 사신을 함께 삼킨 용',
      body: '이제 우리 차례다.',
    },
    {
      title: '사람들이 용의 자비라 부르는 땅',
      body: '그 자비의 출처를 끊으러 가자.',
    },
    {
      title: '서녘 화산의 비늘 폭군',
      body: '함께 그 비늘을 떼어내자.',
    },
  ],
  fallen_angel: [
    {
      title: '가장 높았던 자의 가장 긴 추락',
      body: '그 끝을 우리가 함께 본다.',
    },
    {
      title: '기도가 닿지 않는 심판자 앞',
      body: '함께라면 그 검을 멈출 수 있다.',
    },
    {
      title: '부러진 후광이 희미하게 타오른다',
      body: '그 빛을 같이 꺼 주자.',
    },
    {
      title: '구원하려던 손이 검이 되었다',
      body: '그 손을 우리 손으로 막자.',
    },
  ],
};

/**
 * 보스별 공유 copy 1개 랜덤 선택. seed(예: raid id 해시)를 넘기면 결정론 선택 —
 * 동일 raid의 공유 URL에 동일 copy가 일관되게 노출되도록.
 */
export function pickRaidShareCopy(code: RaidBoss, seed?: number): RaidShareCopy {
  const list = RAID_SHARE_COPIES[code];
  if (list.length === 0) return { title: '레이드 초대', body: '함께 보스를 토벌하러 가자.' };
  const i =
    seed != null ? Math.abs(seed) % list.length : Math.floor(Math.random() * list.length);
  return list[i]!;
}
