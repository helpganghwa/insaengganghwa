import type { AttrRegion, AvatarAttr } from '@/lib/game/balance';
import { attrDisplayVector } from '@/lib/game/balance';

/**
 * 룬 명명 — 지배 지역 × 등급대(총합) 톤(2026-07-28 확정 UI 스펙).
 *  - 120+: 웅장/신화 · 70~119: 견고한 판타지 · 30~69: 평범한 유물 · 0~29: 초라함 명시
 * 어휘 풀 조합(서버 전용, 생성 시 1회 확정·불변). AI(Haiku) 명명 승격은 후속 —
 * 풀 자체를 정제해 "AI가 지은 듯한" 품질을 우선 확보.
 */

type Pool = { pre: string[]; core: string[] };
// pre는 '의'로 끝나지 않게 유지 — 조합식이 `pre core의 suffix`라 '~의 ~의' 겹침이 생긴다.
const WORDS: Record<AttrRegion, Pool> = {
  angel: {
    pre: ['새벽빛', '흰 날개', '은총 어린', '성가 어린', '빛무리', '타락 없는'],
    core: ['축복', '후광', '날개깃', '강림', '성가', '눈물'],
  },
  kingdom: {
    pre: ['금빛', '왕관 새긴', '옥좌 아래', '대관식', '문장 새긴', '왕성 지킨'],
    core: ['맹세', '왕관', '인장', '영광', '행진', '서명'],
  },
  orc: {
    pre: ['전장 누빈', '핏빛', '북소리 울린', '사냥 나선', '거친', '승리 부른'],
    core: ['함성', '전고', '포효', '용맹', '사냥', '돌진'],
  },
  swamp: {
    pre: ['심연', '안개 낀', '가라앉은', '독기 서린', '끈질긴', '깊이 잠긴'],
    core: ['뿌리', '수렁', '속삭임', '맥동', '침식', '숨결'],
  },
  volcano: {
    pre: ['용암', '잿불 머금은', '타오르는', '달궈진', '분화하는', '불꽃 삼킨'],
    core: ['심장', '불씨', '맥박', '분노', '용암류', '숨결'],
  },
  temple: {
    pre: ['서리', '눈 덮인', '얼어붙은', '흰 눈 쌓인', '빙하 품은', '고요한'],
    core: ['서약', '기도', '수정', '침묵', '축문', '성소'],
  },
};

// 등급대별 마무리 어미 — 웅장 → 판타지 → 유물 → 초라.
const SUFFIX_T4 = ['대각인', '대성흔', '대서약', '대인장'];
const SUFFIX_T3 = ['각인', '서약', '인장', '문장', '성흔', '맹세'];
const SUFFIX_T2 = ['조각', '파편', '흔적', '부적', '징표'];
const SHABBY = ['빛바랜', '금이 간', '식어버린', '잊혀진', '바스러진', '무뎌진'];

function rand(n: number): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]! % n;
}
const pick = <T,>(a: readonly T[]): T => a[rand(a.length)]!;

/** 지배 지역(합산 최대) — 동률이면 사이클 순서 앞. 전부 0이면 null. */
export function dominantRegion(attrs: AvatarAttr[]): AttrRegion | null {
  const v = attrDisplayVector(attrs);
  let best: AttrRegion | null = null;
  let bv = 0;
  for (const [r, x] of Object.entries(v) as [AttrRegion, number][]) {
    if (x > bv) {
      bv = x;
      best = r;
    }
  }
  return best;
}

/** 룬 이름 생성 — 지배 지역 어휘 + 총합 등급대 톤. */
export function runeNameFor(attrs: AvatarAttr[]): string {
  const dom = dominantRegion(attrs);
  const total = attrs.reduce((s, a) => s + a.pct, 0);
  if (!dom || total <= 0) return `${pick(SHABBY)} 무명석`;
  const w = WORDS[dom];
  const core = pick(w.core);
  // 어미가 core와 겹치면 제외 — "맹세의 맹세"·"인장의 대인장" 방지.
  const suffix = (pool: readonly string[]) => pick(pool.filter((s) => !s.endsWith(core)));
  if (total >= 120) return `${pick(w.pre)} ${core}의 ${suffix(SUFFIX_T4)}`;
  if (total >= 70) return `${pick(w.pre)} ${core}의 ${suffix(SUFFIX_T3)}`;
  if (total >= 30) return `${pick(w.pre)} ${core}의 ${suffix(SUFFIX_T2)}`;
  return `${pick(SHABBY)} ${core}`;
}
