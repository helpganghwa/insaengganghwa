import { SPRITE_MANIFEST } from '@/lib/game/equipment/sprite-manifest';

import { OrnateReviewClient, type SpriteEntry } from './OrnateReviewClient';

// Dev-only — 코너 ornate SVG 10가지 변형 비교. 비인증 노출, prod 영향 0.
export const dynamic = 'force-static';

function slotOf(p: string): SpriteEntry['slot'] {
  if (p.includes('/weapon/')) return 'weapon';
  if (p.includes('/armor/')) return 'armor';
  return 'accessory';
}

export default function OrnateReviewPage() {
  // 비교 카드용 sprite 12개 샘플(슬롯별 4개씩 추출)
  const all = Object.entries(SPRITE_MANIFEST).map(([code, path]) => ({
    code,
    path,
    slot: slotOf(path),
  }));
  const pick = (slot: SpriteEntry['slot'], n: number) =>
    all.filter((s) => s.slot === slot).slice(0, n);
  const sprites: SpriteEntry[] = [...pick('weapon', 4), ...pick('armor', 4), ...pick('accessory', 4)];
  return <OrnateReviewClient sprites={sprites} />;
}
