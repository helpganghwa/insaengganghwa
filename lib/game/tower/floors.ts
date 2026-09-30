/**
 * 무한의 탑 층 데이터 — 몬스터 이름·장면·서술·전투 문장(docs/TOWER.md §8 첫 구현).
 * 클라이언트에서도 쓰는 순수 모듈(서버 전용 값 없음). 그림은 시안용 4종을 돌려 쓰고 이름만 층마다 다르다.
 */
import { josa } from 'josa';

import type { TowerBattleEvent, TowerTurn } from './battle';

export type MonsterKind = 'beast' | 'undead' | 'mage' | 'guardian';

/** 몬스터 특성 표시(무대 위 이름 아래). 수문장 스킬이 붙으면 여기에 더한다. */
export const TOWER_KIND_KO: Record<MonsterKind, string> = { beast: '야수', undead: '망자', mage: '술사', guardian: '수문장' };

/** 구간마다 1~9층 + 특별층(10번째) 이름. kind는 그림(몬스터 스프라이트)과 서술 결을 정한다. */
const SECTIONS: { theme: string; mons: [string, MonsterKind][] }[] = [
  { theme: '잿빛 회랑', mons: [['잿빛 늑대', 'beast'], ['녹슨 해골병', 'undead'], ['떠돌이 주술사', 'mage'], ['굶주린 늑대 무리', 'beast'], ['무덤을 지키는 해골', 'undead'], ['견습 마법사', 'mage'], ['은빛 갈기 늑대', 'beast'], ['해골 창병', 'undead'], ['촛불 마녀', 'mage'], ['회랑의 수문장', 'guardian']] },
  { theme: '푸른 수정실', mons: [['수정 늑대', 'beast'], ['수정에 갇힌 기사', 'undead'], ['서리 점술사', 'mage'], ['푸른 송곳니 무리', 'beast'], ['얼어붙은 파수병', 'undead'], ['수정 주술사', 'mage'], ['달빛 늑대', 'beast'], ['빙결 해골 궁수', 'undead'], ['수정의 대마법사', 'mage'], ['수정 수문장', 'guardian']] },
  { theme: '타오르는 대장간', mons: [['들불 늑대', 'beast'], ['재가 된 병사', 'undead'], ['불씨 술사', 'mage'], ['화염 갈기 무리', 'beast'], ['타버린 창병', 'undead'], ['잿불 마녀', 'mage'], ['용암 늑대', 'beast'], ['숯검정 해골', 'undead'], ['화염의 대주술사', 'mage'], ['불꽃 수문장', 'guardian']] },
  { theme: '안개 낀 수렁', mons: [['안개 늑대', 'beast'], ['늪의 망자', 'undead'], ['독초 주술사', 'mage'], ['안개 속 무리', 'beast'], ['이끼 낀 해골', 'undead'], ['늪지 마녀', 'mage'], ['그림자 늑대', 'beast'], ['수렁의 창병', 'undead'], ['안개의 대마녀', 'mage'], ['수렁 수문장', 'guardian']] },
  { theme: '폭풍의 테라스', mons: [['폭풍 늑대', 'beast'], ['번개 맞은 기사', 'undead'], ['뇌운 술사', 'mage'], ['천둥 갈기 무리', 'beast'], ['폭풍 해골병', 'undead'], ['벼락 마녀', 'mage'], ['구름 늑대왕', 'beast'], ['천둥 창병', 'undead'], ['폭풍의 현자', 'mage'], ['폭풍 수문장', 'guardian']] },
  { theme: '별빛 관측소', mons: [['별빛 늑대', 'beast'], ['별을 잃은 기사', 'undead'], ['성좌 점술사', 'mage'], ['유성 무리', 'beast'], ['별가루 해골', 'undead'], ['혜성 늑대', 'beast'], ['어둠 마법사', 'mage'], ['은하 창병', 'undead'], ['성운의 대마녀', 'mage'], ['수문장 골렘', 'guardian']] },
  { theme: '황금 왕궁', mons: [['황금 늑대', 'beast'], ['왕궁 근위 해골', 'undead'], ['궁정 마술사', 'mage'], ['금빛 갈기 무리', 'beast'], ['옥좌의 망자', 'undead'], ['연금술사', 'mage'], ['사자 갈기 늑대', 'beast'], ['황금 창병', 'undead'], ['대연금술사', 'mage'], ['황금 수문장', 'guardian']] },
  { theme: '가라앉은 신전', mons: [['심연 늑대', 'beast'], ['심해의 망자', 'undead'], ['파도 주술사', 'mage'], ['해일 무리', 'beast'], ['산호 해골', 'undead'], ['조수 마녀', 'mage'], ['바다 늑대왕', 'beast'], ['심연 창병', 'undead'], ['심연의 예언자', 'mage'], ['심연 수문장', 'guardian']] },
  { theme: '멈춘 시계탑', mons: [['태초의 늑대', 'beast'], ['잊힌 왕의 기사', 'undead'], ['시간 술사', 'mage'], ['영겁의 무리', 'beast'], ['먼지가 된 해골', 'undead'], ['시계탑 마녀', 'mage'], ['달을 삼킨 늑대', 'beast'], ['영원의 창병', 'undead'], ['시간의 대현자', 'mage'], ['영겁의 수문장', 'guardian']] },
  { theme: '구름 위 첨탑', mons: [['하늘 늑대', 'beast'], ['탑의 첫 번째 기사', 'undead'], ['빛의 주술사', 'mage'], ['구름 위 무리', 'beast'], ['빛바랜 성기사', 'undead'], ['새벽 마녀', 'mage'], ['천공의 늑대왕', 'beast'], ['탑을 지킨 창병', 'undead'], ['탑의 대현자', 'mage'], ['무한의 수문장', 'guardian']] },
];

