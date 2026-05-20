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

// 초월 별 장식 — 4 모서리 등급색 별. Satori 호환을 위해 단순 SVG <polygon>
// (transform 없음). sub=1(짝수 등급)이면 인벤토리 RarityFrame과 동일하게 위성 별
// **3개**(코너 안쪽 우/하/대각). 4 모서리에 같은 구성 + mirror로 안쪽 향함.
const STAR_POINTS = '50,8 60,42 92,50 60,58 50,92 40,58 8,50 40,42';
function rarityStarsOG(
  colorRgb: readonly [number, number, number],
  sub: 0 | 1,
  cornerPx: number,
): React.ReactElement[] {
  const [r, g, b] = colorRgb;
  const color = `rgb(${r},${g},${b})`;
  const accent = `rgb(${Math.round(r + (255 - r) * 0.55)},${Math.round(g + (255 - g) * 0.55)},${Math.round(b + (255 - b) * 0.55)})`;
  const big = Math.round(cornerPx * 0.7);
  const sat = Math.round(cornerPx * 0.32); // 위성 별 — 큰 별 절반보다 작게
  const satTiny = Math.round(cornerPx * 0.24); // 안쪽 대각 위성 — 가장 작게
  // 위성 별 3개 위치(좌상 코너 기준). 4 모서리는 top/bottom·left/right swap.
  // 인벤토리 RarityFrame과 같은 구성: (14.5,4.5), (4.5,14.5), (13.5,13.5)을 cornerPx로 환산.
  const satOff1 = Math.round(cornerPx * 0.48); // 큰 별 안쪽 우측(또는 하단) 위성
  const satOff2 = Math.round(cornerPx * 0.05); // 큰 별 옆/위 위성의 다른 축 가까운 값
  const satMidOff = Math.round(cornerPx * 0.42); // 대각 위성
  // edge map — top:0/left:0 (좌상) 기준. 각 코너별로 top/left 키를 bottom/right로 swap.
  type Edge = { e1: 'top' | 'bottom'; e2: 'left' | 'right' };
  const edges: Edge[] = [
    { e1: 'top', e2: 'left' }, // 좌상
    { e1: 'top', e2: 'right' }, // 우상
    { e1: 'bottom', e2: 'left' }, // 좌하
    { e1: 'bottom', e2: 'right' }, // 우하
  ];
  const els: React.ReactElement[] = [];
  for (let i = 0; i < edges.length; i++) {
    const { e1, e2 } = edges[i]!;
    // 큰 별 — 코너에 붙임
    els.push(
      <div
        key={`s${i}`}
        style={{
          position: 'absolute',
          display: 'flex',
          width: big,
          height: big,
          [e1]: 0,
          [e2]: 0,
        }}
      >
        <svg width={big} height={big} viewBox="0 0 100 100">
          <polygon points={STAR_POINTS} fill={color} />
        </svg>
      </div>,
    );
    if (sub === 1) {
      // 위성 1: 큰 별의 안쪽 e2 방향(좌상이면 우측, 우상이면 좌측 ...)
      els.push(
        <div
          key={`a${i}-1`}
          style={{
            position: 'absolute',
            display: 'flex',
            width: sat,
            height: sat,
            [e1]: satOff2,
            [e2]: satOff1,
          }}
        >
          <svg width={sat} height={sat} viewBox="0 0 100 100">
            <polygon points={STAR_POINTS} fill={accent} />
          </svg>
        </div>,
      );
      // 위성 2: 안쪽 e1 방향(좌상이면 아래, 좌하이면 위 ...)
      els.push(
        <div
          key={`a${i}-2`}
          style={{
            position: 'absolute',
            display: 'flex',
            width: sat,
            height: sat,
            [e1]: satOff1,
            [e2]: satOff2,
          }}
        >
          <svg width={sat} height={sat} viewBox="0 0 100 100">
            <polygon points={STAR_POINTS} fill={accent} />
          </svg>
        </div>,
      );
      // 위성 3: 대각 안쪽(가장 작음) — 큰 별의 카드 중심 쪽 대각
      els.push(
        <div
          key={`a${i}-3`}
          style={{
            position: 'absolute',
            display: 'flex',
            width: satTiny,
            height: satTiny,
            [e1]: satMidOff,
            [e2]: satMidOff,
          }}
        >
          <svg width={satTiny} height={satTiny} viewBox="0 0 100 100">
            <polygon points={STAR_POINTS} fill={accent} />
          </svg>
        </div>,
      );
    }
  }
  return els;
}

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

  // 카톡 카드의 cover 크롭(상하 ~120px / 좌우 ~130px 잘림) 안전을 위한 큰 padding.
  // 콘텐츠가 어느 비율에서도 잘리지 않게 중앙 940×~390 영역 안에 배치.
  const rootBase = {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column' as const,
    color: '#fde9c8',
    padding: '160px 160px',
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
                background: 'radial-gradient(ellipse 70% 60% at 50% 50%,rgba(0,0,0,0.25) 0%,rgba(8,6,4,0.78) 100%)',
                display: 'flex',
              }}
            />
          </>
        ) : null}
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1,
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
            {/* 초월 별 장식 — 4 모서리(폰트 ✦, Satori 호환). 큰 카드라 cornerPx 90. */}
            {ts ? rarityStarsOG(ts.colorRgb, ts.sub as 0 | 1, 90) : null}
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
                'radial-gradient(ellipse 70% 60% at 50% 50%,rgba(0,0,0,0.25) 0%,rgba(8,6,4,0.78) 100%)',
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
      {/* 헤더 제거(사용자 결정 2026-05-20) — 타이틀 없이 슬롯 정보만. */}

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
                  width: 170,
                  height: 170,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 20,
                  background: 'rgba(0,0,0,0.36)',
                  border: ts
                    ? `6px solid rgb(${tr},${tg},${tb})`
                    : '3px solid rgba(255,255,255,0.12)',
                  boxShadow: ts ? `0 0 32px rgba(${tr},${tg},${tb},0.55)` : 'none',
                  overflow: 'hidden',
                }}
              >
                {spr ? (
                  <img src={spr} width={140} height={140} style={{ width: 140, height: 140 }} />
                ) : (
                  <span style={{ fontSize: 84, opacity: it ? 1 : 0.4 }}>{EMOJI[s]}</span>
                )}
                {/* 초월 별 장식 — 4 모서리. cornerPx 48 (위성 3개 인벤토리 동일). */}
                {ts ? rarityStarsOG(ts.colorRgb, ts.sub as 0 | 1, 48) : null}
              </div>
              <div
                style={{
                  display: 'flex',
                  fontSize: 24,
                  fontWeight: 700,
                  opacity: it ? 1 : 0.4,
                  maxWidth: 240,
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
