import Link from 'next/link';
import { eq, and } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { getActiveServerId } from '@/lib/game/servers';
import { withTimeout } from '@/lib/db/with-timeout';
import { db } from '@/lib/db/client';
import { profiles } from '@/lib/db/schema/profiles';
import { characters } from '@/lib/db/schema/server';
import { getTodayDetail, getPeriodStats, getLifetimeStats } from '@/lib/game/today/stats';
import { getWorldFeed } from '@/lib/game/world/event';
import { worldEventMessage, fmtWorldTime } from '@/app/(game)/world-message';

import { TodayShareBox } from './TodayShareBox';

/**
 * 오늘의 인생강화(0120) — 성장 요약 상세. 탭(오늘/7일/30일/전체)은 searchParam SSR 전환
 * (2026-07-16 확정 시안 + 필터 확장). 공유·저장은 '오늘' 탭 전용(성장 카드 OG 재사용).
 */
export const dynamic = 'force-dynamic';

const fmt = (n: number) => n.toLocaleString('ko-KR');
const TABS = [
  { id: 'today', label: '오늘' },
  { id: '7d', label: '7일' },
  { id: '30d', label: '30일' },
  { id: 'all', label: '전체' },
] as const;
type TabId = (typeof TABS)[number]['id'];

function Delta({ d }: { d: number | null }) {
  if (d == null) return <span className="text-zinc-500">—</span>;
  if (d === 0) return <span className="text-zinc-500">변동 없음</span>;
  return d > 0 ? (
    <span className="font-extrabold text-emerald-500">▲ {fmt(d)}</span>
  ) : (
    <span className="font-extrabold text-red-400">▼ {fmt(-d)}</span>
  );
}

function SecTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-5 mb-1.5 text-[11px] font-extrabold text-zinc-500 dark:text-zinc-400">{children}</h2>;
}

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-zinc-200 px-3 py-2.5 dark:border-zinc-800">{children}</div>;
}

function RowLine({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between border-b border-zinc-100 py-1.5 text-[12.5px] last:border-b-0 dark:border-zinc-900">
      <span className="text-[11px] text-zinc-500">{label}</span>
      <span className="font-bold tabular-nums">{children}</span>
    </div>
  );
}

function EnhanceBar({ success, hold, down, attempts }: { success: number; hold: number; down: number; attempts: number }) {
  if (attempts === 0)
    return <p className="py-1 text-center text-[12px] text-zinc-500">기간 내 강화 기록이 없어요.</p>;
  return (
    <>
      <div className="flex h-2.5 overflow-hidden rounded-md">
        <div style={{ flex: Math.max(success, 0.01) }} className="bg-emerald-500" />
        <div style={{ flex: Math.max(hold, 0.01) }} className="bg-zinc-400 dark:bg-zinc-600" />
        <div style={{ flex: Math.max(down, 0.01) }} className="bg-red-400" />
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-zinc-500">
        <span><span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />성공 {success}</span>
        <span><span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-zinc-400 dark:bg-zinc-600" />유지 {hold}</span>
        <span><span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-red-400" />하락 {down}</span>
        <span className="ml-auto">성공률 {Math.round((success / attempts) * 100)}%</span>
      </div>
    </>
  );
}

