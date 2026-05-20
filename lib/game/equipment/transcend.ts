// 초월 시각 등급 — 단일 진실 원천 (side-effect 없음, 프레임워크 무관).
//
// 강화 레벨이 아니라 transcend_level(0..MAX_TRANSCEND)에 대한 *외관 등급*만 정의한다.
// 아이템 스프라이트 자체는 전 등급 불변(GDD §3.1) — 여기서 정하는 건 프레임/글로우 연출 규칙뿐.
//
// 매핑(확정): +0 무프레임 → +1·2 일반(회) → +3·4 희귀(청) → +5·6 영웅(보)
//             → +7·8 전설(금) → +9·10 신화(적). 색당 1단계(I)=기본 / 2단계(II)=코너 화려.
//             글로우는 +8부터. +10 = 광택 스윕(MAX).

import { MAX_TRANSCEND } from '@/lib/game/balance';

export type TranscendTier = 'none' | 'normal' | 'rare' | 'heroic' | 'legend' | 'mythic';

/** 시각 튜닝 상수 — 디자인 확정 후 변경은 여기 숫자만. (transcend-visual-system 메모리 §락) */
export const TRANSCEND_TUNING = {
  /** 글로우(뒤 색 후광) 사용 여부. false면 모든 등급 글로우 없음 */
  glowEnabled: false,
  /** 배경 패널: 'tinted'=등급색 소폭 틴트 / 'none'=배경색 없음(투명) */
  panelBg: 'none' as 'tinted' | 'none',
  /** 글로우가 처음 켜지는 transcend_level (glowEnabled=true일 때) */
  glowFromLevel: 8,
  /** 글로우 최대 알파 (등급) / 챔피언. 낮을수록 투명 — 아이템 가독 우선.
   *  finalZ2 승인 형태(부드러운 중앙 라디얼)를 유지하되 알파만 낮춤. 헤일로/링 금지(흰띠 아티팩트). */
  glowAlpha: 0.18,
  championGlowAlpha: 0.16,
  /** 챔피언 광택 스윕 피크 알파 (screen 블렌드 — 골드 광채). 챔피언 식별 표식이라 크게. */
  shineAlpha: 0.85,
  /** 광택 띠 반폭 (FS 비율). 클수록 두껍고 눈에 띔 */
  shineWidth: 0.32,
  /** 애니 1주기 ms (글로우 펄스·스윕 공통 시간축). 길수록 천천히 */
  animPeriodMs: 2400,
  /** 1주기당 광택 스윕 횟수 (작을수록 천천히 글라이드 → 프레임당 이동 작아 매끄러움) */
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
  /** 색 구간 내 단계: 0 = I(기본), 1 = II(코너 화려). tier 'none'이면 null */
  sub: 0 | 1 | null;
  /** 프레임 표시 여부 (+0 = false) */
  hasFrame: boolean;
  /** 배경 글로우 표시 여부 (+8 이상) */
  hasGlow: boolean;
  /** 최대 초월(+10) — 광택 스윕 연출 대상 */
  isMax: boolean;
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

// +1부터 색당 2레벨씩: [tier, tier, ...] (index = level-1)
const LADDER: Exclude<TranscendTier, 'none'>[] = [
  'normal', 'normal', 'rare', 'rare', 'heroic', 'heroic', 'legend', 'legend', 'mythic', 'mythic',
];

/** transcend_level → 시각 등급 스타일. 범위 밖 입력은 [0, MAX_TRANSCEND]로 clamp. */
export function transcendStyle(rawLevel: number): TranscendStyle {
  const level = Math.max(0, Math.min(MAX_TRANSCEND, Math.floor(rawLevel || 0)));
  if (level === 0) {
    return {
      level,
      tier: 'none',
      labelKo: '',
      colorRgb: NEUTRAL,
      sub: null,
      hasFrame: false,
      hasGlow: false,
      isMax: false,
    };
  }
  const tier = LADDER[level - 1];
  const def = TIER_DEF[tier];
  return {
    level,
    tier,
    labelKo: def.ko,
    colorRgb: def.rgb,
    sub: ((level - 1) % 2) as 0 | 1,
    hasFrame: true,
    hasGlow: level >= TRANSCEND_TUNING.glowFromLevel,
    isMax: level === MAX_TRANSCEND,
  };
}
