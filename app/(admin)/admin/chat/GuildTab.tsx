import Link from 'next/link';

import { ServerBadge } from '../ServerBadge';
import { ChatSearchForm } from './ChatSearchForm';
import { ChatMessageRow } from './MessageRow';
import { Pager } from './Pager';
import { getGuildBrief, listChannelMessages, listGuildChannels } from './queries';
import { CHAT_PAGE_SIZE, chatHref, fmtKst, pagerHrefs, type ChatSearchParams } from './shared';

/**
 * 길드 탭 — 이름으로 길드를 찾아(목록) 그 길드 채널을 연다(?gid=).
 * 길드 채널은 비공개라 전체 채팅처럼 흘려볼 수 없어 "길드 선택 → 열람" 2단계로 둔다.
 */
export async function GuildTab({
  params,
  serverId,
  q,
  page,
  guildId,
  reportedOnly,
}: {
  params: ChatSearchParams;
  serverId: number | null;
  q: string;
  page: number;
  guildId: bigint | null;
  reportedOnly: boolean;
}) {
  if (guildId != null) {
    return <GuildChannel params={params} page={page} guildId={guildId} reportedOnly={reportedOnly} />;
  }

  const guildRows = await listGuildChannels(serverId, q);
  return (
    <div className="space-y-2">
      <ChatSearchForm
        keep={{ tab: 'guild', srv: params.srv, rep: params.rep }}
        q={q}
        placeholder="길드명(부분일치)"
        resetHref={chatHref(params, { q: null, p: null })}
      />
      {guildRows.length === 0 ? (
        <p className="py-10 text-center text-sm text-zinc-500">길드가 없습니다.</p>
      ) : (
        <ul className="space-y-1.5">
          {guildRows.map((g) => (
            <li key={g.id}>
              <Link
                prefetch={false}
                href={chatHref(params, { gid: g.id, srv: g.serverId, p: null })}
                className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-[12px] hover:border-amber-700"
              >
                <b className="truncate text-zinc-100">{g.name}</b>
                <ServerBadge serverId={g.serverId} />
                <span className="text-zinc-500">{g.msgCount}건</span>
                {g.hiddenCount > 0 ? (
                  <span className="text-[10px] text-red-400">숨김 {g.hiddenCount}</span>
                ) : null}
                <span className="ml-auto shrink-0 text-zinc-500">
                  {g.lastAt ? fmtKst(g.lastAt) : '메시지 없음'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

async function GuildChannel({
  params,
  page,
  guildId,
  reportedOnly,
}: {
  params: ChatSearchParams;
  page: number;
  guildId: bigint;
  reportedOnly: boolean;
}) {
  const guild = await getGuildBrief(guildId);
  if (!guild) {
    return (
      <div className="space-y-2">
        <BackToGuildList params={params} />
        <p className="py-10 text-center text-sm text-zinc-500">길드를 찾을 수 없습니다.</p>
      </div>
    );
  }

  const { rows, hasMore } = await listChannelMessages({
    serverId: guild.serverId,
    guildId,
    q: '',
    reportedOnly,
    offset: page * CHAT_PAGE_SIZE,
    limit: CHAT_PAGE_SIZE,
  });
  const { prevHref, nextHref } = pagerHrefs(params, page, hasMore);

  return (
    <div className="space-y-2">
      <BackToGuildList params={params} />
      <div className="flex items-center gap-2 rounded-lg border border-indigo-900/50 bg-indigo-950/20 px-3 py-2 text-[12px]">
        <span className="text-indigo-300">길드 채널</span>
        <b className="text-zinc-100">{guild.name}</b>
        <ServerBadge serverId={guild.serverId} />
        {reportedOnly ? <span className="ml-auto text-[10px] text-red-400">신고된 것만 · 신고 많은 순</span> : null}
      </div>
      {rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-zinc-500">
          {reportedOnly ? '신고된 메시지가 없습니다.' : '메시지가 없습니다.'}
        </p>
      ) : (
        <div className="space-y-1.5">
          {rows.map((m) => (
            <ChatMessageRow key={String(m.id)} row={m} showGuild={false} />
          ))}
        </div>
      )}
      <Pager page={page} prevHref={prevHref} nextHref={nextHref} />
    </div>
  );
}

function BackToGuildList({ params }: { params: ChatSearchParams }) {
  return (
    <Link
      prefetch={false}
      href={chatHref(params, { gid: null, p: null })}
      className="inline-block rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300"
    >
      ← 길드 목록
    </Link>
  );
}
