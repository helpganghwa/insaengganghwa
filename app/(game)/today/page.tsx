import Link from 'next/link';
import { eq, and } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { getActiveServerId } from '@/lib/game/servers';
import { withTimeout } from '@/lib/db/with-timeout';
import { db } from '@/lib/db/client';
import { profiles } from '@/lib/db/schema/profiles';
import { characters } from '@/lib/db/schema/server';
import { getTodayDetail, getLifetimeStats, getRankHistory, type RankPoint } from '@/lib/game/today/stats';
import { getWorldFeed } from '@/lib/game/world/event';
import { worldEventMessage, fmtWorldTime } from '@/app/(game)/world-message';

import { TodayShareBox } from './TodayShareBox';
import { RankChartClient } from './RankChartClient';
import { transcendStyle } from '@/lib/game/equipment/transcend';

/**
 * 오늘의 인생강화(0120) — 오늘/전체 2탭(7·30일 폐기, 2026-07-16). 게임 카드 톤으로 컴팩트하게:
 * 섹션 = 옅은 채움 카드 + 인라인 타이틀, KPI는 숫자 위주. 공유·저장은 오늘 탭 전용.
 */
export const dynamic = 'force-dynamic';

const fmt = (n: number) => n.toLocaleString('ko-KR');

function Delta({ d }: { d: number | null }) {
  if (d == null || d === 0) return <span className="text-[10px] text-zinc-400 dark:text-zinc-600">—</span>;
  return d > 0 ? (
    <span className="text-[10px] font-extrabold text-emerald-500">▲ {fmt(d)}</span>
  ) : (
    <span className="text-[10px] font-extrabold text-red-400">▼ {fmt(-d)}</span>
  );
}

/** 섹션 카드 — 타이틀 인라인 헤더 + 옅은 채움(게임 카드 톤). */
function Card({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-zinc-200/80 bg-zinc-50/60 px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-900/40">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[11px] font-extrabold text-amber-700/90 dark:text-amber-400/90">{title}</h2>
        {aside ? <span className="text-[10px] text-zinc-400 dark:text-zinc-500">{aside}</span> : null}
      </div>
      <div className="mt-1.5">{children}</div>
    </section>
  );
}

