import { ImageResponse } from 'next/og';
import { and, eq, isNotNull, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { profiles } from '@/lib/db/schema/profiles';
import { catalogItems, equipmentInstances, userCodex } from '@/lib/db/schema/equipment';
import { pieceCombatPower, totalCombatPower } from '@/lib/game/balance';
import { championCatalogIds } from '@/lib/game/codex/ranking';
import { spritePath } from '@/lib/game/equipment/sprite-manifest';
import { formatCompactKR } from '@/lib/ui/format-number';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const EMOJI = { weapon: '⚔️', armor: '🛡️', accessory: '💍' } as const;
const SLOTS = ['weapon', 'armor', 'accessory'] as const;
/** Pixellab 배경 아트 풀 — public/og/og-1..N.png. 부재 시 그라데이션 폴백. */
const BG_POOL = 8;

/** 같은 배포의 정적 에셋 → base64 data URI(Satori가 안정적으로 임베드). 실패=null. */
async function dataUri(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.startsWith('image/')) return null; // preview 보호 등 HTML 응답 방어
    const b64 = Buffer.from(await res.arrayBuffer()).toString('base64');
    return `data:${ct};base64,${b64}`;
  } catch {
    return null;
  }
}

/**
 * 동적 OG 카드 — WIREFRAMES §10.1 / CLAUDE §3.7. /u/<nickname> og:image.
 * 닉네임·착용 3슬롯(실제 스프라이트, 챔피언=👑)·총 전투력 + Pixellab 배경 랜덤(요청마다).
 * 배경/스프라이트 부재 시 그라데이션/이모지로 안전 폴백 — OG는 절대 실패하지 않음.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ shareCode: string }> }) {
  const { shareCode } = await params;
  const nickname = decodeURIComponent(shareCode);
  const origin = new URL(_req.url).origin;

  const [prof] = await db
    .select({ id: profiles.id, nickname: profiles.nickname })
    .from(profiles)
    .where(eq(profiles.nickname, nickname))
    .limit(1);

  let total = 0;
  let equipped: {
    slot: string;
    catalogItemId: number;
    code: string;
    name: string;
    enhanceLevel: number;
    transcendLevel: number;
  }[] = [];
  let champ = new Set<number>();
  if (prof) {
    const [eq_, codexAgg, champSet] = await Promise.all([
      db
        .select({
          slot: catalogItems.slot,
          catalogItemId: catalogItems.id,
          code: catalogItems.code,
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
      championCatalogIds(prof.id),
    ]);
    equipped = eq_;
    champ = champSet;
    total = totalCombatPower(
      eq_.map((e) => pieceCombatPower(e.enhanceLevel, e.transcendLevel)),
      Number(codexAgg[0]?.s ?? 0),
    );
  }

  const bySlot = new Map(equipped.map((e) => [e.slot, e]));
  const display = prof ? prof.nickname : '인생강화';

  // 배경: 요청마다 진한 랜덤(no-store) — 풀 1개 시도, 부재면 그라데이션.
  const bgUri = await dataUri(
    `${origin}/og/og-${1 + Math.floor(Math.random() * BG_POOL)}.png`,
  );
  // 슬롯 스프라이트 data URI 선해결(Satori는 동기 렌더).
  const sprite = new Map<string, string | null>();
  await Promise.all(
    [...bySlot.values()].map(async (it) => {
      const p = spritePath(it.code);
      sprite.set(it.slot, p ? await dataUri(`${origin}${p}`) : null);
    }),
  );

  const rootBase = {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column' as const,
    color: '#fde9c8',
    padding: '64px 72px',
    fontFamily: 'sans-serif',
    position: 'relative' as const,
  };

  return new ImageResponse(
    (
      <div
        style={
          bgUri
            ? { ...rootBase, background: '#120c08' }
            : {
                ...rootBase,
                background: 'linear-gradient(135deg,#1c1410 0%,#3a2a14 60%,#7a5a1e 100%)',
              }
        }
      >
        {bgUri ? (
          <>
            <img
              src={bgUri}
              width={1200}
              height={630}
              style={{ position: 'absolute', top: 0, left: 0, width: 1200, height: 630, objectFit: 'cover' }}
            />
            {/* 가독성 스크림 */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: 1200,
                height: 630,
                background:
                  'linear-gradient(105deg,rgba(8,6,4,0.86) 0%,rgba(10,7,4,0.66) 48%,rgba(10,7,4,0.30) 100%)',
                display: 'flex',
              }}
            />
          </>
        ) : null}

        <div style={{ display: 'flex', fontSize: 30, opacity: 0.9, letterSpacing: 2, zIndex: 1 }}>
          ⚒️ 인생강화 — 시간기반 강화 RPG
        </div>
        <div style={{ display: 'flex', marginTop: 18, fontSize: 78, fontWeight: 800, zIndex: 1 }}>
          {display}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 40, zIndex: 1 }}>
          {SLOTS.map((s) => {
            const it = bySlot.get(s);
            const spr = it ? sprite.get(s) : null;
            const isChamp = it ? champ.has(it.catalogItemId) : false;
            return (
              <div key={s} style={{ display: 'flex', alignItems: 'center', fontSize: 38 }}>
                <div
                  style={{
                    width: 64,
                    height: 64,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 18,
                  }}
                >
                  {spr ? (
                    <img src={spr} width={60} height={60} style={{ width: 60, height: 60 }} />
                  ) : (
                    <span style={{ fontSize: 46, opacity: it ? 1 : 0.4 }}>{EMOJI[s]}</span>
                  )}
                </div>
                <span style={{ opacity: it ? 1 : 0.4 }}>
                  {it
                    ? `${isChamp ? '👑 ' : ''}${it.name}  +${it.enhanceLevel}  ✦T${it.transcendLevel}`
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
            zIndex: 1,
          }}
        >
          <div style={{ display: 'flex', fontSize: 30, opacity: 0.75 }}>insaengganghwa.com</div>
          <div style={{ display: 'flex', fontSize: 64, fontWeight: 800, color: '#ffd47a' }}>
            ⚔️ {formatCompactKR(total)}
          </div>
        </div>
      </div>
    ),
    { ...size, headers: { 'cache-control': 'no-store, max-age=0, must-revalidate' } },
  );
}
