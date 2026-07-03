// 장비 애니(게임용) 클라이언트 헬퍼 — code → itemanim 스트립(N×cell, 가로) 조회.
// 빌드: scripts/build-item-anim.ts (anim3/<id>.webp → sprites/itemanim/<code>.webp + itemanim.json).
// 렌더는 showcase 자리에서만(TranscendSprite itemAnim 프롭). 그리드는 정적 atlas 유지.
import { assetUrl } from '@/lib/asset-versions';

import meta from '@/public/sprites/itemanim.json';

interface ItemAnimMeta {
  cell: number;
  /** cell: 아이템별 오버라이드 — 2차 편입분은 128(3차 기본 256과 혼재, 화질개선 재생성 시 통일). */
  items: Record<string, { frames: number; cell?: number }>;
}
const A = meta as ItemAnimMeta;

export const ITEM_ANIM_CELL = A.cell;

/** 스트립 셀 크기(px) — 아이템별 오버라이드 우선. 렌더는 source-crop이라 혼재 안전. */
export function itemAnimCell(code: string): number {
  return A.items[code]?.cell ?? A.cell;
}

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
