import { ImageResponse } from 'next/og';
import { DEFAULT_SERVER_ID } from '@/lib/game/servers';
import { and, eq, isNotNull } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { profiles } from '@/lib/db/schema/profiles';
import { characters } from '@/lib/db/schema/server';
import { userProfiles } from '@/lib/db/schema/avatar';
import { catalogItems, userEquipment } from '@/lib/db/schema/equipment';
import { getUserGuildBrief } from '@/lib/game/guild';
import { spritePath } from '@/lib/game/equipment/sprite-manifest';
import { transcendStyle } from '@/lib/game/equipment/transcend';
import { REGION_COLOR } from '@/components/ExecutorTag';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const EMOJI = { weapon: '⚔️', armor: '🛡️', accessory: '💍' } as const;
const SLOTS = ['weapon', 'armor', 'accessory'] as const;

// 해방 후광은 OG(satori)에서 제외 — satori는 box-shadow(사각/원형)만 지원해 아이템 실루엣을
// 따라가는 후광이 불가(filter: drop-shadow 미지원). 박스/원형 후광은 아이템과 안 맞아 제거.


const STAR_POINTS = '50,8 60,42 92,50 60,58 50,92 40,58 8,50 40,42';
/** 인라인 SVG 별 — satori 기본 폰트엔 ✦(U+2726)가 없어 깨지므로 텍스트 대신 별 도형을 쓴다. */
function starSvg(color: string, px: number) {
  return (
    <svg width={px} height={px} viewBox="0 0 100 100" style={{ display: 'flex' }}>
      <polygon points={STAR_POINTS} fill={color} />
    </svg>
  );
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
 * 동적 OG 카드 — WIREFRAMES §10.1 / CLAUDE §3.7. /u/<publicCode> og:image.
 * shareCode = 불변 publicCode(신규) 또는 닉네임(레거시 링크 하위호환). 착용 3슬롯(실제 스프라이트·
 * 초월 등급 테두리)·총 전투력 + Pixellab 배경 랜덤(요청마다). 배경/스프라이트 부재 시
 * 그라데이션/이모지로 안전 폴백 — OG는 절대 실패하지 않음.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ shareCode: string }> }) {
  const { shareCode } = await params;
  const url = new URL(_req.url);
  // shareCode = 불변 공개 코드(신규) 또는 닉네임(레거시 링크 하위호환).
  const handle = decodeURIComponent(shareCode);
  const origin = url.origin;
  // 서버 파라미터(SERVER.md §1) — 서버별 캐릭터 카드. 비정상/미지정 = 기본 1.
  const sRaw = Number(url.searchParams.get('s'));
  const serverId = Number.isInteger(sRaw) && sRaw >= 1 && sRaw <= 32767 ? sRaw : DEFAULT_SERVER_ID;

  const [prof] = await db
    .select({
      id: profiles.id,
      nickname: characters.nickname,
      activeProfileId: characters.activeProfileId,
    })
    .from(profiles)
    .innerJoin(
      characters,
      and(eq(characters.userId, profiles.id), eq(characters.serverId, serverId)),
    )
    // publicCode 단일 해석(감사 P-A7) — 닉네임 폴백 제거(닉변+재취득 오귀속 차단). 없으면 폴백 카드.
    .where(eq(profiles.publicCode, handle))
    .limit(1);

  // 카드 표시 닉네임 — 조회된 현재 닉(없으면 핸들 폴백).
  const nickname = prof?.nickname ?? handle;
  // 길드 문양+이름(있으면 닉네임 밑). 실패해도 카드는 생성.
  const guild = prof ? await getUserGuildBrief(prof.id, serverId).catch(() => null) : null;

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
        enhanceLevel: userEquipment.enhanceLevel,
        transcendLevel: userEquipment.transcendLevel,
      })
      .from(userEquipment)
      .innerJoin(catalogItems, eq(userEquipment.catalogItemId, catalogItems.id))
      .where(
        and(
          eq(userEquipment.userId, prof.id),
          eq(userEquipment.serverId, serverId),
          isNotNull(userEquipment.equippedSlot),
        ),
      );
  }

  const bySlot = new Map(equipped.map((e) => [e.slot, e]));

  // 대표 프로필 캐릭터 이미지(rotations.south, 정면) — 있으면 OG에 합성.
  let charUri: string | null = null;
  if (prof?.activeProfileId) {
    const [up] = await db
      .select({
        rotations: userProfiles.rotations,
      })
      .from(userProfiles)
      .where(eq(userProfiles.id, prof.activeProfileId))
      .limit(1);
    if (up) {
      const rot = up.rotations as Record<string, string>;
      const u = rot.south ?? Object.values(rot)[0]; // 항상 정면(south)
      // 기본 아바타(대장장이 남/여)는 rotations가 상대경로(/sprites/default/...)로 저장된다.
      // dataUri.fetch는 절대 URL만 받으므로 origin을 붙여야 한다 — 안 붙이면 기본 아바타 유저의
      // OG 캐릭터가 통째로 ✨ 폴백으로 빠졌다(커스텀 아바타는 Supabase 절대 URL이라 무영향).
      if (u) charUri = await dataUri(u.startsWith('http') ? u : `${origin}${u}`);
    }
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
  // 좌(2/5) 닉네임+캐릭터 · 우(3/5) 장비 3종. 별 장식 없음(미리보기와 동일).
  const rootPad = 48;
  const innerW = 1200 - rootPad * 2; // 1104
  const innerH = 630 - rootPad * 2; // 534
  const gapX = 24;
  const leftW = Math.round((innerW - gapX) * 0.4); // ≈ 432
  const rightW = innerW - gapX - leftW; // ≈ 648
  const slotGap = 16;
  // 상단 한 줄 헤더(2026-07-22) — 닉네임 + 문양 + 길드명 + 구역명 집행관을 전체폭 한 줄로.
  // 좌측 열(432px) 안에서는 최장 케이스(닉8·길드8·구역8자)가 넘쳐서 전체폭(1104px)으로 올렸다.
  // 아래 본문은 기존 2/5 : 3/5 유지 — 헤더가 빠진 만큼 캐릭터 박스가 오히려 커진다.
  const headerH = 50;
  const headerGap = 16;
  const bodyH = innerH - headerH - headerGap;
  const slotH = Math.round((bodyH - slotGap * 2) / 3); // ≈ 145
  const charBoxH = bodyH;
  const charBoxW = leftW;
  // v3 풀프레임 아바타 — /me 프로필 섹션처럼 박스를 꽉 채움. 정사각 아바타를 박스 높이에 맞춰
  // (세로 풀필) 가로 중앙·하단 정렬(가로 약간 넘치면 카드 안쪽으로 자연 침범). Satori는 img
  // transform이 불안정해 픽셀 width/height로 직접 제어.
  const charSide = charBoxH;
  const enlargedW = charSide;
  const enlargedH = charSide;
  const charLeftOffset = Math.round((charBoxW - charSide) / 2);
  const charBottomLift = 0;

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        padding: rootPad,
        // me/page 카드와 동일 — zinc-800 border 효과는 root 외곽이라 생략(카카오 카드 외곽이 곧 경계).
        background: 'linear-gradient(180deg,#18181b 0%,#09090b 100%)',
        fontFamily: 'sans-serif',
        color: '#fafafa',
      }}
    >
      {/* 상단 — 닉네임 + 문양 + 길드명 + 구역명 집행관을 전체폭 한 줄 중앙 정렬 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: headerH,
          gap: 14,
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', fontSize: 40, fontWeight: 700, color: '#ffffff' }}>{nickname}</div>
        {guild?.emblemUrl ? (
          <img src={guild.emblemUrl} width={32} height={32} style={{ objectFit: 'contain' }} />
        ) : null}
        {guild?.name ? (
          <div style={{ display: 'flex', fontSize: 26, color: 'rgba(255,255,255,0.78)' }}>{guild.name}</div>
        ) : null}
        {guild?.name && guild?.executorZone ? (
          <div style={{ display: 'flex', fontSize: 26, color: 'rgba(255,255,255,0.35)' }}>·</div>
        ) : null}
        {guild?.executorZone ? (
          <div style={{ display: 'flex', fontSize: 26 }}>
            <span style={{ color: REGION_COLOR[guild.executorZoneRegion ?? ''] ?? '#a5b4fc' }}>
              {guild.executorZone}
            </span>
            <span style={{ color: '#a5b4fc' }}>&nbsp;집행관</span>
          </div>
        ) : null}
      </div>

      {/* 본문 — 좌(2/5) 캐릭터 · 우(3/5) 장비 3종 */}
      <div style={{ display: 'flex', alignItems: 'stretch', gap: gapX, marginTop: headerGap }}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          width: leftW,
        }}
      >
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ display: 'flex', fontSize: 38, fontWeight: 800, color: '#ffffff' }}>
                    +{it.enhanceLevel}
                  </span>
                  {ts ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {starSvg(`rgb(${tr},${tg},${tb})`, 30)}
                      <span style={{ display: 'flex', fontSize: 34, fontWeight: 800, color: `rgb(${tr},${tg},${tb})` }}>
                        {it.transcendLevel}
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      </div>
    </div>,
    {
      ...size,
      // 엣지 캐시 1h + SWR 1d — 크롤 반복 재연산 차단(감사 C4).
      headers: { 'cache-control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
    },
  );
}
