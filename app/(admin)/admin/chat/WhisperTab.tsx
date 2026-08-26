import Link from 'next/link';

import { ServerBadge } from '../ServerBadge';
import { ChatSearchForm } from './ChatSearchForm';
import { WhisperMessageRow } from './MessageRow';
import { Pager } from './Pager';
import {
  getIdentities,
  getUserBrief,
  listReportedWhispers,
  listWhisperPeers,
  listWhisperThread,
  searchCharacters,
  type AdminIdentity,
  type AdminUserBrief,
} from './queries';
import { CHAT_PAGE_SIZE, chatHref, fmtKst, isMuted, pagerHrefs, type ChatSearchParams } from './shared';

/**
 * 귓속말 탭 — 유저 검색 → 대화 상대 목록 → 스레드 원본.
 * 열람은 항상 **원본 전부**다: 숨김 메시지도 구분만 해서 보여주고, whisper_reads(읽음·나가기)는
 * 참조하지 않는다(유저가 '대화 나가기'로 자기 화면에서 지운 대화도 검수 대상으로 남는다).
 */
export async function WhisperTab({
  params,
  serverId,
  q,
  page,
  userId,
  peerId,
  reportedOnly,
}: {
  params: ChatSearchParams;
  serverId: number | null;
  q: string;
  page: number;
  userId: string | null;
  peerId: string | null;
  reportedOnly: boolean;
}) {
  // 신고 필터는 uid/peer 드릴다운보다 우선한다 — 검수 대상을 이미 알고 있어야 열리는 구조라,
  // "누구인지 모른 채" 신고에 닿으려면 선택된 대상을 무시하고 전량을 보여줘야 한다.
  if (reportedOnly) return <ReportedWhispers params={params} serverId={serverId} page={page} />;
  if (userId && peerId) {
    return <WhisperThread params={params} serverId={serverId} page={page} userId={userId} peerId={peerId} />;
  }
  if (userId) return <PeerList params={params} serverId={serverId} userId={userId} />;

  const results = q ? await searchCharacters(q, serverId) : [];
  return (
    <div className="space-y-2">
      <ChatSearchForm
        keep={{ tab: 'whisper', srv: params.srv }}
        q={q}
        placeholder="닉네임(부분일치) 또는 코드(#UY1GToa9)"
        resetHref={chatHref(params, { q: null, p: null })}
      />
      {!q ? (
        <p className="py-10 text-center text-sm text-zinc-500">
          검수할 유저를 검색하세요. 해당 유저의 모든 1:1 대화를 볼 수 있습니다.
        </p>
      ) : results.length === 0 ? (
        <p className="py-10 text-center text-sm text-zinc-500">일치하는 유저가 없습니다.</p>
      ) : (
        <ul className="space-y-1.5">
          {results.map((r) => (
            <li key={`${r.userId}:${r.serverId}`}>
              <Link
                prefetch={false}
                href={chatHref(params, { uid: r.userId, srv: r.serverId, q: null, p: null })}
                className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-[12px] hover:border-amber-700"
              >
                <b className="truncate text-zinc-100">{r.nickname}</b>
                <span className="font-mono text-[10px] text-sky-400">#{r.publicCode}</span>
                <ServerBadge serverId={r.serverId} />
                {r.bannedAt ? <span className="text-[10px] text-red-400">정지됨</span> : null}
                {isMuted(r.mutedUntil) ? (
                  <span className="text-[10px] text-amber-400">채팅금지중</span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const NO_IDENTITIES: Map<string, AdminIdentity> = new Map();

/**
 * 신고된 귓속말 전량 — 신고 많은 순. 귓속말 탭의 유일한 "역방향" 입구다(유저 → 대화가 아니라
 * 신고 → 대화). 각 행에서 스레드로 들어가 앞뒤 맥락을 보게 한다.
 */
async function ReportedWhispers({
  params,
  serverId,
  page,
}: {
  params: ChatSearchParams;
  serverId: number | null;
  page: number;
}) {
  const { rows, hasMore } = await listReportedWhispers({
    serverId,
    offset: page * CHAT_PAGE_SIZE,
    limit: CHAT_PAGE_SIZE,
  });
  // 닉네임은 서버별이라 서버 스코프가 '전체'면 행마다 소속 서버의 신원이 필요하다.
  // 조회는 이 페이지에 실제로 등장한 서버 수만큼만 늘어난다.
  const userIds = [...new Set(rows.flatMap((r) => [r.fromUserId, r.toUserId]))];
  const identityByServer = new Map(
    await Promise.all(
      [...new Set(rows.map((r) => r.serverId))].map(
        async (sid) => [sid, await getIdentities(userIds, sid)] as const,
      ),
    ),
  );
  const { prevHref, nextHref } = pagerHrefs(params, page, hasMore);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-red-900/50 bg-red-950/20 px-3 py-2 text-[12px]">
        <span className="text-red-300">신고된 귓속말</span>
        <span className="ml-auto text-[10px] text-zinc-500">신고 많은 순 · 숨김 포함 원본</span>
      </div>
      {rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-zinc-500">신고된 귓속말이 없습니다.</p>
      ) : (
        <div className="space-y-1.5">
          {rows.map((m) => (
            <WhisperMessageRow
              key={String(m.id)}
              id={m.id}
              fromUserId={m.fromUserId}
              toUserId={m.toUserId}
              body={m.body}
              createdAt={m.createdAt}
              hiddenAt={m.hiddenAt}
              deletedAt={m.deletedAt}
              serverId={m.serverId}
              reports={m.reports}
              identities={identityByServer.get(m.serverId) ?? NO_IDENTITIES}
              // 스레드는 (서버, 유저쌍)으로 열린다 — 신고 필터를 끄지 않으면 여기로 다시 돌아온다.
              threadHref={chatHref(params, {
                uid: m.fromUserId,
                peer: m.toUserId,
                srv: m.serverId,
                rep: null,
                p: null,
              })}
            />
          ))}
        </div>
      )}
      <Pager page={page} prevHref={prevHref} nextHref={nextHref} />
    </div>
  );
}

async function PeerList({
  params,
  serverId,
  userId,
}: {
  params: ChatSearchParams;
  serverId: number | null;
  userId: string;
}) {
  const [brief, peers] = await Promise.all([getUserBrief(userId), listWhisperPeers(userId, serverId)]);
  return (
    <div className="space-y-2">
      <BackLink href={chatHref(params, { uid: null, peer: null, p: null })} label="← 유저 검색" />
      <TargetHeader brief={brief} />
      {peers.length === 0 ? (
        <p className="py-10 text-center text-sm text-zinc-500">주고받은 귓속말이 없습니다.</p>
      ) : (
        <ul className="space-y-1.5">
          {peers.map((p) => (
            <li key={`${p.serverId}:${p.peerId}`}>
              <Link
                prefetch={false}
                href={chatHref(params, { peer: p.peerId, srv: p.serverId, p: null })}
                className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-[12px] hover:border-amber-700"
              >
                <b className="truncate text-zinc-100">{p.nickname ?? '(탈퇴/미생성)'}</b>
                {p.publicCode ? (
                  <span className="font-mono text-[10px] text-sky-400">#{p.publicCode}</span>
                ) : null}
                <ServerBadge serverId={p.serverId} />
                <span className="text-zinc-500">{p.msgCount}건</span>
                {p.hiddenCount > 0 ? (
                  <span className="text-[10px] text-red-400">숨김 {p.hiddenCount}</span>
                ) : null}
                <span className="ml-auto shrink-0 text-zinc-500">{fmtKst(p.lastAt)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

async function WhisperThread({
  params,
  serverId,
  page,
  userId,
  peerId,
}: {
  params: ChatSearchParams;
  serverId: number | null;
  page: number;
  userId: string;
  peerId: string;
}) {
  const backToPeers = chatHref(params, { peer: null, p: null });
  // 귓속말은 (server_id, 유저쌍)이 곧 대화라 서버가 특정돼야 한다. 상대 목록 링크가 항상
  // srv를 실어 보내므로 여기 걸리는 건 URL을 직접 손댄 경우뿐.
  if (serverId == null) {
    return (
      <div className="space-y-2">
        <BackLink href={backToPeers} label="← 대화 상대" />
        <p className="py-10 text-center text-sm text-zinc-500">서버를 선택해야 스레드를 볼 수 있습니다.</p>
      </div>
    );
  }

  const [identities, { rows, hasMore }] = await Promise.all([
    getIdentities([userId, peerId], serverId),
    listWhisperThread({
      serverId,
      userId,
      peerId,
      offset: page * CHAT_PAGE_SIZE,
      limit: CHAT_PAGE_SIZE,
    }),
  ]);
  const me = identities.get(userId);
  const peer = identities.get(peerId);
  const { prevHref, nextHref } = pagerHrefs(params, page, hasMore);

  return (
    <div className="space-y-2">
      <BackLink href={backToPeers} label="← 대화 상대" />
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-[12px]">
        <b className="text-zinc-100">{me?.nickname ?? '(탈퇴/미생성)'}</b>
        <span className="text-zinc-600">↔</span>
        <b className="text-zinc-100">{peer?.nickname ?? '(탈퇴/미생성)'}</b>
        <ServerBadge serverId={serverId} />
        <span className="ml-auto text-[10px] text-zinc-500">숨김 포함 원본 · 최신순</span>
      </div>
      {rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-zinc-500">메시지가 없습니다.</p>
      ) : (
        <div className="space-y-1.5">
          {rows.map((m) => (
            <WhisperMessageRow
              key={String(m.id)}
              id={m.id}
              fromUserId={m.fromUserId}
              toUserId={m.toUserId}
              body={m.body}
              createdAt={m.createdAt}
              hiddenAt={m.hiddenAt}
              deletedAt={m.deletedAt}
              serverId={m.serverId}
              reports={m.reports}
              identities={identities}
            />
          ))}
        </div>
      )}
      <Pager page={page} prevHref={prevHref} nextHref={nextHref} />
    </div>
  );
}

function TargetHeader({ brief }: { brief: AdminUserBrief | null }) {
  if (!brief) return <p className="text-sm text-red-400">유저를 찾을 수 없습니다.</p>;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-[12px]">
      {brief.characters.map((c) => (
        <span key={c.serverId} className="flex items-center gap-1">
          <b className="text-zinc-100">{c.nickname}</b>
          <ServerBadge serverId={c.serverId} />
        </span>
      ))}
      <span className="font-mono text-[10px] text-sky-400">#{brief.publicCode}</span>
      {brief.bannedAt ? <span className="text-[10px] text-red-400">정지됨</span> : null}
      {isMuted(brief.mutedUntil) ? (
        <span className="text-[10px] text-amber-400">채팅금지중</span>
      ) : null}
      <Link
        prefetch={false}
        href={`/admin/users?uid=${brief.userId}`}
        className="ml-auto rounded border border-zinc-700 px-2 py-0.5 text-[10px] text-zinc-300"
      >
        유저 조회
      </Link>
    </div>
  );
}

function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      prefetch={false}
      href={href}
      className="inline-block rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300"
    >
      {label}
    </Link>
  );
}
