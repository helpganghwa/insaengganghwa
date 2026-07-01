import Link from 'next/link';
import { and, eq } from 'drizzle-orm';
import { getActiveServerId } from '@/lib/game/servers';
import { preload } from 'react-dom';

import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { withTimeout } from '@/lib/db/with-timeout';
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
  // LCP 자산 — 첫 카드(무기 박스) 배경에 가장 높은 우선순위. RSC가 Link 헤더에 주입해
  // 브라우저가 HTML 파싱 전부터 병렬 fetch 시작.
  preload(assetUrl(BOXES[0].bg), { as: 'image', fetchPriority: 'high' });

  const userId = await getSessionUserId();
  const serverId = await getActiveServerId();
  if (!userId) return null;

  // 콜드 DB 커넥션 hang 시 페이지 무한 대기 방지 — 실패 시 보유 수량 0으로 degrade(2026-05-29).
  const rows = await withTimeout(
    db
      .select({ slot: userSupplyBoxes.slot, count: userSupplyBoxes.count })
      .from(userSupplyBoxes)
      .where(and(eq(userSupplyBoxes.userId, userId), eq(userSupplyBoxes.serverId, serverId))),
    3500,
    'gacha.boxes',
  ).catch(() => []);
  const countBySlot = new Map(rows.map((r) => [r.slot, Number(r.count)]));

  return (
    <div className="space-y-3 px-4 py-4">
      {BOXES.map((b, i) => (
        <GachaBoxCard
          key={b.slot}
          slot={b.slot}
          label={b.label}
          bg={assetUrl(b.bg)}
          bgPosY={b.bgPosY}
          tint={b.tint}
          count={countBySlot.get(b.slot) ?? 0}
          eager={i === 0}
        />
      ))}
      <div className="pt-1 pb-2 text-center">
        <Link
          href="/probability#supply"
          className="text-[11px] text-zinc-400 underline underline-offset-2 hover:text-zinc-600 dark:hover:text-zinc-300"
        >
          확률 공시
        </Link>
      </div>
    </div>
  );
}