export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  const userId = await getSessionUserId();
  if (!userId) return null;
  const serverId = await getActiveServerId();
  const { p } = await searchParams;
  const tab: TabId = (TABS.find((t) => t.id === p)?.id ?? 'today') as TabId;

  const [me] = await db
    .select({ nickname: characters.nickname, publicCode: profiles.publicCode })
    .from(characters)
    .innerJoin(profiles, eq(profiles.id, characters.userId))
    .where(and(eq(characters.userId, userId), eq(characters.serverId, serverId)))
    .limit(1);

  const kstNow = new Date(Date.now() + 9 * 3600 * 1000);
  const dateLabel = `${kstNow.getUTCMonth() + 1}/${kstNow.getUTCDate()} (${'일월화수목금토'[kstNow.getUTCDay()]})`;

  return (
    <div className="px-4 py-4 pb-24">
      <div className="flex items-baseline justify-between">
        <h1 className="text-lg font-extrabold">오늘의 인생강화</h1>
        <span className="text-[10px] tabular-nums text-zinc-500">{dateLabel} · 자정 기준</span>
      </div>

      {/* 기간 탭 — SSR 전환(Link) */}
      <div className="mt-3 grid grid-cols-4 gap-1.5">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={t.id === 'today' ? '/today' : `/today?p=${t.id}`}
            className={`rounded-lg border py-1.5 text-center text-[12px] font-bold ${
              tab === t.id
                ? 'border-amber-500 bg-amber-50 text-amber-700 dark:border-amber-600 dark:bg-amber-950/30 dark:text-amber-300'
                : 'border-zinc-200 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400'
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === 'today' ? (
        <TodayTab userId={userId} serverId={serverId} nickname={me?.nickname ?? ''} publicCode={me?.publicCode ?? ''} />
      ) : tab === 'all' ? (
        <AllTab userId={userId} serverId={serverId} />
      ) : (
        <PeriodTab userId={userId} serverId={serverId} days={tab === '7d' ? 7 : 30} />
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
  if (!d) return <p className="px-4 py-10 text-center text-sm text-zinc-500">잠시 후 다시 시도해 주세요.</p>;
  const todayIso = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const issues = feed.filter((e) => new Date(Date.parse(e.createdAtIso) + 9 * 3600 * 1000).toISOString().slice(0, 10) === todayIso).slice(0, 2);
  const medal = (r: number) => (r === 1 ? '🥇' : r === 2 ? '🥈' : '🥉');
  return (
    <>
      <SecTitle>어제와 비교</SecTitle>
      <div className="grid grid-cols-3 gap-1.5">
        {[
          { l: '전투력', v: fmt(d.combat), delta: d.combatDelta, rank: d.combatRank, prev: d.combatRankPrev },
          { l: '최고 강화', v: `+${fmt(d.maxEnhance)}`, delta: d.maxDelta, rank: null, prev: null },
          { l: '합산 강화', v: `+${fmt(d.sumEnhance)}`, delta: d.sumDelta, rank: null, prev: null },
        ].map((k) => (
          <div key={k.l} className="rounded-xl border border-zinc-200 px-2 py-2 text-center dark:border-zinc-800">
            <div className="text-[10px] text-zinc-500">{k.l}</div>
            <div className="mt-0.5 text-[14px] font-extrabold tabular-nums">{k.v}</div>
            <div className="text-[10px] tabular-nums"><Delta d={k.delta} /></div>
            {k.rank != null ? (
              <div className="text-[9px] text-zinc-500">
                랭킹 {k.prev != null && k.prev !== k.rank ? <>#{k.prev} → <b className={k.prev > k.rank ? 'text-emerald-500' : 'text-red-400'}>#{k.rank}</b></> : <>#{k.rank}</>}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <SecTitle>오늘의 강화 {d.attempts > 0 ? <span className="font-normal text-zinc-400">— 시도 {d.attempts}회</span> : null}</SecTitle>
      <Panel>
        <EnhanceBar success={d.success} hold={d.hold} down={d.down} attempts={d.attempts} />
      </Panel>

      {d.melee ? (
        <>
          <SecTitle>오늘의 대난투 <span className="font-normal text-zinc-400">— 아침 9시</span></SecTitle>
          <Panel>
            <RowLine label="내 순위">
              {d.melee.myRank != null ? (
                <>
                  #{d.melee.myRank} <span className="font-normal text-zinc-500">/ {d.melee.total}명</span>{' '}
                  {d.melee.prevRank != null && d.melee.prevRank !== d.melee.myRank ? (
                    <span className={`text-[10px] ${d.melee.prevRank > d.melee.myRank ? 'text-emerald-500' : 'text-red-400'}`}>
                      {d.melee.prevRank > d.melee.myRank ? '▲' : '▼'} {Math.abs(d.melee.prevRank - d.melee.myRank)}
                    </span>
                  ) : null}
                </>
              ) : (
                <span className="font-normal text-zinc-500">미참가 — 내일 아침부터!</span>
              )}
            </RowLine>
            {d.melee.top3.length > 0 ? (
              <RowLine label="상위 입상">
                {d.melee.top3.map((t) => `${medal(t.rank)} ${t.nickname}`).join(' · ')}
              </RowLine>
            ) : null}
          </Panel>
        </>
      ) : null}

      <SecTitle>오늘의 수집</SecTitle>
      <Panel>
        <RowLine label="보급 상자 개봉">{d.boxesOpened}개</RowLine>
        <RowLine label="초월 진척">{d.transcendUps > 0 ? `+${d.transcendUps}` : '—'}</RowLine>
        <RowLine label="연속 출석">{d.streakDays > 0 ? `🔥 ${d.streakDays}일째` : '—'}</RowLine>
      </Panel>

      {issues.length > 0 ? (
        <>
          <SecTitle>오늘의 이슈</SecTitle>
          <Panel>
            {issues.map((e) => (
              <div key={e.id} className="flex items-baseline justify-between gap-2 border-b border-zinc-100 py-1 text-[11.5px] last:border-b-0 dark:border-zinc-900">
                <span className="min-w-0 flex-1 truncate text-zinc-600 dark:text-zinc-300">{worldEventMessage(e)}</span>
                <span className="shrink-0 font-mono text-[9px] text-zinc-500">{fmtWorldTime(e.createdAtIso).slice(9)}</span>
              </div>
            ))}
          </Panel>
        </>
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

async function PeriodTab({ userId, serverId, days }: { userId: string; serverId: number; days: 7 | 30 }) {
  const s = await withTimeout(getPeriodStats(userId, serverId, days), 3500, 'today.period').catch(() => null);
  if (!s) return <p className="px-4 py-10 text-center text-sm text-zinc-500">잠시 후 다시 시도해 주세요.</p>;
  return (
    <>
      <SecTitle>지난 {days}일의 성장</SecTitle>
      <div className="grid grid-cols-3 gap-1.5">
        {[
          { l: '전투력', node: <Delta d={s.combatDelta} /> },
          { l: '합산 강화', node: s.sumGained !== 0 ? <Delta d={s.sumGained} /> : <span className="text-zinc-500">—</span> },
          { l: '초월', node: s.transcendUps > 0 ? <span className="font-extrabold text-emerald-500">▲ {s.transcendUps}</span> : <span className="text-zinc-500">—</span> },
        ].map((k) => (
          <div key={k.l} className="rounded-xl border border-zinc-200 px-2 py-2.5 text-center dark:border-zinc-800">
            <div className="text-[10px] text-zinc-500">{k.l}</div>
            <div className="mt-1 text-[13px] tabular-nums">{k.node}</div>
          </div>
        ))}
      </div>
      {s.combatDelta == null ? (
        <p className="mt-1.5 text-[10px] text-zinc-500">전투력 비교는 {days === 7 ? '7' : '30'}일 전 기록이 쌓이면 자동으로 표시돼요.</p>
      ) : null}

      <SecTitle>강화 {s.attempts > 0 ? <span className="font-normal text-zinc-400">— 시도 {fmt(s.attempts)}회</span> : null}</SecTitle>
      <Panel>
        <EnhanceBar success={s.success} hold={s.hold} down={s.down} attempts={s.attempts} />
      </Panel>

      <SecTitle>활동</SecTitle>
      <Panel>
        <RowLine label="보급 상자 개봉">{fmt(s.boxesOpened)}개</RowLine>
        <RowLine label="레이드 공격">{s.raidAttacks > 0 ? `${fmt(s.raidAttacks)}회` : '—'}</RowLine>
        <RowLine label="대난투">
          {s.meleeJoined > 0 ? (
            <>
              {s.meleeJoined}회 참가{s.meleeWins > 0 ? ` · 우승 ${s.meleeWins}` : ''}{s.meleeBest != null ? ` · 최고 #${s.meleeBest}` : ''}
            </>
          ) : (
            '—'
          )}
        </RowLine>
      </Panel>
    </>
  );
}

