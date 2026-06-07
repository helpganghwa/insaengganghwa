'use client';

import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { RAID_OPEN_COST_DIAMOND } from '@/lib/game/balance';
import { RAID_BOSSES, RAID_BOSS_CODES, type RaidBoss } from '@/lib/game/raid/bosses';
import { BossSprite } from '@/components/BossSprite';
import { getBossBg, getBossBgClass, getBossShadow } from '@/lib/game/raid/boss-sprites';
import { assetUrl } from '@/lib/asset-versions';

import { openRaidAction } from './actions';

/**
 * 슬롯 셀 — 활성 레이드와 정산 대기(미수령 보상)를 한 목록에서 표현(grow 패턴).
 * status가 'active'면 진행 상태 + 카운트다운, 'pending_claim'이면 보상 미리보기 +
 * '수령 →' 라벨. 클릭하면 둘 다 /raid/[raidId] 상세로 이동(상세에서 수령 트리거).
 */
export type RaidSlotCell =
  | {
      kind: 'active';
      raidId: string;
      bossCode: RaidBoss;
      expireAtIso: string;
      phasesCleared: number;
      isHost: boolean;
      attacksLeft: number;
      myRank: number;
      participantCount: number;
    }
  | {
      kind: 'pending_claim';
      raidId: string;
      bossCode: RaidBoss;
      diamond: number;
      boxes: { weapon: number; armor: number; accessory: number };
      phasesCleared: number;
      myRank: number;
      participantCount: number;
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
  cells: cellsIn,
  slots,
  dailyUsed,
  dailyCap,
}: {
  cells: RaidSlotCell[];
  slots: number;
  dailyUsed: number;
  dailyCap: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<RaidBoss | null>(null);
  const exhausted = dailyUsed >= dailyCap;

  const cells = Array.from({ length: slots }, (_, i) => cellsIn[i] ?? null);

  const open = (code: RaidBoss) =>
    startTransition(async () => {
      const r = await openRaidAction(code);
      if (r.status === 'error') {
        alert(r.message);
        return;
      }
      // 팝업은 닫지 않고 상세로 이동 — 페이지 전환 시 자연 unmount(전환 중 깜빡임 방지).
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
            s.kind === 'pending_claim' ? (
              <Link
                key={s.raidId}
                href={`/raid/${s.raidId}`}
                style={{ boxShadow: getBossShadow(s.bossCode) }}
                className={`relative flex items-center gap-3 overflow-hidden rounded-xl border-2 border-amber-700/60 bg-gradient-to-r p-3 text-zinc-100 transition active:scale-[0.99] ${getBossBgClass(s.bossCode)}`}
              >
                {getBossBg(s.bossCode) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={assetUrl(getBossBg(s.bossCode)!)}
                    alt=""
                    aria-hidden
                    loading="eager"
                    fetchPriority="high"
                    className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-30"
                    style={{ imageRendering: 'pixelated' }}
                  />
                ) : null}
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/75 via-black/45 to-black/75" />
                <div className="relative shrink-0">
                  <BossSprite code={s.bossCode} size={56} />
                </div>
                <span className="relative min-w-0 flex-1">
                  <span className="block text-sm font-bold drop-shadow">
                    {RAID_BOSSES[s.bossCode].name}
                    <span className="ml-1 rounded bg-amber-400 px-1 text-[9px] text-amber-950">
                      정산 대기
                    </span>
                  </span>
                  <span className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-amber-200">
                    <span>
                      페이즈 <span className="font-mono font-bold">{s.phasesCleared}</span>
                    </span>
                    <span>
                      내 순위{' '}
                      <span className="font-mono font-bold">
                        {s.myRank}/{s.participantCount}
                      </span>
                    </span>
                    {s.diamond > 0 ? <span>💎 {s.diamond.toLocaleString('ko-KR')}</span> : null}
                    <span>
                      ⚔️{s.boxes.weapon} 🛡️{s.boxes.armor} 💍{s.boxes.accessory}
                    </span>
                  </span>
                </span>
              </Link>
            ) : (
            <Link
              key={s.raidId}
              href={`/raid/${s.raidId}`}
              style={{ boxShadow: getBossShadow(s.bossCode) }}
              className={`relative flex items-center gap-3 overflow-hidden rounded-xl border-2 border-amber-700/60 bg-gradient-to-r p-3 text-zinc-100 transition active:scale-[0.99] ${getBossBgClass(s.bossCode)}`}
            >
              {/* 보스 배경 이미지(있으면) — opacity 35로 부드럽게 깔고 어둠 overlay로 가독성 확보 (grow 패턴). */}
              {getBossBg(s.bossCode) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={assetUrl(getBossBg(s.bossCode)!)}
                  alt=""
                  aria-hidden
                  loading="eager"
                  fetchPriority="high"
                  className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-35"
                  style={{ imageRendering: 'pixelated' }}
                />
              ) : null}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/70 via-black/40 to-black/70" />
              <div className="relative shrink-0">
                <BossSprite code={s.bossCode} size={56} />
              </div>
              <span className="relative min-w-0 flex-1">
                <span className="block text-sm font-bold drop-shadow">
                  {RAID_BOSSES[s.bossCode].name}
                  {s.isHost ? (
                    <span className="ml-1 rounded bg-amber-500 px-1 text-[9px] text-amber-950">
                      방장
                    </span>
                  ) : null}
                </span>
                <span className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-zinc-300">
                  <Countdown iso={s.expireAtIso} />
                  <span>
                    페이즈 <span className="font-mono font-bold">{s.phasesCleared}</span>
                  </span>
                  <span className={s.attacksLeft <= 0 ? 'text-zinc-500' : ''}>
                    잔여 <span className="font-mono font-bold">{s.attacksLeft}</span>
                  </span>
                  <span>
                    내 순위{' '}
                    <span className="font-mono font-bold">
                      {s.myRank}/{s.participantCount}
                    </span>
                  </span>
                </span>
              </span>
            </Link>
            )
          ) : (
            <button
              key={`e${i}`}
              type="button"
              disabled={exhausted}
              onClick={() => setPicking(true)}
              className="flex h-[84px] w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-zinc-300 px-5 text-xs text-zinc-500 disabled:opacity-40 dark:border-zinc-700"
            >
              <span className="text-base">＋</span> {exhausted ? '오늘 한도 소진' : '레이드 소환'}
            </button>
          ),
        )}
      </div>

      {picking ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
          onClick={() => !pending && (setPicking(false), setPicked(null))}
        >
          <div
            className="w-full max-w-xs rounded-2xl border-2 border-amber-300 bg-white p-4 shadow-[0_0_40px_rgba(245,158,11,0.18)] dark:border-amber-800 dark:bg-zinc-950"
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
                      <BossSprite code={c} size={48} />
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
                  <BossSprite code={picked} size={96} />
                </div>
                <h3 className="mt-1 text-center text-base font-bold">
                  {RAID_BOSSES[picked].name}
                </h3>
                <p className="mt-2 rounded-xl bg-amber-50/60 p-3 text-[11px] leading-relaxed break-keep text-zinc-600 dark:bg-amber-950/20 dark:text-zinc-300">
                  {RAID_BOSSES[picked].story}
                </p>
                <div className="mt-3 space-y-1.5">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => open(picked)}
                    className="w-full rounded-full bg-zinc-900 px-3 py-2.5 text-xs font-bold text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-950"
                  >
                    {pending ? '소환 중…' : `💎 ${RAID_OPEN_COST_DIAMOND.toLocaleString()} 지불하고 소환`}
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
