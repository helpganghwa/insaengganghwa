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
  /** 표정 묘사. */
  expression: string;
}

// 서버 RNG (CLAUDE §3.1).
const rng = (n: number): number => crypto.getRandomValues(new Uint32Array(1))[0]! % n;
const pick = <T>(a: readonly T[]): T => a[rng(a.length)]!;

// 네코미미는 "귀만"(꼬리 미언급) + small neat. 부속 작게.
const FEMALE = {
  races: [
    'a human girl',
    'an elf girl with slender pointed ears',
    'an elegant beautiful cat-girl with small neat cat ears',
    'a fairy girl with small translucent wings',
    'a dark-elf girl with ashen-grey skin and slender pointed ears',
  ],
  hairStyles: ['long straight', 'long wavy', 'twin-tails', 'a high ponytail', 'a hime-cut'],
  hairColors: ['platinum-blonde', 'silver', 'pink', 'lavender', 'sky-blue', 'black', 'auburn', 'white', 'mint-green'],
  expressions: ['a soft gentle smile', 'a serene smile', 'a slightly confident look', 'a playful wink'],
} as const;

// 남성 헤어: undercut·slicked-back·긴 포니테일 제외(여성스러움/원치 않는 룩 방지).
const MALE = {
  races: [
    'a handsome human youth',
    'a noble elf youth with slender pointed ears',
    'a dark-elf youth with ashen-grey skin and slender pointed ears',
    'a dragonkin youth with small neat horns',
    'a youth with small neat demon horns',
  ],
  hairStyles: ['short tousled', 'medium swept-back', 'shaggy bangs'],
  hairColors: ['black', 'silver', 'white', 'dark-blue', 'ash-brown', 'crimson', 'platinum'],
  expressions: ['a confident gaze', 'a cool calm look', 'a faint smile'],
} as const;

export function pickRandomAppearance(gender: ProfileGender): Appearance {
  const p = gender === 'male' ? MALE : FEMALE;
  return {
    race: pick(p.races),
    hair: `${pick(p.hairColors)} ${pick(p.hairStyles)}`,
    expression: pick(p.expressions),
  };
}