const SPRITE: Record<MonsterKind, string> = { beast: 'wolves', undead: 'skeleton', mage: 'sorcerer', guardian: 'golem' };

export type TowerFloorInfo = {
  floor: number;
  name: string;
  kind: MonsterKind;
  /** 구간 이름(장면 제목 줄). */
  theme: string;
  /** /sprites/tower/mon/<sprite>.png */
  sprite: string;
  /** /sprites/tower/scene/<scene>.png — 특별층은 왕좌, 그 밖은 구간마다 번갈아. */
  scene: string;
  line: string;
};

const LINES: Record<MonsterKind, string[]> = {
  beast: ['낮은 으르렁거림이 계단 아래까지 울린다.', '번뜩이는 눈이 어둠 속에서 하나둘 늘어난다.', '발톱이 돌바닥을 긁는 소리가 가까워진다.'],
  undead: ['녹슨 갑옷이 삐걱이며 몸을 일으킨다.', '텅 빈 눈구멍이 천천히 이쪽을 향한다.', '뼈마디가 부딪치는 소리가 복도를 채운다.'],
  mage: ['지팡이 끝에 푸른 불꽃이 피어오른다.', '낮은 주문이 벽을 타고 흘러내린다.', '허공에 빛나는 문양이 하나둘 떠오른다.'],
  guardian: ['거대한 문 앞에서 수문장이 천천히 눈을 뜬다.', '바닥이 울리며 수문장이 한 걸음 내딛는다.'],
};

export function towerFloorInfo(floor: number): TowerFloorInfo {
  const s = SECTIONS[Math.min(SECTIONS.length - 1, Math.floor((floor - 1) / 10))]!;
  const [name, kind] = s.mons[(floor - 1) % 10]!;
  const lines = LINES[kind];
  const section = Math.floor((floor - 1) / 10);
  return {
    floor,
    name,
    kind,
    theme: s.theme,
    sprite: SPRITE[kind],
    scene: kind === 'guardian' ? 'throne' : section % 2 === 0 ? 'hall' : 'crystal',
    line: lines[floor % lines.length]!,
  };
}

/** 턴 한 줄 서술 — 재생 화면·실패 팝업 "결정적인 순간". 이름 뒤 조사는 josa로. */
export function towerTurnLine(t: TowerTurn, monName: string): string {
  const ev: TowerBattleEvent | null = t.event;
  if (t.actor === 'me') {
    if (ev === 'miss') return '휘두른 칼끝이 허공을 가른다.';
    if (ev === 'critical') return `${monName}의 빈틈을 정확히 꿰뚫었다.`;
    if (ev === 'resonance') return '아바타와 장비가 함께 울리며 한 번 더 몰아친다.';
    if (ev === 'counter') return '막아 낸 틈을 타 되받아쳤다.';
    if (ev === 'first_strike') return '먼저 거리를 좁혀 첫 일격을 넣었다.';
    return josa(`${monName}#{을} 몰아붙였다.`);
  }
  if (ev === 'miss') return `${monName}의 공격이 빗나갔다.`;
  if (ev === 'first_strike') return josa(`${monName}#{이} 먼저 달려든다.`);
  if (ev === 'enrage') return josa(`궁지에 몰린 ${monName}#{이} 광폭해졌다.`);
  if (ev === 'revive') return '쓰러지기 직전, 다시 일어섰다.';
  return `${monName}의 공격을 받았다.`;
}

/** 전투 기록의 결말 한 줄(B2 — 결과 팝업 대신 기록 끝에 붙는다). 이름 뒤 조사는 josa로. */
export function towerResultLine(win: boolean, monName: string, turns: number): string {
  return win ? josa(`${turns}턴 만에 ${monName}#{이} 쓰러졌다.`) : josa(`${monName}#{을} 넘지 못하고 물러났다.`);
}

/** 변수 태그 라벨·색(재생 화면). */
export const TOWER_EVENT_TAG: Record<TowerBattleEvent, { label: string; cls: string }> = {
  first_strike: { label: '선제', cls: 'bg-orange-900 text-orange-200' },
  critical: { label: '급소', cls: 'bg-amber-900 text-amber-200' },
  miss: { label: '빗나감', cls: 'bg-zinc-800 text-zinc-400' },
  counter: { label: '반격', cls: 'bg-purple-950 text-purple-200' },
  enrage: { label: '광폭화', cls: 'bg-red-900 text-red-200' },
  resonance: { label: '공명', cls: 'bg-sky-950 text-sky-200' },
  revive: { label: '기사회생', cls: 'bg-emerald-950 text-emerald-200' },
};
