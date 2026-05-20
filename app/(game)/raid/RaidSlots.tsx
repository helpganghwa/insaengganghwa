'use client';

import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { RAID_OPEN_COST_DIAMOND } from '@/lib/game/balance';
import { RAID_BOSSES, RAID_BOSS_CODES, type RaidBoss } from '@/lib/game/raid/bosses';
import { assetUrl } from '@/lib/asset-versions';

import { openRaidAction } from './actions';

function bossSrc(code: RaidBoss): string {
  return assetUrl(`/sprites/boss/${code}.png`);
}

export type ActiveRaid = {
  raidId: string;
  bossCode: RaidBoss;
  expireAtIso: string;
  phasesCleared: number;
  isHost: boolean;
};

function Countdown({ iso }: { iso: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return <span className="text-zinc-400">정산 대기</span>;
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return (
    <span className={`tabular-nums ${ms < 600000 ? 'font-bold text-red-500' : ''}`}>
      ⏳ {h}:{String(m).padStart(2, '0')}
    </span>
  );
}

export function RaidSlots({
  active,
  slots,
  dailyUsed,
  dailyCap,
}: {
  active: ActiveRaid[];
  slots: number;
  dailyUsed: number;
  dailyCap: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<RaidBoss | null>(null);
  const exhausted = dailyUsed >= dailyCap;

  const cells = Array.from({ length: slots }, (_, i) => active[i] ?? null);

  const open = (code: RaidBoss) =>
    startTransition(async () => {
      const r = await openRaidAction(code);
      if (r.status === 'error') {
        alert(r.message);
        return;
      }
      setPicking(false);
      setPicked(null);
      router.push(`/raid/${r.raidId}`);
    });

  return (
    <>
      <p className="mb-2 text-center text-[11px] text-zinc-500">
        오늘 레이드{' '}
        <span className={`font-mono font-semibold ${exhausted ? 'text-red-500' : ''}`}>
          {dailyUsed}/{dailyCap}
        </span>
      </p>
      <div className="space-y-2">
        {cells.map((s, i) =>
          s ? (
            <Link
              key={s.raidId}
              href={`/raid/${s.raidId}`}
              className="flex items-center gap-3 rounded-xl border-2 border-amber-700/50 bg-zinc-900 p-3 text-zinc-100"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={bossSrc(s.bossCode)}
                alt=""
                aria-hidden
                width={56}
                height={56}
                className="h-14 w-14 shrink-0"
                style={{ imageRendering: 'pixelated' }}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold">
                  {RAID_BOSSES[s.bossCode].name}
                  {s.isHost ? (
                    <span className="ml-1 rounded bg-amber-500 px-1 text-[9px] text-amber-950">
                      방장
                    </span>
                  ) : null}
                </span>
                <span className="mt-0.5 flex gap-2 text-[10px] text-zinc-300">
                  <Countdown iso={s.expireAtIso} />
                  <span>
                    페이즈 <span className="font-mono font-bold">{s.phasesCleared}</span>
                  </span>
                </span>
              </span>
            </Link>
          ) : (
            <button
              key={`e${i}`}
              type="button"
              disabled={exhausted}
              onClick={() => setPicking(true)}
              className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-zinc-300 p-5 text-xs text-zinc-500 disabled:opacity-40 dark:border-zinc-700"
            >
              <span className="text-base">＋</span> {exhausted ? '오늘 한도 소진' : '레이드 개설'}
            </button>
          ),
        )}
      </div>

      {picking ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => !pending && (setPicking(false), setPicked(null))}
        >
          <div
            className="w-full max-w-xs rounded-2xl border-2 border-amber-300 bg-white p-4 dark:border-amber-800 dark:bg-zinc-950"
            onClick={(e) => e.stopPropagation()}
          >
            {!picked ? (
              <>
                <h3 className="text-center text-sm font-bold">보스 선택</h3>
                <div className="mt-3 grid grid-cols-3 gap-1.5">
                  {RAID_BOSS_CODES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setPicked(c)}
                      className="flex flex-col items-center gap-1 rounded-lg border border-zinc-300 p-2 text-[10px] dark:border-zinc-700"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={bossSrc(c)}
                        alt=""
                        aria-hidden
                        width={48}
                        height={48}
                        className="h-12 w-12"
                        style={{ imageRendering: 'pixelated' }}
                      />
                      {RAID_BOSSES[c].name}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setPicking(false)}
                  className="mt-3 w-full py-1.5 text-[11px] text-zinc-500"
                >
                  닫기
                </button>
              </>
            ) : (
              <>
                <div className="flex justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={bossSrc(picked)}
                    alt=""
                    aria-hidden
                    width={96}
                    height={96}
                    className="h-24 w-24"
                    style={{ imageRendering: 'pixelated' }}
                  />
                </div>
                <h3 className="mt-1 text-center text-base font-bold">
                  {RAID_BOSSES[picked].name}
                </h3>
                <p className="mt-2 rounded-xl bg-amber-50/60 p-3 text-[11px] leading-relaxed break-keep text-zinc-600 dark:bg-amber-950/20 dark:text-zinc-300">
                  {RAID_BOSSES[picked].story}
                </p>
                <p className="mt-2 text-center text-[10px] text-zinc-500">
                  6시간 레이드를 엽니다.
                </p>
                <div className="mt-3 space-y-1.5">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => open(picked)}
                    className="w-full rounded-full bg-zinc-900 px-3 py-2.5 text-xs font-bold text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-950"
                  >
                    {pending ? '개설 중…' : `💎 ${RAID_OPEN_COST_DIAMOND.toLocaleString()} 지불하고 개설`}
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => setPicked(null)}
                    className="w-full py-1.5 text-[11px] text-zinc-500"
                  >
                    ← 다른 보스
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
