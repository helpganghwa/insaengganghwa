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

/**
 * 포즈 가중치 풀 — 정적 3종(차분·기본, 높게) + 역동 2종(생동감, 중간) + 히든 1종(희소·특별).
 * 모두 정면 유지(측면/3-4 틀기 없음). 전신·양발·무기그립은 compose 안전절이 보장. pickWeighted 추출.
 *
 * `skip`(2026-08-06) — 무기 종류와 상충하는 포즈를 뺀다. 포즈가 무기와 무관하게 뽑혀
 * 석궁을 세워 들거나(→활 실루엣) 쌍검을 한 자루처럼 짚는(→쌍무기 소실) 프롬프트가 나왔다.
 *   pair   = 양손에 하나씩 드는 쌍무기 — 한 손이 비는 포즈·한 자루 전제 포즈 제외
 *   ranged = 활·석궁·총 — 세로로 세우거나 어깨에 걸치는 근접무기 포즈 제외
 */
const POSES = [
  // 정적 — 차분한 정면 스탠스
  { desc: 'standing tall and composed, the weapon held quietly at one side', weight: 20 },
  // 콘트라포스토는 자유손 위치를 명시하지 않으면 LLM이 고전 관습대로 "손은 허리에"로
  // 완성한다(CBT 실측 66%) — 자유팔을 문구에 못 박는다.
  { desc: 'standing with the weight shifted onto one leg in a relaxed contrapposto, the weapon resting at one side, the free arm hanging loose and relaxed at the other side', weight: 20, skip: ['pair'] },
  { desc: 'holding the weapon upright in front with both hands resting on it, in a calm and dignified stance', weight: 20, skip: ['pair', 'ranged'] },
  // 정적(추가) — 다른 결의 차분한 정면 포즈(컨셉 친화, 액션감 X)
  { desc: 'holding the weapon horizontally in front with both hands, in a calm and composed at-rest stance', weight: 12, skip: ['pair'] },
  { desc: 'standing poised with one hand resting elegantly on the hip and the weapon held calmly at the other side', weight: 12, skip: ['pair'] },
  // 정적(2차 추가, 2026-07-04) — 여유·귀족적 멋·포용 결(전부 정면·무기 시인성 유지)
  { desc: 'standing at ease with the weapon planted at the side like a cane, one hand resting atop it, leaning subtly with quiet confidence', weight: 4, skip: ['pair', 'ranged'] },
  { desc: 'one hand lightly adjusting the collar or glove with effortless poise, the weapon held calmly at the other side', weight: 4, skip: ['pair'] },
  { desc: 'cradling the weapon gently in both arms against the chest, standing calm and serene', weight: 4, skip: ['pair'] },
  // 히든 — 희소·특별(무기를 머리 위로 들지 않음 — 머리 위 공간 확보)
  { desc: 'resting the weapon back on one shoulder, head held high with a proud charismatic air, the free hand extended forward in a bold inviting gesture toward the viewer', weight: 4, skip: ['pair', 'ranged'] },
  // 쌍무기 전용 — 양손에 하나씩 든 상태를 포즈 단계에서 못 박는다.
  { desc: 'standing calm and balanced with one weapon held in each hand, both lowered and relaxed at the sides', weight: 0, only: 'pair' },
  { desc: 'standing composed with one weapon in each hand, the right one held slightly forward and the left drawn back close to the body', weight: 0, only: 'pair' },
  // 원거리 전용 — 수평 파지·팔 안쪽 거치(석궁이 세로 활로 읽히던 문제).
  { desc: 'standing calm and composed, the weapon carried level in both hands at chest height, parallel to the ground', weight: 0, only: 'ranged' },
  { desc: 'standing at ease with the weapon resting level across one forearm, the other hand steadying it, quiet confidence in the stance', weight: 0, only: 'ranged' },
] as const;

// 서버 RNG (CLAUDE §3.1).
const rng = (n: number): number => crypto.getRandomValues(new Uint32Array(1))[0]! % n;
const pick = <T>(a: readonly T[]): T => a[rng(a.length)]!;