async function AllTab({ userId, serverId }: { userId: string; serverId: number }) {
  const s = await withTimeout(getLifetimeStats(userId, serverId), 3500, 'today.all').catch(() => null);
  if (!s) return <p className="px-4 py-10 text-center text-sm text-zinc-500">잠시 후 다시 시도해 주세요.</p>;
  return (
    <>
      <SecTitle>대장장이 이력 — {s.joinedDays}일째</SecTitle>
      <div className="grid grid-cols-3 gap-1.5">
        {[
          { l: '전투력', v: fmt(s.combat) },
          { l: '최고 강화', v: `+${fmt(s.maxEnhance)}` },
          { l: '합산 강화', v: `+${fmt(s.sumEnhance)}` },
        ].map((k) => (
          <div key={k.l} className="rounded-xl border border-zinc-200 px-2 py-2.5 text-center dark:border-zinc-800">
            <div className="text-[10px] text-zinc-500">{k.l}</div>
            <div className="mt-0.5 text-[14px] font-extrabold tabular-nums">{k.v}</div>
          </div>
        ))}
      </div>

      <SecTitle>통산 강화</SecTitle>
      <Panel>
        <RowLine label="총 시도">{fmt(s.attempts)}회</RowLine>
        <RowLine label="성공">{fmt(s.success)}회{s.attempts > 0 ? ` (${Math.round((s.success / s.attempts) * 100)}%)` : ''}</RowLine>
      </Panel>

      <SecTitle>통산 활동</SecTitle>
      <Panel>
        <RowLine label="보유 장비">{s.itemKinds}종</RowLine>
        <RowLine label="최고 초월">{s.transcendMax > 0 ? `T${s.transcendMax}` : '—'}</RowLine>
        <RowLine label="보급 상자 개봉">{fmt(s.boxesOpened)}개</RowLine>
        <RowLine label="레이드 공격">{fmt(s.raidAttacks)}회</RowLine>
        <RowLine label="대난투">{s.meleeJoined}회 참가{s.meleeWins > 0 ? ` · 우승 ${s.meleeWins}` : ''}</RowLine>
      </Panel>
    </>
  );
}
