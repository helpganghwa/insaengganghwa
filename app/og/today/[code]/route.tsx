import { ImageResponse } from 'next/og';
import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { profiles } from '@/lib/db/schema/profiles';
import { characters } from '@/lib/db/schema/server';
import { userProfiles } from '@/lib/db/schema/avatar';
import { getTodayTicker, getLifetimeStats } from '@/lib/game/today/stats';
import { randomQuote } from '@/lib/game/today/quotes';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** 같은 배포의 정적 에셋 → base64 data URI(Satori 안정 임베드). 실패=null. */
async function dataUri(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.startsWith('image/')) return null;
    const b64 = Buffer.from(await res.arrayBuffer()).toString('base64');
    return `data:${ct};base64,${b64}`;
  } catch {
    return null;
  }
}

const fmt = (n: number) => n.toLocaleString('ko-KR');

/**
 * 오늘의 성장 카드 OG(2026-07-16 확정 — 기록 증서 B 수정판) — 미리보기·카톡·💾저장이
 * 전부 이 PNG 하나(단일 진실). 중앙 정렬 증서 + 우측 대표 아바타 + 최고/합산/강화 칩.
 */
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const url = new URL(req.url);
  const sRaw = Number(url.searchParams.get('s'));
  const serverId = Number.isInteger(sRaw) && sRaw >= 1 ? sRaw : 1;
  const modeAll = url.searchParams.get('mode') === 'all'; // 전체 탭 공유 — 통산 카드(2026-07-16)

  const [prof] = await db
    .select({ id: profiles.id, nickname: characters.nickname, activeProfileId: characters.activeProfileId })
    .from(profiles)
    .innerJoin(characters, and(eq(characters.userId, profiles.id), eq(characters.serverId, serverId)))
    .where(eq(profiles.publicCode, decodeURIComponent(code)))
    .limit(1);
  if (!prof) return new Response('not found', { status: 404 });

  const [t, life, avatar] = await Promise.all([
    getTodayTicker(prof.id, serverId),
    modeAll ? getLifetimeStats(prof.id, serverId) : Promise.resolve(null),
    (async () => {
      if (!prof.activeProfileId) return null;
      const [up] = await db
        .select({ rotations: userProfiles.rotations })
        .from(userProfiles)
        .where(eq(userProfiles.id, prof.activeProfileId))
        .limit(1);
      const rot = (up?.rotations ?? {}) as Record<string, string>;
      const src = rot.south ?? Object.values(rot)[0];
      // 기본 아바타는 상대경로(/sprites/default/...) — origin 프리픽스 필수(기존 OG와 동일 이슈).
      return src ? dataUri(src.startsWith('http') ? src : `${url.origin}${src}`) : null;
    })(),
  ]);

  const kstDay = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const [y, m, d] = kstDay.split('-');
  const dayKo = '일월화수목금토'[new Date(`${kstDay}T12:00:00Z`).getUTCDay()];

  // 메인 수치 — 전투력 증감 우선, 없으면 강화 통계, 그것도 없으면 현재 전투력.
  // arrow는 숫자보다 작게 분리 렌더(2026-07-16 피드백 — 92px 통짜 ▲가 과대).
  const main = modeAll && life
    ? { arrow: '', big: fmt(life.combat), color: '#fbbf24', sub: `${life.joinedDays}일째 인생강화 · 전투력` }
    : t.combatDelta && t.combatDelta !== 0
      ? { arrow: t.combatDelta > 0 ? '▲' : '▼', big: fmt(Math.abs(t.combatDelta)), color: t.combatDelta > 0 ? '#34d399' : '#f87171', sub: `전투력 ${t.combatDelta > 0 ? '상승' : '변동'} · 현재 ${fmt(t.combat)}` }
      : t.attempts > 0
        ? { arrow: '', big: `강화 ${t.attempts}회`, color: '#fbbf24', sub: `성공 ${t.success} · 유지 ${t.hold} · 하락 ${t.down}` }
        : { arrow: '', big: fmt(t.combat), color: '#fbbf24', sub: '전투력 — 오늘도 담금질 중' };

  const chips = modeAll && life
    ? [
        `최고 강화 +${fmt(life.maxEnhance)}`,
        `합산 강화 +${fmt(life.sumEnhance)}`,
        `통산 강화 ${fmt(life.attempts)}회`,
        ...(life.meleeWins > 0 ? [`대난투 우승 ${life.meleeWins}회`] : []),
      ]
    : [
        `최고 강화 +${fmt(t.maxEnhance)}`,
        `합산 강화 +${fmt(t.sumEnhance)}`,
        ...(t.attempts > 0 ? [`강화 ${t.attempts}회 · 성공 ${t.success}`] : []),
      ];

  // '나의 인생강화'(mode=all) — 좌측 텍스트(중앙 정렬) / 우측 아바타 2분할(2026-07-19 B안 확정).
  if (modeAll) {
    return new ImageResponse(
      (
        <div
          style={{
            width: '100%', height: '100%', display: 'flex', flexDirection: 'row',
            background: 'linear-gradient(160deg, #131a2b 0%, #0a0c12 60%)',
          }}
        >
          {/* 좌측 — 텍스트 컬럼 */}
          <div
            style={{
              display: 'flex', flexDirection: 'column', justifyContent: 'center',
              alignItems: 'center', width: 690, paddingLeft: 40, paddingRight: 10,
            }}
          >
            <div style={{ display: 'flex', fontSize: 30, fontWeight: 800, color: '#fbbf24', letterSpacing: 14 }}>
              나의 인생강화
            </div>
            <div style={{ display: 'flex', width: 120, height: 3, background: 'rgba(245,158,11,0.5)', marginTop: 20 }} />
            <div style={{ display: 'flex', fontSize: 44, fontWeight: 700, color: '#e7e5e4', marginTop: 24 }}>
              {prof.nickname}
            </div>
            <div style={{ display: 'flex', fontSize: 23, color: '#78716c', marginTop: 10 }}>{randomQuote()}</div>
            <div style={{ display: 'flex', fontSize: 92, fontWeight: 800, color: main.color, marginTop: 18 }}>
              {main.big}
            </div>
            <div style={{ display: 'flex', fontSize: 26, color: '#a8a29e', marginTop: 4 }}>{main.sub}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 26, maxWidth: 600 }}>
              {chips.map((c) => (
                <div
                  key={c}
                  style={{
                    display: 'flex', fontSize: 21, color: '#d6d3d1', padding: '9px 20px',
                    background: 'rgba(255,255,255,0.07)', borderRadius: 999,
                  }}
                >
                  {c}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', fontSize: 20, color: '#57534e', marginTop: 30 }}>
              {`${y}. ${Number(m)}. ${Number(d)} (${dayKo}) · ganghwa.app`}
            </div>
          </div>
          {/* 우측 — 아바타 컬럼(바닥 정렬) */}
          <div
            style={{
              display: 'flex', flex: 1, alignItems: 'flex-end', justifyContent: 'center',
              paddingBottom: 0,
            }}
          >
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatar}
                width={500}
                height={600}
                style={{ objectFit: 'contain', opacity: 0.96 }}
              />
            ) : null}
          </div>
        </div>
      ),
      size,
    );
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', position: 'relative',
          paddingTop: 8, paddingBottom: 8,
          // 이미지 프레임 폐기(2026-07-16) — CSS 그라데이션 + 아바타 후광만.
          background: 'linear-gradient(160deg, #131a2b 0%, #0a0c12 60%)',
        }}
      >
        {/* 우측 아바타 — 배경 요소 */}
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatar}
            width={552}
            height={620}
            style={{ position: 'absolute', right: -85, bottom: 5, objectFit: 'contain', opacity: 0.94 }}
          />
        ) : null}

        <div style={{ display: 'flex', fontSize: 30, fontWeight: 800, color: '#fbbf24', letterSpacing: 18 }}>
          오늘의 인생강화
        </div>
        <div style={{ display: 'flex', width: 120, height: 3, background: 'rgba(245,158,11,0.5)', marginTop: 22 }} />
        <div style={{ display: 'flex', fontSize: 44, fontWeight: 700, color: '#e7e5e4', marginTop: 26 }}>
          {prof.nickname}
        </div>
        <div style={{ display: 'flex', fontSize: 24, color: '#78716c', marginTop: 10 }}>{randomQuote()}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 22 }}>
          {main.arrow ? (
            <div style={{ display: 'flex', fontSize: 44, fontWeight: 800, color: main.color, marginTop: 8 }}>{main.arrow}</div>
          ) : null}
          <div style={{ display: 'flex', fontSize: 92, fontWeight: 800, color: main.color }}>{main.big}</div>
        </div>
        <div style={{ display: 'flex', fontSize: 26, color: '#a8a29e', marginTop: 6 }}>{main.sub}</div>
        <div style={{ display: 'flex', gap: 14, marginTop: 30 }}>
          {chips.map((c) => (
            <div
              key={c}
              style={{
                display: 'flex', fontSize: 22, color: '#d6d3d1', padding: '10px 24px',
                background: 'rgba(255,255,255,0.07)', borderRadius: 999,
              }}
            >
              {c}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', fontSize: 20, color: '#57534e', marginTop: 34 }}>
          {`${y}. ${Number(m)}. ${Number(d)} (${dayKo}) · ganghwa.app`}
        </div>
      </div>
    ),
    size,
  );
}
