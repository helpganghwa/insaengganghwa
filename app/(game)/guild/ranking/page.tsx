import { redirect } from 'next/navigation';

import { getSessionUserId } from '@/lib/auth/session';
import { getActiveServerId } from '@/lib/game/servers';
import { withTimeout } from '@/lib/db/with-timeout';
import { getMyMembership, getGuildRankingBoard } from '@/lib/game/guild';

import { GuildPageHeader } from '../GuildPageHeader';
import { GuildRankingBoard, type RankSort } from '../GuildRankingBoard';
import type { GuildRow } from '../guild-row';

const DB_GUARD_MS = 4000;
const RANKING_LIMIT = 50;
export const dynamic = 'force-dynamic';

/** DB 행 → 클라 행. bigint는 문자열로(직렬화 경계). */
function toRow(g: Awaited<ReturnType<typeof getGuildRankingBoard>>['myRow'] & object): GuildRow {
  return {
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
  };
}

/**
 * 길드 랭킹(R-1) — 홈 메뉴 '길드 랭킹' 타일 진입.
 *
 * 지표 전환은 클라에서 즉시 일어난다(종전 `?sort=` 페이지 재로드 폐기). 순위는 서버가
 * 전 길드를 기준으로 계산해 3지표분을 함께 내려주므로, 클라 전환이 순위를 흔들지 않는다.
 */
export default async function GuildRankingPage() {
  const userId = await getSessionUserId();
  const serverId = await getActiveServerId();
  if (!userId) {
    return <div className="px-4 py-8 text-center text-sm text-zinc-500">로그인이 필요합니다.</div>;
  }
  const membership = await withTimeout(
    getMyMembership(userId, serverId),
    DB_GUARD_MS,
    'guild.ranking.membership',
  );
  if (!membership) redirect('/guild');

  const board = await withTimeout(
    getGuildRankingBoard(serverId, membership.guildId, RANKING_LIMIT),
    DB_GUARD_MS,
    'guild.ranking.board',
  );

  const lists = {
    level: board.lists.level.map(toRow),
    combat: board.lists.combat.map(toRow),
    zones: board.lists.zones.map(toRow),
  } satisfies Record<RankSort, GuildRow[]>;

  return (
    <div className="px-4 py-4">
      <GuildPageHeader
        fallback="/guild"
        kicker={`전체 ${board.total}개 길드`}
        title="길드 랭킹"
      />
      <div className="mt-3">
        <GuildRankingBoard
          lists={lists}
          myRank={board.myRank}
          myRow={board.myRow ? toRow(board.myRow) : null}
          myGuildId={membership.guildId.toString()}
        />
      </div>
    </div>
  );
}
