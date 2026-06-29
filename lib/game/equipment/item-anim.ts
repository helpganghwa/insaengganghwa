// 장비 애니(게임용) 클라이언트 헬퍼 — code → itemanim 스트립(N×cell, 가로) 조회.
// 빌드: scripts/build-item-anim.ts (anim3/<id>.webp → sprites/itemanim/<code>.webp + itemanim.json).
// 렌더는 showcase 자리에서만(TranscendSprite itemAnim 프롭). 그리드는 정적 atlas 유지.
import { assetUrl } from '@/lib/asset-versions';

import meta from '@/public/sprites/itemanim.json';

interface ItemAnimMeta {
  cell: number;
  items: Record<string, { frames: number }>;
}
const A = meta as ItemAnimMeta;

export const ITEM_ANIM_CELL = A.cell;

/** 프레임 수(없으면 0). */
export function itemAnimFrames(code: string): number {
  return A.items[code]?.frames ?? 0;
}
export function hasItemAnim(code: string): boolean {
  return !!A.items[code];
}
/** code별 스트립 URL(없으면 null). */
export function itemAnimUrl(code: string): string | null {
  return A.items[code] ? assetUrl(`/sprites/itemanim/${code}.webp`) : null;
}
