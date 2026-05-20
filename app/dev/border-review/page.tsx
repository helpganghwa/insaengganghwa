import { SPRITE_MANIFEST } from '@/lib/game/equipment/sprite-manifest';

import { BorderReviewClient, type SpriteEntry } from './BorderReviewClient';

// Dev-only 시각 리뷰 — sprite 자체 외곽선과 등급 frame의 처리 옵션을 한눈에 비교.
// 비인증 노출(공개 자산만 사용). prod 영향 0.
export const dynamic = 'force-static';

function slotOf(path: string): SpriteEntry['slot'] {
  if (path.includes('/weapon/')) return 'weapon';
  if (path.includes('/armor/')) return 'armor';
  if (path.includes('/accessory/')) return 'accessory';
  return 'weapon';
}

export default function BorderReviewPage() {
  const sprites: SpriteEntry[] = Object.entries(SPRITE_MANIFEST)
    .map(([code, path]) => ({ code, path, slot: slotOf(path) }))
    .sort((a, b) =>
      a.slot === b.slot ? a.code.localeCompare(b.code) : a.slot.localeCompare(b.slot),
    );
  return <BorderReviewClient sprites={sprites} />;
}
