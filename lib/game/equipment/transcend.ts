// 초월 시각 등급 — 단일 진실 원천 (side-effect 없음, 프레임워크 무관).
//
// 강화 레벨이 아니라 transcend_level에 대한 *외관 등급*만 정의한다.
// 아이템 스프라이트 자체는 전 등급 불변(GDD §3.1) — 여기서 정하는 건 프레임/별 장식 규칙뿐.
//
// 색 구간(10레벨 단위): +0 무프레임 → +1~10 일반(회) → +11~20 희귀(청) → +21~30 영웅(보)
//             → +31~40 전설(금) → +41~ 신화(적, 무한).
// 각 색 구간 내 별 장식: 전반 5레벨(+1~+5) = 큰 별만 / 후반 5레벨(+6~+10) = 큰 별 + 위성 별 3개.

export type TranscendTier = 'none' | 'normal' | 'rare' | 'heroic' | 'legend' | 'mythic';

/** 시각 튜닝 상수 — 디자인 확정 후 변경은 여기 숫자만. (transcend-visual-system 메모리 §락) */
export const TRANSCEND_TUNING = {
  /** 배경 패널: 'tinted'=등급색 소폭 틴트 / 'none'=배경색 없음(투명) */
  panelBg: 'none' as 'tinted' | 'none',
  /** 챔피언 glare 글로우 알파 — 낮을수록 투명(아이템 가독 우선). 헤일로/링 금지(흰띠 아티팩트). */
  championGlowAlpha: 0.16,
  /** 챔피언 glare 피크 알파 — brightCv mask 방식이라 충분히 강해야 보임. */
  shineAlpha: 0.95,
  /** 광택 띠 반폭 (FS 비율). 띠가 넓을수록 sprite 위 빛나는 면적 ↑ */
  shineWidth: 0.30,
  /** 애니 1주기 ms — 한 번 통과 후 텀 포함. */
  animPeriodMs: 2400,
  /** 1주기당 통과 횟수 — 1회만(반복 사이 텀). */
  shineSpeed: 1.0,
  /** 프레임 간격 ms (애니 캔버스 소수라 ~50fps 여유 — 두꺼운 띠도 매끄럽게) */
  fpsIntervalMs: 20,
  /** II(2단계)에서 코너 문양을 얼마나 키워 겹치는가 (기본 프레임 1.32× 대비) */
  cornerScale: 2.3,
  /** 리컬러 화이트포인트 — 밝은 등급 washout 방지용 캡 (I / II) */
  whiteCapI: 0.3,
  whiteCapII: 0.44,
  /** 프레임 알파 (I / II) */
  frameAlphaI: 0.9,
  frameAlphaII: 1.0,
  /** 단일 프레임 에셋 (중앙 투명 검증본) */
  frameAsset: '/sprites/ui/transcend-frame.png',
} as const;

export interface TranscendStyle {
  /** clamp 적용된 유효 레벨 (0..MAX_TRANSCEND) */
  level: number;
  tier: TranscendTier;
  /** UI 노출용 한글 등급명 ('' = 등급 없음) */
  labelKo: string;
  /** 프레임/글로우/별 리컬러 기준 RGB */
  colorRgb: readonly [number, number, number];
  /** 색 구간 내 별 장식: 0 = 전반(+1~+5, 큰 별만), 1 = 후반(+6~+10, 큰 별+위성 3개). tier 'none'이면 null */
  sub: 0 | 1 | null;
  /** 프레임 표시 여부 (+0 = false) */
  hasFrame: boolean;
}

const NEUTRAL: readonly [number, number, number] = [150, 156, 166];

// tier → (한글명, RGB). 'none'은 별도 처리.
const TIER_DEF: Record<Exclude<TranscendTier, 'none'>, { ko: string; rgb: readonly [number, number, number] }> = {
  normal: { ko: '일반', rgb: [150, 156, 166] },
  rare: { ko: '희귀', rgb: [64, 150, 224] },
  heroic: { ko: '영웅', rgb: [168, 92, 220] },
  legend: { ko: '전설', rgb: [236, 166, 54] },
  mythic: { ko: '신화', rgb: [228, 64, 52] },
};

/** 색 구간 = 10레벨씩 한 등급. 마지막(신화)은 +41~ 무한. */
const TIERS: Exclude<TranscendTier, 'none'>[] = ['normal', 'rare', 'heroic', 'legend', 'mythic'];
const LEVELS_PER_TIER = 10;

/** transcend_level → 시각 등급 스타일. 음수만 0으로 clamp(상한 없음 — 초월 무한). */
export function transcendStyle(rawLevel: number): TranscendStyle {
  const level = Math.max(0, Math.floor(rawLevel || 0));
  if (level === 0) {
    return {
      level,
      tier: 'none',
      labelKo: '',
      colorRgb: NEUTRAL,
      sub: null,
      hasFrame: false,
    };
  }
  const tier = TIERS[Math.min(TIERS.length - 1, Math.floor((level - 1) / LEVELS_PER_TIER))]!;
  const def = TIER_DEF[tier];
  // 색 구간 내 위치(0..9): 전반(0~4)=큰 별만(sub 0), 후반(5~9)=큰 별+위성 3개(sub 1).
  const sub: 0 | 1 = (level - 1) % LEVELS_PER_TIER >= LEVELS_PER_TIER / 2 ? 1 : 0;
  return {
    level,
    tier,
    labelKo: def.ko,
    colorRgb: def.rgb,
    sub,
    hasFrame: true,
  };
}
