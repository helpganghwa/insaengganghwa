'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { RAID_BOSSES, type RaidBoss } from '@/lib/game/raid/bosses';
import { RAID_MAX_PARTICIPANTS } from '@/lib/game/balance';
import { BossSprite } from '@/components/BossSprite';
import { getBossBg, getBossBgClass } from '@/lib/game/raid/boss-sprites';
import { assetUrl } from '@/lib/asset-versions';
import * as haptic from '@/lib/game/haptic';

import { joinRaidAction } from '../actions';

/**
 * 레이드 참가 컨펌 — 공유 링크로 들어온 비참가자 전용(상세/세션 진입 차단).
 * 보스 이미지·스토리·남은시간(종료 시 '종료된 레이드입니다') + 참가하기.
 * 참가 성공 시 router.refresh → 참가자가 되어 세션 카드로 전환(page 분기).
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

export function RaidJoinConfirm({
  bossCode,
  expireAtIso,
  status,
  shareCode,
  participantCount,
}: {
  bossCode: RaidBoss;
  expireAtIso: string;
  status: 'active' | 'settled';
  shareCode: string;
  participantCount: number;
}) {
  const router = useRouter();
  const boss = RAID_BOSSES[bossCode];
  const bg = getBossBg(bossCode);
  const { over, text } = useRemaining(expireAtIso);
  const ended = status === 'settled' || over;
  const full = participantCount >= RAID_MAX_PARTICIPANTS;
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleJoin = () => {
    if (pending || ended || full) return;
    haptic.success();
    setError(null);
    startTransition(async () => {
      const r = await joinRaidAction(shareCode);
      if (r.status === 'error') {
        setError(r.message);
        return;
      }
      router.refresh(); // 참가자 전환 → page가 세션 카드 렌더
    });
  };

  return (
    <div className="space-y-4 px-4 py-6">
      {/* 보스 히어로 — 배경 + 스프라이트 */}
      <div
        className={`relative flex h-56 items-center justify-center overflow-hidden rounded-2xl border border-zinc-800 ${getBossBgClass(bossCode)}`}
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
          <BossSprite code={bossCode} size={140} />
        </div>
      </div>

      {/* 이름 + 상태 */}
      <div className="text-center">
        <h1 className="text-lg font-extrabold text-white">{boss.name}</h1>
        <div className="mt-1 text-[12px] text-zinc-400">
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

      {/* 액션 */}
      {ended ? (
        <Link
          href="/raid"
          className="flex w-full items-center justify-center rounded-xl border border-zinc-700 py-3.5 text-sm font-bold text-zinc-300"
        >
          레이드 목록으로
        </Link>
      ) : (
        <button
          type="button"
          onClick={handleJoin}
          disabled={pending || full}
          className={`w-full rounded-xl py-3.5 text-sm font-extrabold transition active:scale-[0.99] ${
            pending || full
              ? 'bg-zinc-800 text-zinc-500'
              : 'bg-gradient-to-r from-red-600 to-orange-500 text-white shadow-lg shadow-red-900/40'
          }`}
        >
          {full ? '인원이 가득 찼습니다 (최대 10명)' : pending ? '참가 중…' : '⚔️ 레이드 참가하기'}
        </button>
      )}
    </div>
  );
}
