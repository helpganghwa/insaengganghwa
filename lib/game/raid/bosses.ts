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
 * 카카오 공유용 title/body 후보 — 보스 컨셉은 살리되 표현은 짧고 담백하게
 * (2026-06-01 사용자 결정). 이모지 금지. title은 카드 헤더에 짧게(8~16자),
 * body는 1줄(8~20자). pickRaidShareCopy()로 매 공유마다 랜덤 1개 노출.
 */
export type RaidShareCopy = { title: string; body: string };

export const RAID_SHARE_COPIES: Record<RaidBoss, RaidShareCopy[]> = {
  slime_king: [
    { title: '슬라임킹 레이드', body: '같이 잡으러 가요.' },
    { title: '늪의 슬라임킹 토벌', body: '도움이 필요해요.' },
    { title: '끈질긴 점액의 왕', body: '함께 베면 빠르게 끝나요.' },
    { title: '슬라임킹과의 싸움', body: '같이 가실래요?' },
  ],
  orc_chief: [
    { title: '오크 족장 레이드', body: '같이 잡으러 가요.' },
    { title: '오크 족장 토벌', body: '함께 막아주세요.' },
    { title: '변경의 오크 족장', body: '같이 가실래요?' },
    { title: '오크 족장 처치', body: '도움이 필요해요.' },
  ],
  stone_golem: [
    { title: '돌 골렘 레이드', body: '같이 잡으러 가요.' },
    { title: '돌 골렘 토벌', body: '같이 가실래요?' },
    { title: '신전의 돌 골렘', body: '함께 무너뜨려요.' },
    { title: '거대 골렘과의 싸움', body: '도움이 필요해요.' },
  ],
  dragon_west: [
    { title: '서녘의 용 레이드', body: '같이 잡으러 가요.' },
    { title: '서녘의 용 토벌', body: '같이 가실래요?' },
    { title: '서쪽 화산의 용', body: '함께 끌어내려요.' },
    { title: '용과의 싸움', body: '도움이 필요해요.' },
  ],
  fallen_angel: [
    { title: '타락천사 레이드', body: '같이 잡으러 가요.' },
    { title: '타락천사 토벌', body: '같이 가실래요?' },
    { title: '추락한 천사', body: '함께 멈춰주세요.' },
    { title: '심판자와의 싸움', body: '도움이 필요해요.' },
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
