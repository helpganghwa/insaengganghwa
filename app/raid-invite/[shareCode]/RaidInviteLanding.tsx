'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { RAID_BOSSES, type RaidBoss } from '@/lib/game/raid/bosses';
import { RAID_MAX_PARTICIPANTS } from '@/lib/game/balance';
import { BossSprite } from '@/components/BossSprite';
import { getBossBg, getBossBgClass } from '@/lib/game/raid/boss-sprites';
import { assetUrl } from '@/lib/asset-versions';
import { signInWithKakao } from '@/lib/auth/actions';
import * as haptic from '@/lib/game/haptic';

import { requestJoinRaidAction } from '../../(game)/raid/actions';

/**
 * 레이드 초대 풀페이지 — 비로그인/참가전/꽉참/종료 분기.
 *  - 종료(settled/만료): '종료된 레이드입니다' + 홈으로.
 *  - 비로그인: 카카오 로그인(로그인 후 이 페이지로 복귀해 참가).
 *  - 이미 참가: '레이드 입장' → 세션.
 *  - 꽉참: 비활성.
 *  - 참가 가능: '참가하기' → join → 세션(/raid/<id>)로 이동.
 */
function useRemaining(expireAtIso: string): { over: boolean; text: string } {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const ms = new Date(expireAtIso).getTime() - now;
  if (ms <= 0) return { over: true, text: '' };
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1_000);
  return { over: false, text: `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` };
}

export function RaidInviteLanding({
  shareCode,
  raidId,
  bossCode,
  status,
  expireAtIso,
  participantCount,
  loggedIn,
  isParticipant,
}: {
  shareCode: string;
  raidId: string;
  bossCode: RaidBoss;
  status: 'active' | 'settled';
  expireAtIso: string;
  participantCount: number;
  loggedIn: boolean;
  isParticipant: boolean;
}) {
  const router = useRouter();
  const boss = RAID_BOSSES[bossCode];
  const bg = getBossBg(bossCode);
  const { over, text } = useRemaining(expireAtIso);
  const ended = status === 'settled' || over;
  const full = participantCount >= RAID_MAX_PARTICIPANTS;
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [requested, setRequested] = useState(false);

  const enter = () => router.push(`/raid/${raidId}`);

  // 공유링크 참가 — 즉시 X, 개설자 수락 필요(링크 유출 대비). 호스트/기참가자는 바로 입장.
  const handleJoin = () => {
    if (pending || ended || full || requested) return;
    haptic.success();
    setError(null);
    startTransition(async () => {
      const r = await requestJoinRaidAction(shareCode);
      if (r.status === 'error') {
        setError(r.message);
        return;
      }
      if (r.state === 'joined') return enter();
      setRequested(true); // 'requested' — 수락 대기
    });
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[420px] flex-col justify-center gap-4 px-5 py-8">
      {/* 보스 히어로 */}
      <div
        className={`relative flex h-60 items-center justify-center isolate overflow-hidden rounded-2xl border border-zinc-800 ${getBossBgClass(bossCode)}`}
      >
        {bg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={assetUrl(bg)}
            alt=""
            aria-hidden
            className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-40"
            style={{ imageRendering: 'pixelated' }}
          />
        ) : null}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/20" />
        <div className="relative">
          <BossSprite code={bossCode} size={150} />
        </div>
      </div>

      {/* 이름 + 상태 */}
      <div className="text-center">
        <p className="text-[11px] font-bold tracking-wide text-red-400">⚔️ 레이드 초대</p>
        <h1 className="mt-0.5 text-xl font-extrabold text-white">{boss.name}</h1>
        <div className="mt-1.5 text-[12px] text-zinc-400">
          {ended ? (
            <span className="font-bold text-zinc-500">종료된 레이드입니다</span>
          ) : (
            <>
              <span className="font-mono font-bold text-amber-300">⏳ {text}</span>
              <span className="mx-1.5 text-zinc-600">·</span>
              <span>
                {participantCount}/{RAID_MAX_PARTICIPANTS}명 참여 중
              </span>
            </>
          )}
        </div>
      </div>

      {/* 스토리 */}
      <p className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 text-[13px] leading-relaxed break-keep text-zinc-300">
        {boss.story}
      </p>

      {error ? <p className="text-center text-[12px] font-medium text-red-400">{error}</p> : null}

      {/* 액션 — 상태별 분기 */}
      {ended ? (
        <Link
          href="/"
          className="flex w-full items-center justify-center rounded-xl border border-zinc-700 py-3.5 text-sm font-bold text-zinc-300 active:bg-zinc-900"
        >
          홈으로
        </Link>
      ) : isParticipant ? (
        <button
          type="button"
          onClick={enter}
          className="w-full rounded-xl bg-gradient-to-r from-red-600 to-orange-500 py-3.5 text-sm font-extrabold text-white shadow-lg shadow-red-900/40 transition active:scale-[0.99]"
        >
          ⚔️ 레이드 입장
        </button>
      ) : !loggedIn ? (
        <div className="space-y-2">
          <p className="text-center text-[12px] text-zinc-400">로그인하면 무료로 참여할 수 있어요</p>
          <form action={signInWithKakao}>
            <input type="hidden" name="next" value={`/raid-invite/${shareCode}`} />
            <button
              type="submit"
              aria-label="카카오 로그인"
              className="flex w-full items-center justify-center gap-2 rounded-[12px] bg-[#FEE500] py-3.5 transition active:scale-[0.99] hover:brightness-95"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/kakao/kakao_symbol.png" alt="" aria-hidden className="h-[18px] w-auto" />
              <span className="text-[15px] font-bold text-black/85">카카오 로그인</span>
            </button>
          </form>
        </div>
      ) : (
        <div className="space-y-2">
          <button
            type="button"
            onClick={handleJoin}
            disabled={pending || full || requested}
            className={`w-full rounded-xl py-3.5 text-sm font-extrabold transition active:scale-[0.99] ${
              pending || full || requested
                ? 'bg-zinc-800 text-zinc-300'
                : 'bg-gradient-to-r from-red-600 to-orange-500 text-white shadow-lg shadow-red-900/40'
            }`}
          >
            {requested
              ? '✅ 참가 요청됨 · 개설자 수락 대기'
              : full
                ? `인원이 가득 찼습니다 (최대 ${RAID_MAX_PARTICIPANTS}명)`
                : pending
                  ? '요청 중…'
                  : '⚔️ 레이드 참가 요청'}
          </button>
          {requested ? (
            <p className="text-center text-[11px] text-zinc-400">
              개설자가 수락하면 자동으로 참여됩니다. 잠시 후 다시 확인해 주세요.
            </p>
          ) : null}
        </div>
      )}
    </main>
  );
}
