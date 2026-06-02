import { ImageResponse } from 'next/og';
import { and, eq, isNotNull, or } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { profiles } from '@/lib/db/schema/profiles';
import { userProfiles } from '@/lib/db/schema/avatar';
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
  // shareCode = 불변 공개 코드(신규) 또는 닉네임(레거시 링크 하위호환).
  const handle = decodeURIComponent(shareCode);
  const origin = url.origin;
  // 카카오 공유 query — focus=piece면 sprite 1개 강조 모드(아래 분기).
  const focus = url.searchParams.get('focus'); // 'piece' | 'set' | null
  const focusCode = url.searchParams.get('code') ?? '';
  const focusLvl = Number(url.searchParams.get('lvl') ?? 0);
  const focusT = Number(url.searchParams.get('t') ?? 0);

  const [prof] = await db
    .select({
      id: profiles.id,
      nickname: profiles.nickname,
      activeProfileId: profiles.activeProfileId,
    })
    .from(profiles)
    .where(or(eq(profiles.publicCode, handle), eq(profiles.nickname, handle)))
    .limit(1);

  // 카드 표시 닉네임 — 조회된 현재 닉(없으면 핸들 폴백).
  const nickname = prof?.nickname ?? handle;

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

  // 대표 프로필 캐릭터 이미지(rotations[active_direction]) — 있으면 OG에 합성.
  let charUri: string | null = null;
  if (prof?.activeProfileId) {
    const [up] = await db
      .select({
        rotations: userProfiles.rotations,
        activeDirection: userProfiles.activeDirection,
      })
      .from(userProfiles)
      .where(eq(userProfiles.id, prof.activeProfileId))
      .limit(1);
    if (up) {
      const rot = up.rotations as Record<string, string>;
      const u = rot[up.activeDirection];
      if (u) charUri = await dataUri(u);
    }
  }

  // ── focus=piece 모드 — 단일 아이템 강조(sprite 큼 + 레벨 강조). 카카오 공유 query. ──
  if (focus === 'piece' && focusCode) {
    // piece 모드 전용 배경(og-pool 랜덤) + root 패딩. set 모드는 카드 컨테이너 사용.
    const bgUri = await dataUri(`${origin}/og/og-${1 + Math.floor(Math.random() * BG_POOL)}.png`);
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
            {/* scrim 제거(2026-05-20 사용자 결정) — 배경이 자체 분위기로 보이도록 */}
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
              boxShadow: ts
                ? ts.hasGlow
                  ? `0 0 72px rgba(${tr},${tg},${tb},0.7), 0 0 36px rgba(255,238,190,0.6)`
                  : `0 0 48px rgba(${tr},${tg},${tb},0.55)`
                : 'none',
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

  // ── set 카드 — me/page 프로필 섹션 + BoastModal 미리보기와 동일 구성 ──
  // root(1200×630) 자체를 카드로 사용해 빈 공간 0(사용자 결정 2026-05-31).
  // 좌(2/5) 닉네임+캐릭터 · 우(3/5) 장비 3종. 별 장식·rarityStarsOG 사용 안 함(미리보기와 동일).
  const rootPad = 48;
  const innerW = 1200 - rootPad * 2; // 1104
  const innerH = 630 - rootPad * 2; // 534
  const gapX = 24;
  const leftW = Math.round((innerW - gapX) * 0.4); // ≈ 432
  const rightW = innerW - gapX - leftW; // ≈ 648
  const slotGap = 16;
  const slotH = Math.round((innerH - slotGap * 2) / 3); // ≈ 167
  const nicknameH = 44;
  const charBoxH = innerH - nicknameH - 12; // 478 — gap 12 빼고
  const charBoxW = leftW;
  // 캐릭터를 박스보다 크게 그리되 우측 장비 박스 시작점(rootPad+leftW+gap = 504px)
  // 침범 최소화. Satori는 img transform: scale + translateY가 의도대로 적용 안 되는
  // 경우가 있어 픽셀 단위 width/height + absolute bottom으로 직접 제어.
  // enlargedH(720) > charBoxH(478) → sprite contain의 머리 위 빈 영역이 카드 padding
  // 위쪽으로 자연스럽게 침범(시각적 무해). bottom -48로 발이 카드 outer bottom 근접.
  const enlargedW = 660;
  const enlargedH = 792;
  const charLeftOffset = Math.round((charBoxW - enlargedW) / 2); // -114
  // 박스 height(478)의 ~20% — sprite 캔버스 아래쪽 빈 공간을 카드 padding 영역으로
  // 밀어내 캐릭터 본체를 카드 아래쪽에 가깝게 노출.
  const charBottomLift = 96;

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        padding: rootPad,
        // me/page 카드와 동일 — zinc-800 border 효과는 root 외곽이라 생략(카카오 카드 외곽이 곧 경계).
        background: 'linear-gradient(180deg,#18181b 0%,#09090b 100%)',
        fontFamily: 'sans-serif',
        color: '#fafafa',
        alignItems: 'stretch',
        gap: gapX,
      }}
    >
      {/* 좌(2/5) — 머리 위 닉네임 + 캐릭터 (overflow visible — 무기/소품 잘림 방지) */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          width: leftW,
          gap: 12,
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: 34,
            fontWeight: 400,
            color: '#ffffff',
            maxWidth: leftW - 8,
            overflow: 'hidden',
          }}
        >
          {nickname}
        </div>
        <div
          style={{
            position: 'relative',
            display: 'flex',
            width: charBoxW,
            height: charBoxH,
          }}
        >
          {charUri ? (
            <img
              src={charUri}
              width={enlargedW}
              height={enlargedH}
              style={{
                position: 'absolute',
                bottom: -charBottomLift,
                left: charLeftOffset,
                width: enlargedW,
                height: enlargedH,
                objectFit: 'contain',
                objectPosition: 'center bottom',
              }}
            />
          ) : (
            <div
              style={{
                display: 'flex',
                width: '100%',
                height: '100%',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 140,
                opacity: 0.4,
              }}
            >
              ✨
            </div>
          )}
        </div>
      </div>

      {/* 우(3/5) — 장비 3종 카드 (sprite 좌 + 이름·레벨 우). 별 장식 없음(미리보기와 동일). */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: rightW,
          gap: slotGap,
        }}
      >
        {SLOTS.map((s) => {
          const it = bySlot.get(s);
          const spr = it ? sprite.get(s) : null;
          const ts = it && it.transcendLevel > 0 ? transcendStyle(it.transcendLevel) : null;
          const [tr, tg, tb] = ts?.colorRgb ?? [0, 0, 0];
          const spriteBox = 116;
          if (!it) {
            return (
              <div
                key={s}
                style={{
                  display: 'flex',
                  width: rightW,
                  height: slotH,
                  alignItems: 'center',
                  gap: 20,
                  paddingLeft: 20,
                  paddingRight: 20,
                  borderRadius: 20,
                  border: '2px dashed rgba(255,255,255,0.15)',
                  background: 'rgba(255,255,255,0.02)',
                  color: 'rgba(255,255,255,0.45)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    width: 76,
                    height: 76,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 14,
                    background: 'rgba(255,255,255,0.05)',
                    fontSize: 42,
                  }}
                >
                  {EMOJI[s]}
                </div>
                <div style={{ display: 'flex', fontSize: 30 }}>
                  {s === 'weapon' ? '무기' : s === 'armor' ? '방어구' : '장신구'} 미장착
                </div>
              </div>
            );
          }
          return (
            <div
              key={s}
              style={{
                display: 'flex',
                width: rightW,
                height: slotH,
                alignItems: 'center',
                gap: 20,
                paddingLeft: 20,
                paddingRight: 20,
                borderRadius: 20,
                border: ts
                  ? `3px solid rgb(${tr},${tg},${tb})`
                  : '2px solid rgba(255,255,255,0.10)',
                background: 'rgba(255,255,255,0.05)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  width: spriteBox,
                  height: spriteBox,
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {spr ? (
                  <img src={spr} width={spriteBox} height={spriteBox} style={{ width: spriteBox, height: spriteBox }} />
                ) : (
                  <span style={{ fontSize: 76, opacity: 0.9 }}>{EMOJI[s]}</span>
                )}
              </div>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  flex: 1,
                  minWidth: 0,
                  gap: 6,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    fontSize: 32,
                    fontWeight: 500,
                    color: 'rgba(255,255,255,0.85)',
                    maxWidth: rightW - spriteBox - 80,
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {it.name}
                </div>
                <div
                  style={{
                    display: 'flex',
                    fontSize: 38,
                    fontWeight: 800,
                    color: '#ffffff',
                  }}
                >
                  +{it.enhanceLevel}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>,
    { ...size, headers: { 'cache-control': 'no-store, max-age=0, must-revalidate' } },
  );
}
