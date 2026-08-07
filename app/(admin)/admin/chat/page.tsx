import Link from 'next/link';

import { listServers } from '@/lib/game/servers';
import { isChatEnabled } from '@/lib/game/chat/service';

import { ServerFilter, parseServerFilter } from '../ServerFilter';
import { ChatToggle } from './AdminChatActions';
import { GuildTab } from './GuildTab';
import { WhisperTab } from './WhisperTab';
import { WorldTab } from './WorldTab';
import {
  CHAT_BASE_PATH,
  CHAT_TABS,
  chatHref,
  parseBigIntParam,
  parseChatTab,
  parsePage,
  parseUuidParam,
  type ChatSearchParams,
} from './shared';

/**
 * 채팅 통합 검수(0125 → 0155 확장) — 일반(전체)·길드·귓속말 3탭.
 * 세 채널 모두 "원본 열람 + 숨김 토글 + 발신자 제재"가 같은 화면에서 끝나야 신고 대응이 빠르다.
 * 진입 가드는 (admin)/layout.
 */
export const dynamic = 'force-dynamic';

export default async function AdminChatPage({
  searchParams,
}: {
  searchParams: Promise<ChatSearchParams>;
}) {
  const params = await searchParams;
  const tab = parseChatTab(params.tab);
  const serverId = parseServerFilter(params.srv);
  const q = params.q?.trim() ?? '';
  const page = parsePage(params.p);
  const guildId = parseBigIntParam(params.gid);
  const userId = parseUuidParam(params.uid);
  const peerId = parseUuidParam(params.peer);

  const [enabled, servers] = await Promise.all([isChatEnabled(), listServers()]);

  return (
    <div className="mx-auto w-full max-w-[760px] space-y-3 px-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">
          채팅 검수 <span className={enabled ? 'text-emerald-500' : 'text-red-500'}>{enabled ? 'ON' : 'OFF'}</span>
        </h1>
        <ChatToggle enabled={enabled} />
      </div>

      <div className="flex items-center gap-1.5">
        {CHAT_TABS.map((t) => (
          <Link
            prefetch={false}
            key={t.id}
            // 탭 전환은 서버 필터만 유지 — 검색어·페이지·열람 대상은 탭마다 의미가 달라 초기화.
            href={chatHref({ srv: params.srv }, { tab: t.id })}
            className={`rounded-full px-3 py-1 text-[12px] font-semibold ${
              tab === t.id ? 'bg-zinc-100 text-zinc-900' : 'bg-zinc-800 text-zinc-300'
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <ServerFilter
        basePath={CHAT_BASE_PATH}
        servers={servers}
        current={serverId}
        // p는 넘기지 않는다 — 서버를 바꾸면 목록이 달라지므로 1쪽부터.
        params={{ tab, q: params.q, gid: params.gid, uid: params.uid, peer: params.peer }}
      />

      {tab === 'world' ? (
        <WorldTab params={params} serverId={serverId} q={q} page={page} />
      ) : tab === 'guild' ? (
        <GuildTab params={params} serverId={serverId} q={q} page={page} guildId={guildId} />
      ) : (
        <WhisperTab
          params={params}
          serverId={serverId}
          q={q}
          page={page}
          userId={userId}
          peerId={peerId}
        />
      )}
    </div>
  );
}
