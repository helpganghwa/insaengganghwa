import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getSessionUserId } from '@/lib/auth/session';
import { getActiveServerId } from '@/lib/game/servers';
import { withTimeout } from '@/lib/db/with-timeout';
import { getMyMembership, getGuildRanking, type GuildRankSort } from '@/lib/game/guild';

import { GuildList } from '../GuildList';

const DB_GUARD_MS = 4000;
const RANKING_LIMIT = 50;
export const dynamic = 'force-dynamic';

// 정렬 필터 — 서버 전체 길드 대상(랭킹은 길드원 정렬과 달리 전 서버 순위). ?sort= 로 서버 재정렬.
const SORTS: { key: GuildRankSort; label: string }[] = [
  { key: 'level', label: '레벨' },
  { key: 'combat', label: '전투력' },
  { key: 'zones', label: '점령지' },
];

/** 길드 랭킹 상세 — 홈 메뉴 '길드 랭킹' 타일 진입. 서버 전체 길드 순위(레벨/전투력/점령지 서버측 정렬). */
export default async function GuildRankingPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const userId = await getSessionUserId();
  const serverId = await getActiveServerId();
  if (!userId) {
    return <div className="px-4 py-8 text-center text-sm text-zinc-500">로그인이 필요합니다.</div>;
  }
  const membership = await withTimeout(getMyMembership(userId, serverId), DB_GUARD_MS, 'guild.ranking.membership');
  if (!membership) redirect('/guild');

  const { sort: sortParam } = await searchParams;
  // 화이트리스트 검증 — 미지정/오염값은 레벨(랭킹 페이지 기본)으로.
  const sort: GuildRankSort = SORTS.some((s) => s.key === sortParam) ? (sortParam as GuildRankSort) : 'level';

  const ranking = await withTimeout(
    getGuildRanking(serverId, RANKING_LIMIT, sort),
    DB_GUARD_MS,
    'guild.ranking.list',
  );

  return (
    <div className="px-4 py-4">
      {/* 헤더 — 제목 + 우측 정렬 필터. 길드원 페이지와 같은 pill 구성이되, 선택 시 서버 재정렬(?sort=). */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <h1 className="px-1 text-sm font-bold">길드 랭킹</h1>
        <div className="flex gap-1 rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-900">
          {SORTS.map((s) => (
            <Link
              key={s.key}
              href={`/guild/ranking?sort=${s.key}`}
              scroll={false}
              replace
              className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold transition ${
                sort === s.key
                  ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-950 dark:text-zinc-50'
                  : 'text-zinc-500'
              }`}
            >
              {s.label}
            </Link>
          ))}
        </div>
      </div>

      <GuildList
        guilds={ranking.map((g) => ({
          id: g.id.toString(),
          name: g.name,
          level: g.level,
          memberCount: g.memberCount,
          emblemUrl: g.emblemUrl,
          emblemColor: g.emblemColor,
          combat: g.combat,
          intro: g.intro,
          joinPolicy: g.joinPolicy,
          hasOpenchat: g.hasOpenchat,
          zones: g.zones,
          leaderNickname: g.leaderNickname,
        }))}
        showRank
        emptyText="아직 결성된 길드가 없습니다."
      />
    </div>
  );
}