/** 가중치 추출(종족·표정 공용) — weight 합 기준 비례 random. */
type Weighted = { desc: string; weight: number };
/** 무기 종류 태그 — skip=이 종류엔 부적합, only=이 종류 전용(기본 가중치 0). */
type PoseEntry = Weighted & { skip?: readonly string[]; only?: string };

/**
 * 무기 종류에 맞는 포즈 추출 — 부적합 포즈를 빼고, 전용 포즈에 가중치를 부여한다.
 * 전용 포즈 가중치 24는 남은 일반 포즈(쌍무기 20 / 원거리 44) 대비 과반이 되게 잡았다 —
 * 쌍무기·원거리는 일반 포즈 대부분이 빠져 선택지가 좁아지므로 전용 포즈가 주력이 된다.
 */
const ONLY_WEIGHT = 24;
function pickPose(kind: { pair?: boolean; ranged?: boolean } | null): string {
  const tags = [kind?.pair ? 'pair' : null, kind?.ranged ? 'ranged' : null].filter((t): t is string => t !== null);
  const usable = POSES.flatMap((p): Weighted[] => {
    const e = p as PoseEntry;
    if (e.only) return tags.includes(e.only) ? [{ desc: e.desc, weight: ONLY_WEIGHT }] : [];
    if (e.skip?.some((t) => tags.includes(t))) return [];
    return [{ desc: e.desc, weight: e.weight }];
  });
  // 전부 걸러지는 조합은 없지만(일반 포즈 1종은 무태그), 방어적으로 폴백을 둔다.
  return usable.length ? pickWeighted(usable) : POSES[0]!.desc;
}

function pickWeighted(items: readonly Weighted[]): string {
  const total = items.reduce((s, it) => s + it.weight, 0);
  let r = rng(total);
  for (const it of items) {
    if (r < it.weight) return it.desc;
    r -= it.weight;
  }
  return items[items.length - 1]!.desc;
}

// 종족 가중치: 인간 주력(≈45%) + 판타지 6종 각 10%. 머리 부속(귀·뿔)은 항상 작게.
// 네코미미는 "귀만"(꼬리 미언급) + small neat.
const FEMALE = {
  races: [
    { desc: 'a human girl', weight: 50 },
    { desc: 'an elf girl with slender pointed ears', weight: 10 },
    { desc: 'an elegant beautiful cat-girl with small neat cat ears', weight: 10 },
    { desc: 'a fairy girl with small translucent wings', weight: 10 },
    { desc: 'a beautiful demon girl with small neat horns', weight: 10 },
    { desc: 'a beautiful dragon-girl with small neat horns and subtle scale accents', weight: 10 },
    { desc: 'a beautiful girl with striking heterochromatic eyes', weight: 10 },
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
    { desc: 'a handsome youth with striking heterochromatic eyes', weight: 10 },
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

export function pickRandomAppearance(
  gender: ProfileGender,
  /** 장착 무기 종류 — 포즈를 무기와 맞춘다(2026-08-06). 미지정 시 무태그(기존 동작). */
  weaponKind?: { pair?: boolean; ranged?: boolean } | null,
): Appearance {
  const p = gender === 'male' ? MALE : FEMALE;
  const race = pickWeighted(p.races);
  // 오드아이 종족 — 단일 홍채색 축과 충돌하지 않게 서로 다른 두 색을 명시해 전달.
  let eyeColor = pick(EYE_COLORS);
  if (race.includes('heterochromatic')) {
    const second = pick(EYE_COLORS.filter((c) => c !== eyeColor));
    eyeColor = `${eyeColor}-and-${second} heterochromatic (one eye each color)`;
  }
  return {
    race,
    hair: `${pick(p.hairColors)} ${pick(p.hairStyles)}`,
    eyeColor,
    expression: pickWeighted(p.expressions),
    pose: pickPose(weaponKind ?? null),
  };
}