/** N열 미니 스탯 — 한 줄 숫자 그리드(행 목록보다 절반 높이). */
function StatGrid({ items, cols = 3 }: { items: { l: string; v: React.ReactNode; s?: React.ReactNode }[]; cols?: number }) {
  return (
    <div className={`grid gap-1.5 ${cols === 4 ? 'grid-cols-4' : cols === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
      {items.map((k) => (
        <div key={k.l} className="rounded-lg bg-white/70 px-1.5 py-1.5 text-center dark:bg-zinc-950/50">
          <div className="text-[9px] text-zinc-500">{k.l}</div>
          <div className="mt-0.5 text-[13px] font-extrabold leading-tight tabular-nums">{k.v}</div>
          {k.s ? <div className="mt-px text-[9px] leading-tight tabular-nums text-zinc-500">{k.s}</div> : null}
        </div>
      ))}
    </div>
  );
}

function EnhanceBar({ success, hold, down, attempts }: { success: number; hold: number; down: number; attempts: number }) {
  if (attempts === 0)
    return <p className="py-0.5 text-center text-[11px] text-zinc-500">아직 강화 기록이 없어요 — 슬롯에 장비를 올려보세요!</p>;
  return (
    <div>
      <div className="flex h-2 gap-px overflow-hidden rounded-full">
        {/* 0인 세그먼트는 아예 미렌더(0.01 flex가 1px 슬리버로 보이던 문제, 2026-07-16) */}
        {success > 0 ? <div style={{ flex: success }} className="bg-emerald-500" /> : null}
        {hold > 0 ? <div style={{ flex: hold }} className="bg-zinc-300 dark:bg-zinc-700" /> : null}
        {down > 0 ? <div style={{ flex: down }} className="bg-red-400" /> : null}
      </div>
      <div className="mt-1 flex items-baseline gap-2.5 text-[10px] tabular-nums text-zinc-500">
        <span className="font-bold text-emerald-600 dark:text-emerald-400">성공 {success}</span>
        <span>유지 {hold}</span>
        <span className={down > 0 ? 'text-red-400' : ''}>하락 {down}</span>
        <span className="ml-auto font-bold">성공률 {Math.round((success / attempts) * 100)}%</span>
      </div>
    </div>
  );
}

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return null;
  const serverId = await getActiveServerId();
  const { p } = await searchParams;
  const tab = p === 'all' ? 'all' : 'today';

  const [me] = await db
    .select({ nickname: characters.nickname, publicCode: profiles.publicCode })
    .from(characters)
    .innerJoin(profiles, eq(profiles.id, characters.userId))
    .where(and(eq(characters.userId, userId), eq(characters.serverId, serverId)))
    .limit(1);

  const kstNow = new Date(Date.now() + 9 * 3600 * 1000);
  const dateLabel = `${kstNow.getUTCMonth() + 1}/${kstNow.getUTCDate()} (${'일월화수목금토'[kstNow.getUTCDay()]})`;

  return (
    <div id="today-page" className="flex flex-col gap-2.5 px-4 py-4 pb-24">
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <h1 className="text-[17px] font-extrabold">오늘의 인생강화</h1>
          <span className="text-[10px] tabular-nums text-zinc-500">{dateLabel}</span>
        </div>
        {/* 오늘/전체 세그먼트 — 타이틀 옆 컴팩트 배치 */}
        <div data-capture-exclude className="flex overflow-hidden rounded-lg border border-zinc-200 text-[11px] font-bold dark:border-zinc-800">
          {(
            [
              { id: 'today', label: '오늘', href: '/today' },
              { id: 'all', label: '전체', href: '/today?p=all' },
            ] as const
          ).map((t) => (
            <Link
              key={t.id}
              href={t.href}
              className={`px-3 py-1 ${
                tab === t.id
                  ? 'bg-amber-500 text-white dark:bg-amber-600'
                  : 'text-zinc-500 dark:text-zinc-400'
              }`}
            >
              {t.label}
            </Link>
          ))}
        </div>
      </div>

      {tab === 'today' ? (
        <TodayTab userId={userId} serverId={serverId} nickname={me?.nickname ?? ''} publicCode={me?.publicCode ?? ''} />
      ) : (
        <AllTab userId={userId} serverId={serverId} nickname={me?.nickname ?? ''} />
      )}
    </div>
  );
}

async function TodayTab({
  userId, serverId, nickname, publicCode,
}: { userId: string; serverId: number; nickname: string; publicCode: string }) {
  const [d, feed] = await Promise.all([
    withTimeout(getTodayDetail(userId, serverId), 3500, 'today.detail').catch(() => null),
    withTimeout(getWorldFeed(serverId, 10), 2000, 'today.feed').catch(() => []),
  ]);
  if (!d) return <p className="py-10 text-center text-sm text-zinc-500">잠시 후 다시 시도해 주세요.</p>;
  const todayIso = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const issues = feed
    .filter((e) => new Date(Date.parse(e.createdAtIso) + 9 * 3600 * 1000).toISOString().slice(0, 10) === todayIso)
    .slice(0, 2);
  const medal = (r: number) => (r === 1 ? '🥇' : r === 2 ? '🥈' : '🥉');
  const kstNow = new Date(Date.now() + 9 * 3600 * 1000);
  const captureDate = `${kstNow.getUTCFullYear()}. ${kstNow.getUTCMonth() + 1}. ${kstNow.getUTCDate()} (${'일월화수목금토'[kstNow.getUTCDay()]})`;
  return (
    <>
      <Card title="어제와 비교" aside="자정 기준">
        {/* 어제 값 → 오늘 값 흐름을 명시(2026-07-16 피드백: '비교되는 느낌' 강화). */}
        <div className="grid grid-cols-3 gap-1.5">
          {(
            [
              { l: '전투력', now: d.combat, delta: d.combatDelta, prefix: '' },
              { l: '최고 강화', now: d.maxEnhance, delta: d.maxDelta, prefix: '+' },
              { l: '합산 강화', now: d.sumEnhance, delta: d.sumDelta, prefix: '+' },
            ] as const
          ).map((k) => (
            <div key={k.l} className="rounded-lg bg-white/70 px-1.5 py-1.5 text-center dark:bg-zinc-950/50">
              <div className="text-[9px] text-zinc-500">{k.l}</div>
              <div className="text-[10px] tabular-nums text-zinc-400 dark:text-zinc-600">
                {k.delta != null ? `어제 ${k.prefix}${fmt(k.now - k.delta)}` : '어제 기록 없음'}
              </div>
              <div className="text-[13px] font-extrabold leading-tight tabular-nums">
                {k.prefix}{fmt(k.now)}
              </div>
              <div className="text-[10px] tabular-nums"><Delta d={k.delta} /></div>
            </div>
          ))}
        </div>
        {/* 랭킹 변화 — 수치 변화와 분리, 3지표(2026-07-16 피드백). */}
        <div className="mt-1.5 grid grid-cols-3 gap-1.5">
          {(
            [
              { l: '전투력 랭킹', p: d.rankChanges.combat },
              { l: '최고 랭킹', p: d.rankChanges.max },
              { l: '합산 랭킹', p: d.rankChanges.sum },
            ] as const
          ).map((k) => (
            <div key={k.l} className="rounded-lg bg-white/70 px-1.5 py-1.5 text-center dark:bg-zinc-950/50">
              <div className="text-[9px] text-zinc-500">{k.l}</div>
              <div className="mt-0.5 text-[12px] font-extrabold tabular-nums">
                {k.p.now == null ? (
                  '—'
                ) : k.p.prev != null && k.p.prev !== k.p.now ? (
                  <>
                    <span className="text-[10px] font-normal text-zinc-400 line-through">#{k.p.prev}</span> #{k.p.now}
                  </>
                ) : (
                  <>#{k.p.now}</>
                )}
              </div>
              <div className="text-[9px] tabular-nums">
                {k.p.now != null && k.p.prev != null && k.p.prev !== k.p.now ? (
                  <span className={k.p.prev > k.p.now ? 'text-emerald-500' : 'text-red-400'}>
                    {k.p.prev > k.p.now ? '▲' : '▼'} {Math.abs(k.p.prev - k.p.now)}
                  </span>
                ) : (
                  <span className="text-zinc-400 dark:text-zinc-600">—</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="오늘의 강화" aside={d.attempts > 0 ? `시도 ${d.attempts}회` : undefined}>
        <EnhanceBar success={d.success} hold={d.hold} down={d.down} attempts={d.attempts} />
      </Card>

      <Card title="오늘의 활동" aside={d.streakDays > 0 ? `🔥 ${d.streakDays}일 연속 출석` : undefined}>
        <StatGrid
          cols={4}
          items={[
            { l: '상자 개봉', v: d.boxesOpened > 0 ? `${d.boxesOpened}개` : '—' },
            { l: '초월 진척', v: d.transcendUps > 0 ? <span className="text-emerald-500">+{d.transcendUps}</span> : '—' },
            { l: '레이드', v: d.raidAttacks > 0 ? `${d.raidAttacks}회` : '—' },
            {
              l: '대난투',
              v: d.melee?.myRank != null ? `#${d.melee.myRank}` : '—',
              s: d.melee?.myRank != null && d.melee.prevRank != null && d.melee.prevRank !== d.melee.myRank ? (
                <span className={d.melee.prevRank > d.melee.myRank ? 'text-emerald-500' : 'text-red-400'}>
                  {d.melee.prevRank > d.melee.myRank ? '▲' : '▼'} {Math.abs(d.melee.prevRank - d.melee.myRank)}
                </span>
              ) : d.melee ? (
                <>{d.melee.total}명 참가</>
              ) : undefined,
            },
          ]}
        />
        {d.melee && d.melee.top3.length > 0 ? (
          <p className="mt-1.5 truncate text-[10px] text-zinc-500">
            {d.melee.top3.map((t) => `${medal(t.rank)} ${t.nickname}`).join('  ')}
          </p>
        ) : null}
      </Card>

      {issues.length > 0 ? (
        <Card title="오늘의 이슈">
          {issues.map((e) => (
            <div key={e.id} className="flex items-baseline justify-between gap-2 py-0.5 text-[11.5px]">
              <span className="min-w-0 flex-1 truncate text-zinc-600 dark:text-zinc-300">{worldEventMessage(e)}</span>
              <span className="shrink-0 font-mono text-[9px] text-zinc-500">{fmtWorldTime(e.createdAtIso).slice(9)}</span>
            </div>
          ))}
        </Card>
      ) : null}

      <TodayShareBox
        nickname={nickname}
        publicCode={publicCode}
        serverId={serverId}
        statsLine={`오늘 ${d.combatDelta && d.combatDelta > 0 ? `전투력 ▲${fmt(d.combatDelta)} · ` : ''}강화 ${d.success}회 성공`}
      />
    </>
  );
}

