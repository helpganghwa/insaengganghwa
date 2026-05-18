import { ImageResponse } from 'next/og';
import { and, eq, isNotNull, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { profiles } from '@/lib/db/schema/profiles';
import { catalogItems, equipmentInstances, userCodex } from '@/lib/db/schema/equipment';
import { pieceCombatPower, totalCombatPower } from '@/lib/game/balance';
import { formatCompactKR } from '@/lib/ui/format-number';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const EMOJI = { weapon: '⚔️', armor: '🛡️', accessory: '💍' } as const;
const SLOTS = ['weapon', 'armor', 'accessory'] as const;

/**
 * 동적 OG 카드 — WIREFRAMES §10 / CLAUDE §3.7(세트 단위, 등급 표기 없음).
 * /u/<nickname> 메타데이터의 og:image. 닉네임·착용 세트·총 전투력.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ shareCode: string }> },
) {
  const { shareCode } = await params;
  const nickname = decodeURIComponent(shareCode);

  const [prof] = await db
    .select({ id: profiles.id, nickname: profiles.nickname })
    .from(profiles)
    .where(eq(profiles.nickname, nickname))
    .limit(1);

  let total = 0;
  let equipped: { slot: string; name: string; enhanceLevel: number; transcendLevel: number }[] = [];
  if (prof) {
    const [eq_, codexAgg] = await Promise.all([
      db
        .select({
          slot: catalogItems.slot,
          name: catalogItems.name,
          enhanceLevel: equipmentInstances.enhanceLevel,
          transcendLevel: equipmentInstances.transcendLevel,
        })
        .from(equipmentInstances)
        .innerJoin(catalogItems, eq(equipmentInstances.catalogItemId, catalogItems.id))
        .where(
          and(eq(equipmentInstances.userId, prof.id), isNotNull(equipmentInstances.equippedSlot)),
        ),
      db
        .select({ s: sql<number>`coalesce(sum(${userCodex.maxEnhanceLevel}),0)::int` })
        .from(userCodex)
        .where(eq(userCodex.userId, prof.id)),
    ]);
    equipped = eq_;
    total = totalCombatPower(
      eq_.map((e) => pieceCombatPower(e.enhanceLevel, e.transcendLevel)),
      Number(codexAgg[0]?.s ?? 0),
    );
  }

  const bySlot = new Map(equipped.map((e) => [e.slot, e]));
  const display = prof ? prof.nickname : '인생강화';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: 'linear-gradient(135deg,#1c1410 0%,#3a2a14 60%,#7a5a1e 100%)',
          color: '#fde9c8',
          padding: '64px 72px',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', fontSize: 30, opacity: 0.85, letterSpacing: 2 }}>
          ⚒️ 인생강화 — 시간기반 강화 RPG
        </div>
        <div style={{ display: 'flex', marginTop: 18, fontSize: 78, fontWeight: 800 }}>
          {display}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 44 }}>
          {SLOTS.map((s) => {
            const it = bySlot.get(s);
            return (
              <div key={s} style={{ display: 'flex', alignItems: 'center', fontSize: 38 }}>
                <span style={{ width: 56 }}>{EMOJI[s]}</span>
                <span style={{ opacity: it ? 1 : 0.4 }}>
                  {it
                    ? `${it.name}  +${it.enhanceLevel}  ✦T${it.transcendLevel}`
                    : '미장착'}
                </span>
              </div>
            );
          })}
        </div>

        <div
          style={{
            display: 'flex',
            marginTop: 'auto',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', fontSize: 30, opacity: 0.7 }}>
            insaengganghwa.com
          </div>
          <div style={{ display: 'flex', fontSize: 64, fontWeight: 800, color: '#ffd47a' }}>
            ⚔️ {formatCompactKR(total)}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
