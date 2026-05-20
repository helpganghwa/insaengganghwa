import { eq } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { userSupplyBoxes } from '@/lib/db/schema/supply';
import type { Slot } from '@/lib/db/schema/equipment';
import { assetUrl } from '@/lib/asset-versions';

import { GachaBoxCard } from './GachaBoxCard';

// 상자별 배경 이미지(Pixellab) + 어울리는 다크 tint(투명/외곽 영역 보강).
// bgPosY = 배경의 y%를 카드 중앙에 맞춤 — Pixellab 결과마다 박스 모티프 y가
// 달라 슬롯별 미세 조정. 박스가 카드 시각 중앙에 보이도록 70~85%.
const BOXES: { slot: Slot; label: string; bg: string; bgPosY: string; tint: string }[] = [
  { slot: 'weapon',    label: '무기 보급 상자',   bg: '/sprites/hub/box-weapon.png',    bgPosY: '70%', tint: '#2a1f15' },
  { slot: 'armor',     label: '방어구 보급 상자', bg: '/sprites/hub/box-armor.png',     bgPosY: '80%', tint: '#1c2630' },
  { slot: 'accessory', label: '장신구 보급 상자', bg: '/sprites/hub/box-accessory.png', bgPosY: '70%', tint: '#2a1620' },
];

export default async function GachaPage() {
  const userId = await getSessionUserId();
  if (!userId) return null;

  const rows = await db
    .select({ slot: userSupplyBoxes.slot, count: userSupplyBoxes.count })
    .from(userSupplyBoxes)
    .where(eq(userSupplyBoxes.userId, userId));
  const countBySlot = new Map(rows.map((r) => [r.slot, Number(r.count)]));

  return (
    <div className="space-y-3 px-4 py-4">
      <h1 className="text-lg font-semibold">📦 보급</h1>
      {BOXES.map((b) => (
        <GachaBoxCard
          key={b.slot}
          slot={b.slot}
          label={b.label}
          bg={assetUrl(b.bg)}
          bgPosY={b.bgPosY}
          tint={b.tint}
          count={countBySlot.get(b.slot) ?? 0}
        />
      ))}
    </div>
  );
}
