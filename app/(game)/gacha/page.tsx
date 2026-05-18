import Link from 'next/link';
import { eq } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { userSupplyBoxes } from '@/lib/db/schema/supply';
import type { Slot } from '@/lib/db/schema/equipment';

import { GachaBoxCard } from './GachaBoxCard';

const BOXES: { slot: Slot; label: string; emoji: string }[] = [
  { slot: 'weapon', label: '무기 보급 상자', emoji: '⚔️' },
  { slot: 'armor', label: '방어구 보급 상자', emoji: '🛡️' },
  { slot: 'accessory', label: '장신구 보급 상자', emoji: '💍' },
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
          emoji={b.emoji}
          count={countBySlot.get(b.slot) ?? 0}
        />
      ))}
      <p className="pt-1 text-center text-xs text-zinc-500">
        <Link href="/probability" className="underline">
          확률 보기
        </Link>{' '}
        · 슬롯 내 균등 · 천장 없음
      </p>
    </div>
  );
}
