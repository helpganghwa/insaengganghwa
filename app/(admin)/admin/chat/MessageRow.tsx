import Link from 'next/link';

import { ServerBadge } from '../ServerBadge';
import { MessageActions } from './AdminChatActions';
import type { AdminChatRow, AdminIdentity } from './queries';
import { fmtKst, isMuted } from './shared';

/**
 * 메시지 행 — 일반·길드·귓속말 공통 표기 규칙.
 * 숨김 행은 배경/테두리로 즉시 구분되게 하고(검수자가 스캔으로 판별), 삭제가 아니라 토글이므로
 * 본문은 그대로 보여준다.
 */

const ROW_BASE = 'rounded-lg border px-3 py-2 text-[12px]';
const ROW_HIDDEN = 'border-red-900/40 bg-red-950/20';
const ROW_NORMAL = 'border-zinc-800 bg-zinc-900/40';

/** 닉네임 + 코드 — 클릭 시 유저 조회(제재·지갑 등 통합 도구)로 이동. */
function UserTag({
  userId,
  nickname,
  publicCode,
}: {
  userId: string;
  nickname: string | null;
  publicCode: string | null;
}) {
  return (
    <Link prefetch={false} href={`/admin/users?uid=${userId}`} className="flex items-center gap-1">
      <b className="text-zinc-100">{nickname ?? '(탈퇴/미생성)'}</b>
      {publicCode ? <span className="font-mono text-[10px] text-sky-400">#{publicCode}</span> : null}
    </Link>
  );
}

export function ChatMessageRow({ row, showGuild = true }: { row: AdminChatRow; showGuild?: boolean }) {
  return (
    <div className={`${ROW_BASE} ${row.hiddenAt ? ROW_HIDDEN : ROW_NORMAL}`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <UserTag userId={row.userId} nickname={row.nickname} publicCode={row.publicCode} />
        <ServerBadge serverId={row.serverId} />
        {showGuild && row.guildId ? (
          <span className="rounded bg-indigo-900/60 px-1.5 text-[10px] font-bold text-indigo-300">
            길드 {row.guildName ?? String(row.guildId)}
          </span>
        ) : null}
        <span className="text-zinc-500">{fmtKst(row.createdAt)}</span>
        {row.reports > 0 ? (
          <span className="rounded bg-red-800 px-1.5 text-[10px] font-bold text-white">신고 {row.reports}</span>
        ) : null}
        {row.hiddenAt ? <span className="text-[10px] font-bold text-red-400">숨김</span> : null}
        {isMuted(row.mutedUntil) ? <span className="text-[10px] text-amber-400">채팅금지중</span> : null}
        <span className="ml-auto">
          <MessageActions messageId={String(row.id)} hidden={Boolean(row.hiddenAt)} userId={row.userId} />
        </span>
      </div>
      <p className="mt-1 break-words text-zinc-200">{row.body}</p>
    </div>
  );
}

export function WhisperMessageRow({
  id,
  fromUserId,
  toUserId,
  body,
  createdAt,
  hiddenAt,
  serverId,
  reports,
  identities,
}: {
  id: bigint;
  fromUserId: string;
  toUserId: string;
  body: string;
  createdAt: Date;
  hiddenAt: Date | null;
  serverId: number;
  reports: number;
  identities: Map<string, AdminIdentity>;
}) {
  const from = identities.get(fromUserId) ?? null;
  const to = identities.get(toUserId) ?? null;
  return (
    <div className={`${ROW_BASE} ${hiddenAt ? ROW_HIDDEN : ROW_NORMAL}`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <UserTag userId={fromUserId} nickname={from?.nickname ?? null} publicCode={from?.publicCode ?? null} />
        <span className="text-zinc-600">→</span>
        <span className="text-zinc-400">{to?.nickname ?? '(탈퇴/미생성)'}</span>
        <ServerBadge serverId={serverId} />
        <span className="text-zinc-500">{fmtKst(createdAt)}</span>
        {reports > 0 ? (
          <span className="rounded bg-red-800 px-1.5 text-[10px] font-bold text-white">신고 {reports}</span>
        ) : null}
        {hiddenAt ? <span className="text-[10px] font-bold text-red-400">숨김</span> : null}
        {isMuted(from?.mutedUntil ?? null) ? (
          <span className="text-[10px] text-amber-400">채팅금지중</span>
        ) : null}
        <span className="ml-auto">
          <MessageActions
            messageId={String(id)}
            hidden={Boolean(hiddenAt)}
            userId={fromUserId}
            kind="whisper"
          />
        </span>
      </div>
      <p className="mt-1 break-words text-zinc-200">{body}</p>
    </div>
  );
}
