'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { profileHref } from '@/lib/game/profile/href';
import { meleeFaceCropStyle } from '@/components/faceCrop';
import { GuildBadge } from '@/components/GuildBadge';
import type { MeleeRankMode, MeleeRankRow } from '@/lib/game/melee/ranking';

import { meleeRankingAction } from './actions';

const MODES: [MeleeRankMode, string][] = [
  ['all', '전체'],
  ['near', '내 주변'],
  ['guild', '우리 길드'],
];

/** 순위 한 줄 — FINAL 카드와 같은 방식(우측 얼굴 확대 + 좌→우 그라데이션). 높이 고정(스크롤 복원). */
function Row({
  r,
  isMe,
  serverId,
}: {
  r: MeleeRankRow;
  isMe: boolean;
  serverId: number;
}) {
  const gold = r.rank === 1;
  const medal = r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : null;
  return (
    <li className="relative flex h-[56px] items-center overflow-hidden border-b border-zinc-800/70 px-3">
      {r.avatar ? (
        <div className="pointer-events-none absolute inset-y-0 right-0 w-36">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={r.avatar}
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full"
            style={meleeFaceCropStyle(r.faceBox)}
          />
        </div>
      ) : null}
      {/* 좌→우 그라데이션 2겹 — 1위/나만 앰버, 나머지는 중성(위계 유지). */}
      <div
        className={`pointer-events-none absolute inset-0 bg-gradient-to-r ${
          gold || isMe ? 'from-amber-500/25' : 'from-zinc-400/10'
        } to-transparent`}
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-zinc-950 to-transparent" />

      <div className="relative z-10 flex w-full items-center gap-2.5">
        <span
          className={`w-8 shrink-0 text-center font-mono text-[14px] font-extrabold drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] ${
            isMe ? 'text-amber-300' : 'text-zinc-300'
          }`}
        >
          {medal ?? r.rank}
        </span>
        <div className={`w-px shrink-0 self-stretch ${isMe ? 'bg-amber-600/50' : 'bg-zinc-700/60'}`} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1">
            <Link
              prefetch={false}
              href={profileHref(r.publicCode ?? '', serverId)}
              className="truncate text-[12.5px] font-extrabold text-zinc-50 underline decoration-white/20 underline-offset-2 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
            >
              {r.nickname}
            </Link>
            {r.guildName ? (
              <GuildBadge
                emblemUrl={r.guildEmblemUrl}
                name={r.guildName}
                size={11}
                className="min-w-0 shrink text-[9.5px] text-zinc-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
              />
            ) : null}
            {isMe ? (
              <span className="shrink-0 rounded bg-amber-500/25 px-1 text-[8.5px] font-black text-amber-300">
                나
              </span>
            ) : null}
          </div>
          <div className="truncate text-[9.5px] text-zinc-400 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
            공격 <b className="font-mono font-black text-zinc-200">{r.attackSuccess}</b> · 방어{' '}
            <b className="font-mono font-black text-zinc-200">{r.defenseSuccess}</b>
            {gold ? (
              <span className="font-bold text-amber-300"> · 최후 생존</span>
            ) : r.killerNickname ? (
              <>
                {' · '}
                <span className="font-bold text-rose-300">{r.killerNickname}</span>에게 패배
              </>
            ) : null}
          </div>
        </div>
        <span className="relative z-10 w-[46px] shrink-0 text-right font-mono text-[11px] font-extrabold text-zinc-200 drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)]">
          {r.eliminatedRound != null ? (
            <>
              {r.eliminatedRound.toLocaleString()}
              <em className="block text-[8px] font-bold text-zinc-400 not-italic">라운드</em>
            </>
          ) : (
            <span className="text-zinc-600">—</span>
          )}
        </span>
      </div>
    </li>
  );
}

/**
 * 전체 순위 탭 — 서브탭(전체/내 주변/우리 길드)은 URL 쿼리(?sub=)로 유지해 뒤로가기 복원이 된다.
 * 전체 모드는 50명씩 keyset 더보기.
 */
export function MeleeRanking({
  battleId,
  serverId,
  myUserId,
}: {
  battleId: string;
  serverId: number;
  myUserId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const mode = ((): MeleeRankMode => {
    const s = search.get('sub');
    return s === 'near' || s === 'guild' ? s : 'all';
  })();

  const [rows, setRows] = useState<MeleeRankRow[]>([]);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [pending, startTransition] = useTransition();
  const loadedFor = useRef<string | null>(null);

  useEffect(() => {
    if (loadedFor.current === mode) return;
    loadedFor.current = mode;
    startTransition(async () => {
      const r = await meleeRankingAction({ battleId, mode });
      if (r.status !== 'success') return;
      setRows(r.rows);
      setMyRank(r.myRank);
      setHasMore(r.hasMore);
    });
  }, [mode, battleId]);

  const more = () => {
    const last = rows[rows.length - 1];
    if (!last || pending) return;
    startTransition(async () => {
      const r = await meleeRankingAction({ battleId, mode, afterRank: last.rank });
      if (r.status !== 'success') return;
      setRows((prev) => [...prev, ...r.rows]);
      setHasMore(r.hasMore);
    });
  };

  const selectMode = (m: MeleeRankMode) => {
    const q = new URLSearchParams(search.toString());
    if (m === 'all') q.delete('sub');
    else q.set('sub', m);
    const qs = q.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const jumpToMe = () => {
    document.getElementById('melee-rank-me')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 px-3 pb-2">
        <div className="flex gap-1">
          {MODES.map(([m, label]) => (
            <button
              key={m}
              type="button"
              onClick={() => selectMode(m)}
              className={`rounded-md px-2.5 py-1 text-[10.5px] font-extrabold transition ${
                mode === m ? 'bg-zinc-700 text-zinc-50' : 'bg-zinc-900 text-zinc-500'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {myRank != null && mode === 'all' ? (
          <button
            type="button"
            onClick={jumpToMe}
            className="shrink-0 rounded-md bg-amber-500/15 px-2 py-1 text-[10px] font-black text-amber-300"
          >
            내 순위 {myRank.toLocaleString()}위
          </button>
        ) : null}
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto">
        {rows.map((r) => (
          <div key={r.userId} id={r.userId === myUserId ? 'melee-rank-me' : undefined}>
            <Row r={r} isMe={r.userId === myUserId} serverId={serverId} />
          </div>
        ))}
        {rows.length === 0 && !pending ? (
          <li className="px-3 py-8 text-center text-[11.5px] text-zinc-500">
            {mode === 'guild' ? '같은 길드 참가자가 없습니다.' : '순위 정보가 없습니다.'}
          </li>
        ) : null}
        {hasMore ? (
          <li className="p-3">
            <button
              type="button"
              onClick={more}
              disabled={pending}
              className="w-full rounded-lg bg-zinc-900 py-2 text-[11.5px] font-bold text-zinc-400 disabled:opacity-50"
            >
              {pending ? '불러오는 중…' : '더 보기'}
            </button>
          </li>
        ) : null}
      </ul>
    </div>
  );
}
