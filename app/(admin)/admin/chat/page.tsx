import { desc, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { chatMessages } from '@/lib/db/schema/chat';
import { characters } from '@/lib/db/schema/server';
import { profiles } from '@/lib/db/schema/profiles';
import { isChatEnabled } from '@/lib/game/chat/service';

import { ChatToggle, MessageActions } from './AdminChatActions';

export const dynamic = 'force-dynamic';

function fmt(d: Date): string {
  return d.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** 전체 채팅 운영(0125) — 최근 메시지·신고 수·숨김/금지·킬스위치. 진입 가드는 (admin)/layout. */
export default async function AdminChatPage() {
  const enabled = await isChatEnabled();
  const rows = await db
    .select({
      id: chatMessages.id,
      serverId: chatMessages.serverId,
      userId: chatMessages.userId,
      body: chatMessages.body,
      hiddenAt: chatMessages.hiddenAt,
      createdAt: chatMessages.createdAt,
      nickname: characters.nickname,
      mutedUntil: profiles.chatMutedUntil,
      reports: sql<number>`(select count(*)::int from chat_reports r where r.message_id = ${chatMessages.id})`,
    })
    .from(chatMessages)
    .leftJoin(characters, sql`${characters.userId} = ${chatMessages.userId} and ${characters.serverId} = ${chatMessages.serverId}`)
    .leftJoin(profiles, eq(profiles.id, chatMessages.userId))
    .orderBy(desc(chatMessages.id))
    .limit(200);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">
          전체 채팅 <span className={enabled ? 'text-emerald-500' : 'text-red-500'}>{enabled ? 'ON' : 'OFF'}</span>
        </h1>
        <ChatToggle enabled={enabled} />
      </div>

      <div className="space-y-1.5">
        {rows.length === 0 ? <p className="text-sm text-zinc-500">메시지가 없습니다.</p> : null}
        {rows.map((m) => (
          <div
            key={String(m.id)}
            className={`rounded-lg border px-3 py-2 text-[12px] ${
              m.hiddenAt
                ? 'border-red-900/40 bg-red-950/20 opacity-70'
                : 'border-zinc-800 bg-zinc-900/40'
            }`}
          >
            <div className="flex items-center gap-2">
              <b>{m.nickname ?? '(탈퇴)'}</b>
              <span className="text-zinc-500">s{m.serverId}</span>
              <span className="text-zinc-500">{fmt(m.createdAt)}</span>
              {Number(m.reports) > 0 ? (
                <span className="rounded bg-red-800 px-1.5 text-[10px] font-bold text-white">신고 {m.reports}</span>
              ) : null}
              {m.hiddenAt ? <span className="text-[10px] text-red-400">숨김</span> : null}
              {m.mutedUntil && m.mutedUntil > new Date() ? (
                <span className="text-[10px] text-amber-400">채팅금지중</span>
              ) : null}
              <span className="ml-auto">
                <MessageActions messageId={String(m.id)} hidden={Boolean(m.hiddenAt)} userId={m.userId} />
              </span>
            </div>
            <p className="mt-1 break-words text-zinc-200">{m.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