async function AllTab({ userId, serverId, nickname }: { userId: string; serverId: number; nickname: string }) {
  const [s, history] = await Promise.all([
    withTimeout(getLifetimeStats(userId, serverId), 3500, 'today.all').catch(() => null),
    withTimeout(getRankHistory(userId, serverId), 2000, 'today.rankhist').catch(() => [] as RankPoint[]),
  ]);
  if (!s) return <p className="py-10 text-center text-sm text-zinc-500">잠시 후 다시 시도해 주세요.</p>;
  const rank = (r: number | null) => (r != null ? `#${r}` : undefined);
  return (
    <>
      <Card title={`${nickname}의 대장장이 이력`} aside={`${s.joinedDays}일째 단련 중`}>
        <StatGrid
          items={[
            { l: '전투력', v: fmt(s.combat), s: rank(s.ranks.combat) },
            { l: '최고 강화', v: `+${fmt(s.maxEnhance)}`, s: rank(s.ranks.max) },
            { l: '합산 강화', v: `+${fmt(s.sumEnhance)}`, s: rank(s.ranks.sum) },
          ]}
        />
      </Card>

      <Card title="통산 강화">
        <EnhanceBar success={s.success} hold={s.hold} down={s.down} attempts={s.attempts} />
        <div className="mt-2">
          <StatGrid
            cols={2}
            items={[
              { l: '총 시도', v: `${fmt(s.attempts)}회` },
              { l: '보석 시간 단축', v: s.gemReduces > 0 ? `${fmt(s.gemReduces)}회` : '—' },
            ]}
          />
        </div>
      </Card>

      <Card title="수집과 초월">
        <StatGrid
          cols={4}
          items={[
            { l: '보유 장비', v: `${s.itemKinds}종`, s: `/ ${s.catalogTotal}종` },
            {
              l: '최고 초월',
              v: s.transcendMax > 0 ? (
                <span style={{ color: `rgb(${transcendStyle(s.transcendMax).colorRgb.join(',')})` }}>✦{s.transcendMax}</span>
              ) : (
                '—'
              ),
            },
            { l: '초월 합계', v: s.transcendSum > 0 ? `+${fmt(s.transcendSum)}` : '—' },
            { l: '상자 개봉', v: fmt(s.boxesOpened) },
          ]}
        />
      </Card>

      <Card title="전투 이력">
        <StatGrid
          cols={3}
          items={[
            { l: '레이드 소환', v: s.raidSummons > 0 ? `${fmt(s.raidSummons)}회` : '—' },
            { l: '레이드 공격', v: s.raidAttacks > 0 ? `${fmt(s.raidAttacks)}회` : '—' },
            { l: '레이드 보상', v: s.raidRewards > 0 ? `${fmt(s.raidRewards)}회` : '—' },
          ]}
        />
        <div className="mt-1.5">
          <StatGrid
            cols={3}
            items={[
              { l: '대난투 참가', v: s.meleeJoined > 0 ? `${fmt(s.meleeJoined)}회` : '—' },
              { l: '우승', v: s.meleeWins > 0 ? <span className="text-amber-500">🥇 {s.meleeWins}</span> : '—' },
              { l: '최고 순위', v: s.meleeBest != null ? `#${s.meleeBest}` : '—' },
            ]}
          />
        </div>
      </Card>

      <Card title="랭킹 추이" aside="최근 30일 · 자정 기준">
        {history.length >= 2 ? (
          <RankChartClient points={history} />
        ) : (
          <div className="py-2 text-center">
            {history.length === 1 ? (
              <p className="text-[13px] font-extrabold tabular-nums">현재 전투력 #{history[0]!.combat ?? "-"}</p>
            ) : null}
            <p className="mt-0.5 text-[10.5px] text-zinc-500">내일부터 매일 자정 기록으로 추이가 그려져요.</p>
          </div>
        )}
      </Card>
    </>
  );
}


