// 해방(강화랭킹 1~3위) 아이템 애니 데이터 클라이언트 헬퍼.
// 빌드(scripts/build-anim-atlas.ts)가 코드별 가로 스트립(public/sprites/anim/<code>.webp, N×128)
// + public/sprites/anim.json(프레임 수 맵) 생성. 해방 아이템은 드물어 코드별 스트립 온디맨드 로드.
import { assetUrl } from '@/lib/asset-versions';

import anim from '@/public/sprites/anim.json';

export interface AnimMeta {
  cell: number;
  items: Record<string, { frames: number }>;
}

const ANIM = anim as AnimMeta;
export const ANIM_CELL = ANIM.cell;

/** 애니 프레임 수(없으면 0). */
export function animFrames(code: string): number {
  return ANIM.items[code]?.frames ?? 0;
}
export function hasAnim(code: string): boolean {
  return !!ANIM.items[code];
}
/** 코드별 스트립 URL(없으면 null). */
export function animStripUrl(code: string): string | null {
  return ANIM.items[code] ? assetUrl(`/sprites/anim/${code}.webp`) : null;
}
