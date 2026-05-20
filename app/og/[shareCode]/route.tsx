import { ImageResponse } from 'next/og';
import { and, eq, isNotNull } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { profiles } from '@/lib/db/schema/profiles';
import { catalogItems, equipmentInstances } from '@/lib/db/schema/equipment';
import { spritePath } from '@/lib/game/equipment/sprite-manifest';
import { transcendStyle } from '@/lib/game/equipment/transcend';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const EMOJI = { weapon: '⚔️', armor: '🛡️', accessory: '💍' } as const;
const SLOTS = ['weapon', 'armor', 'accessory'] as const;
/** Pixellab 배경 아트 풀 — public/og/og-1..N.png. 부재 시 그라데이션 폴백. */
const BG_POOL = 8;

// rarityCornersOG (inline SVG 별 장식) 제거됨 — Satori가 `<g transform>` 일부와
// preserveAspectRatio 미지원으로 prod에서 500 유발. 슬롯 카드는 등급색 보더 +
// boxShadow 글로우로 등급 표현(이미 적용). sub=0/1 시각 차이는 글로우 강도로 표현.

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
 * 닉네임·착용 3슬롯(실제 스프라이트·초월 등급 테두리)·총 전투력 + Pixellab 배경 랜덤(요청마다).
 * 배경/스프라이트 부재 시 그라데이션/이모지로 안전 폴백 — OG는 절대 실패하지 않음.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ shareCode: string }> }) {
  const { shareCode } = await params;
  const url = new URL(_req.url);
  const nickname = decodeURIComponent(shareCode);
  const origin = url.origin;
  // 카카오 공유 query — focus=piece면 sprite 1개 강조 모드(아래 분기).
  const focus = url.searchParams.get('focus'); // 'piece' | 'set' | null
  const focusCode = url.searchParams.get('code') ?? '';
  const focusLvl = Number(url.searchParams.get('lvl') ?? 0);
  const focusT = Number(url.searchParams.get('t') ?? 0);

  const [prof] = await db
    .select({ id: profiles.id, nickname: profiles.nickname })
    .from(profiles)
    .where(eq(profiles.nickname, nickname))
    .limit(1);

  // 사용자 결정: OG 카드에는 타이틀+닉네임+장비 정보만 노출(전투력·도메인 제거).
  // 따라서 codex 합계 쿼리 + total 계산 제거 — OG 응답 빠르게.
  let equipped: {
    slot: string;
    catalogItemId: number;
    code: string;
    name: string;
    enhanceLevel: number;
    transcendLevel: number;
  }[] = [];
  if (prof) {
    equipped = await db
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
      );
  }

  const bySlot = new Map(equipped.map((e) => [e.slot, e]));

  // 배경: 요청마다 진한 랜덤(no-store) — 풀 1개 시도, 부재면 그라데이션.
  const bgUri = await dataUri(`${origin}/og/og-${1 + Math.floor(Math.random() * BG_POOL)}.png`);

  // 위아래 padding을 늘려(64→96) 카카오톡 카드의 cover 크롭(상하 잘림) 안전.
  // 카톡은 1200×630 카드를 ≈5:4 비율로 cover 크롭하는 경우가 있어 상단·하단 약
  // 96~120px이 잘릴 수 있다 → 콘텐츠를 vertical center 그룹화 + 상하 여백 보강.
  const rootBase = {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column' as const,
    color: '#fde9c8',
    padding: '96px 80px',
    fontFamily: 'sans-serif',
    position: 'relative' as const,
  };

  // ── focus=piece 모드 — 단일 아이템 강조(sprite 큼 + 레벨 강조). 카카오 공유 query. ──
  if (focus === 'piece' && focusCode) {
    const sprUri = await dataUri(`${origin}${spritePath(focusCode) ?? ''}`);
    const ts = focusT > 0 ? transcendStyle(focusT) : null;
    const [tr, tg, tb] = ts?.colorRgb ?? [0, 0, 0];
    const headline =
      focusT >= 10
        ? `✦✦✦ 초월 MAX`
        : focusT >= 1
          ? `✦ 초월 T${focusT}`
          : focusLvl >= 99
            ? `전설의 +99`
            : focusLvl >= 50
              ? `✨ +${focusLvl}`
              : `+${focusLvl}`;
    return new ImageResponse(
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
            <div
              style={{
                position: 'absolute', top: 0, left: 0, width: 1200, height: 630,
                background: 'linear-gradient(180deg,rgba(8,6,4,0.62) 0%,rgba(10,7,4,0.42) 50%,rgba(8,6,4,0.62) 100%)',
                display: 'flex',
              }}
            />
          </>
        ) : null}
        <div
          style={{
            display: 'flex', fontSize: 44, fontWeight: 800, color: '#fde9c8',
            letterSpacing: 2, justifyContent: 'center',
          }}
        >
          ⚒️ 인생강화
        </div>
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1,
            marginTop: 16,
          }}
        >
          <div
            style={{
              position: 'relative',
              width: 360, height: 360, display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 32, background: 'rgba(0,0,0,0.32)',
              border: ts ? `8px solid rgb(${tr},${tg},${tb})` : '3px solid rgba(255,255,255,0.10)',
              boxShadow: ts ? `0 0 48px rgba(${tr},${tg},${tb},0.55)` : 'none',
              overflow: 'hidden',
            }}
          >
            {sprUri ? (
              <img src={sprUri} width={320} height={320} style={{ width: 320, height: 320 }} />
            ) : (
              <span style={{ fontSize: 200, opacity: 0.5 }}>❔</span>
            )}
            {/* 초월 별 장식은 Satori 제약으로 제거됨 — 등급은 보더 색 + boxShadow로 표현. */}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 'auto' }}>
          <div style={{ display: 'flex', fontSize: 96, fontWeight: 800, color: '#ffd47a' }}>{headline}</div>
        </div>
      </div>,
      { ...size, headers: { 'cache-control': 'no-store, max-age=0, must-revalidate' } },
    );
  }
  // 슬롯 스프라이트 data URI 선해결(Satori는 동기 렌더).
  const sprite = new Map<string, string | null>();
  await Promise.all(
    [...bySlot.values()].map(async (it) => {
      const p = spritePath(it.code);
      sprite.set(it.slot, p ? await dataUri(`${origin}${p}`) : null);
    }),
  );

  return new ImageResponse(
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
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: 1200,
              height: 630,
              objectFit: 'cover',
            }}
          />
          {/* 가독성 스크림 — 좌측·상단 까만 쏠림 제거. 전체 균등 vertical 그라데이션. */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: 1200,
              height: 630,
              background:
                'linear-gradient(180deg,rgba(8,6,4,0.62) 0%,rgba(10,7,4,0.42) 50%,rgba(8,6,4,0.62) 100%)',
              display: 'flex',
            }}
          />
        </>
      ) : null}

      {/* 콘텐츠 wrapper — flex:1 + justifyContent:center로 카드 vertical 중앙.
          카카오톡이 1200×630을 ~5:4 cover 크롭하더라도 콘텐츠가 중앙에 있어 보호됨. */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          justifyContent: 'center',
          gap: 44,
        }}
      >
      {/* 헤더 — 타이틀만(닉네임 제거, 사용자 결정). 가운데 정렬. */}
      <div
        style={{
          display: 'flex',
          fontSize: 56,
          fontWeight: 800,
          color: '#fde9c8',
          letterSpacing: 2,
          justifyContent: 'center',
        }}
      >
        ⚒️ 인생강화
      </div>

      {/* 3 슬롯 가로 배치 — 각 슬롯은 sprite(위) + 이름+레벨(아래) column. */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          gap: 28,
          justifyContent: 'space-between',
        }}
      >
        {SLOTS.map((s) => {
          const it = bySlot.get(s);
          const spr = it ? sprite.get(s) : null;
          // 초월은 등급색 정적 테두리로 표현(✦T 텍스트 제거). OG는 절차적 프레임
          // 불가 → transcendStyle 색. T0=테두리 없음. [[transcend-no-text-label]]
          const ts = it && it.transcendLevel > 0 ? transcendStyle(it.transcendLevel) : null;
          const [tr, tg, tb] = ts?.colorRgb ?? [0, 0, 0];
          return (
            <div
              key={s}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                flex: 1,
                gap: 14,
              }}
            >
              <div
                style={{
                  position: 'relative',
                  width: 220,
                  height: 220,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 24,
                  background: 'rgba(0,0,0,0.36)',
                  border: ts
                    ? `6px solid rgb(${tr},${tg},${tb})`
                    : '3px solid rgba(255,255,255,0.12)',
                  boxShadow: ts ? `0 0 32px rgba(${tr},${tg},${tb},0.55)` : 'none',
                  overflow: 'hidden',
                }}
              >
                {spr ? (
                  <img src={spr} width={184} height={184} style={{ width: 184, height: 184 }} />
                ) : (
                  <span style={{ fontSize: 108, opacity: it ? 1 : 0.4 }}>{EMOJI[s]}</span>
                )}
                {/* 초월 별 장식은 Satori 제약으로 제거됨 — 등급은 보더 색 + boxShadow로 표현. */}
              </div>
              <div
                style={{
                  display: 'flex',
                  fontSize: 26,
                  fontWeight: 700,
                  opacity: it ? 1 : 0.4,
                  maxWidth: 260,
                  textAlign: 'center',
                  overflow: 'hidden',
                  justifyContent: 'center',
                }}
              >
                {it ? `${it.name} +${it.enhanceLevel}` : '미장착'}
              </div>
            </div>
          );
        })}
      </div>
      </div>
    </div>,
    { ...size, headers: { 'cache-control': 'no-store, max-age=0, must-revalidate' } },
  );
}
