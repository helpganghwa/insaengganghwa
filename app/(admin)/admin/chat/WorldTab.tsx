import { ChatSearchForm } from './ChatSearchForm';
import { ChatMessageRow } from './MessageRow';
import { Pager } from './Pager';
import { listChannelMessages } from './queries';
import { CHAT_PAGE_SIZE, chatHref, pagerHrefs, type ChatSearchParams } from './shared';

/** 일반(전체 채팅) 탭 — guild_id is null 메시지, 최신순. 닉네임·본문·유저코드 검색. */
export async function WorldTab({
  params,
  serverId,
  q,
  page,
}: {
  params: ChatSearchParams;
  serverId: number | null;
  q: string;
  page: number;
}) {
  const { rows, hasMore } = await listChannelMessages({
    serverId,
    guildId: null,
    q,
    offset: page * CHAT_PAGE_SIZE,
    limit: CHAT_PAGE_SIZE,
  });
  const { prevHref, nextHref } = pagerHrefs(params, page, hasMore);

  return (
    <div className="space-y-2">
      <ChatSearchForm
        keep={{ tab: 'world', srv: params.srv }}
        q={q}
        placeholder="닉네임 · 본문 · 유저코드(#UY1GToa9)"
        resetHref={chatHref(params, { q: null, p: null })}
      />
      {rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-zinc-500">메시지가 없습니다.</p>
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
