// PROFILE v3 — 외형 랜덤 변수(종족/헤어/표정). 성별별 풀.
// 매력 기조: 여=예쁨/귀여움 미소녀, 남=멋짐 미소년. 머리 부속(귀·뿔)은 항상 작게(머리 작게 유지).
// 같은 장비라도 매 생성 랜덤 부여로 변주(다양성은 장비 디테일이 아니라 이 변수 + 모델 자유에서 옴).
import 'server-only';

import type { ProfileGender } from './refs';

export interface Appearance {
  /** 종족 묘사절(귀·뿔은 small/neat로 명시). */
  race: string;
  /** "{color} {style}" 머리 묘사. */
  hair: string;
  /** 눈(홍채) 색 — 캐릭터별 랜덤 축(같은 머리색이라도 다른 인물로 읽히게, 라이브 피드백). */
  eyeColor: string;
  /** 표정 묘사. */
  expression: string;
  /** 팔/스탠스 포즈(무기-안전). 무기 든 손은 유지 — compose가 안전절과 함께 사용. */
  pose: string;
}

// 홍채 색 풀 — 남녀 공용. 장비 색과 무관하게 얼굴 정체성을 만드는 축.
const EYE_COLORS = [
  'amber',
  'emerald-green',
  'sapphire-blue',
  'violet',
  'crimson',
  'teal',
  'golden',
  'steel-gray',
];

// 포즈 가중치 풀 — 정적 3종(차분·기본, 높게) + 역동 2종(생동감, 중간) + 히든 1종(희소·특별).
// 모두 정면 유지(측면/3-4 틀기 없음). 전신·양발·무기그립은 compose 안전절이 보장. pickWeighted 추출.
const POSES = [
  // 정적 — 차분한 정면 스탠스
  { desc: 'standing tall and composed, the weapon held quietly at one side', weight: 22 },
  { desc: 'standing with the weight shifted onto one leg in a relaxed contrapposto, the weapon resting at one side', weight: 22 },
  { desc: 'holding the weapon upright in front with both hands resting on it, in a calm and dignified stance', weight: 22 },
  // 정적(추가) — 다른 결의 차분한 정면 포즈(컨셉 친화, 액션감 X)
  { desc: 'holding the weapon horizontally in front with both hands, in a calm and composed at-rest stance', weight: 14 },
  { desc: 'standing poised with one hand resting elegantly on the hip and the weapon held calmly at the other side', weight: 14 },
  // 히든 — 희소·특별(무기를 머리 위로 들지 않음 — 머리 위 공간 확보)
  { desc: 'resting the weapon back on one shoulder, head held high with a proud charismatic air, the free hand extended forward in a bold inviting gesture toward the viewer', weight: 6 },
] as const;

// 서버 RNG (CLAUDE §3.1).
const rng = (n: number): number => crypto.getRandomValues(new Uint32Array(1))[0]! % n;
const pick = <T>(a: readonly T[]): T => a[rng(a.length)]!;

/** 가중치 추출(종족·표정 공용) — weight 합 기준 비례 random. */
type Weighted = { desc: string; weight: number };
function pickWeighted(items: readonly Weighted[]): string {
  const total = items.reduce((s, it) => s + it.weight, 0);
  let r = rng(total);
  for (const it of items) {
    if (r < it.weight) return it.desc;
    r -= it.weight;
  }
  return items[items.length - 1]!.desc;
}

// 종족 가중치(2026-06-22): 인간 50% 주력 + 판타지 5종 각 10%. 머리 부속(귀·뿔·날개)은 항상 작게.
// 네코미미는 "귀만"(꼬리 미언급) + small neat.
const FEMALE = {
  races: [
    { desc: 'a human girl', weight: 50 },
    { desc: 'an elf girl with slender pointed ears', weight: 10 },
    { desc: 'an elegant beautiful cat-girl with small neat cat ears', weight: 10 },
    { desc: 'a fairy girl with small translucent wings', weight: 10 },
    { desc: 'a beautiful demon girl with small neat horns', weight: 10 },
    { desc: 'a beautiful dragon-girl with small neat horns and subtle scale accents', weight: 10 },
  ],
  hairStyles: ['long straight', 'long wavy', 'twin-tails', 'a high ponytail', 'a hime-cut'],
  hairColors: ['platinum-blonde', 'silver', 'pink', 'lavender', 'sky-blue', 'black', 'auburn', 'white', 'mint-green'],
  // 표정 가중치 — 호감·보편 표정 높게, 윙크는 희소 스파이스.
  expressions: [
    { desc: 'a soft gentle smile', weight: 35 },
    { desc: 'a serene elegant smile', weight: 25 },
    { desc: 'a bright cheerful smile', weight: 20 },
    { desc: 'a slightly confident look', weight: 12 },
    { desc: 'a playful wink', weight: 8 },
  ],
} as const;

// 남성 헤어: undercut·slicked-back·긴 포니테일 제외(여성스러움/원치 않는 룩 방지).
const MALE = {
  races: [
    { desc: 'a handsome human youth', weight: 50 },
    { desc: 'a noble elf youth with slender pointed ears', weight: 10 },
    { desc: 'a dragonkin youth with small neat horns', weight: 10 },
    { desc: 'a youth with small neat demon horns', weight: 10 },
    { desc: 'a beast-kin youth with small neat wolf ears', weight: 10 },
    { desc: 'a handsome vampire youth with pale skin, small fangs and crimson eyes', weight: 10 },
  ],
  hairStyles: ['short tousled', 'medium swept-back', 'shaggy bangs'],
  hairColors: ['black', 'silver', 'white', 'dark-blue', 'ash-brown', 'crimson', 'platinum', 'golden-blond', 'chestnut-brown', 'deep-green', 'indigo'],
  // 표정 가중치 — 멋짐·쿨 기조 높게, 스머크는 희소 스파이스.
  expressions: [
    { desc: 'a confident gaze', weight: 30 },
    { desc: 'a cool calm look', weight: 28 },
    { desc: 'a faint smile', weight: 22 },
    { desc: 'a gentle warm smile', weight: 12 },
    { desc: 'a slight smirk', weight: 8 },
  ],
} as const;

export function pickRandomAppearance(gender: ProfileGender): Appearance {
  const p = gender === 'male' ? MALE : FEMALE;
  return {
    race: pickWeighted(p.races),
    hair: `${pick(p.hairColors)} ${pick(p.hairStyles)}`,
    eyeColor: pick(EYE_COLORS),
    expression: pickWeighted(p.expressions),
    pose: pickWeighted(POSES),
  };
}
