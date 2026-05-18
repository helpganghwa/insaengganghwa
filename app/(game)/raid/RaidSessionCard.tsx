'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import {
  RAID_BASE_ATTACKS,
  raidExtraAttackCost,
  raidPhaseHp,
  type SupplySlot,
} from '@/lib/game/balance';
import { aggregatePhaseDrops } from '@/lib/game/raid/drops';
import { RAID_BOSSES, type RaidBoss } from '@/lib/game/raid/bosses';

import { attackRaidAction, buyExtraAttackAction } from './actions';

export type RaidView = {
  raidId: string;
  bossCode: RaidBoss;
  status: 'active' | 'settled';
  expireAtIso: string;
  shareCode: string;
  isHost: boolean;
  phase1Hp: number;
  totalDamage: number;
  phasesCleared: number;
  isParticipant: boolean;
  myAttacksUsed: number;
  myExtraAttacks: number;
  participants: { nickname: string; totalDamage: number; isMe: boolean }[];
};

const MEDAL = ['🥇', '🥈', '🥉'];

export function RaidSessionCard({ view: v }: { view: RaidView }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [now, setNow] = useState(() => Date.now());
  const [fx, setFx] = useState<null | { dmg: number; crit: boolean }>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const boss = RAID_BOSSES[v.bossCode];
  const settled = v.status === 'settled';
  const remainMs = new Date(v.expireAtIso).getTime() - now;
  const over = remainMs <= 0;
  const allowed = RAID_BASE_ATTACKS + v.myExtraAttacks;
  const left = allowed - v.myAttacksUsed;
  const canAttack = v.isParticipant && !settled && !over && left > 0;

  // 현재 페이즈 진행률 — 누적 임계 = phase1·2·(1.5^N − 1).
  const thr = (n: number) => v.phase1Hp * 2 * (1.5 ** n - 1);
  const floor = thr(v.phasesCleared);
  const nextHp = raidPhaseHp(v.phase1Hp, v.phasesCleared + 1);
  const prog = Math.max(0, Math.min(1, (v.totalDamage - floor) / nextHp));

  const drops = aggregatePhaseDrops(BigInt(v.raidId), v.phasesCleared);
  const boxStr = (Object.entries(drops.boxes) as [SupplySlot, number][])
    .filter(([, n]) => n > 0)
    .map(([s, n]) => `${s === 'weapon' ? '무기' : s === 'armor' ? '방어구' : '장신구'}×${n}`)
    .join(' ');

  const attack = () =>
    startTransition(async () => {
      const r = await attackRaidAction(v.raidId);
      if (r.status === 'error') {
        alert(r.message);
        return;
      }
      setFx({ dmg: r.damage, crit: r.isCrit });
      setTimeout(() => setFx(null), 800);
      router.refresh();
    });

  const buyExtra = () =>
    startTransition(async () => {
      const r = await buyExtraAttackAction(v.raidId);
      if (r.status === 'error') alert(r.message);
      else router.refresh();
    });

  const invite = async () => {
    const url = `${window.location.origin}/s/${v.shareCode}`;
    try {
      if (navigator.share) await navigator.share({ title: `${boss.name} 레이드`, url });
      else {
        await navigator.clipboard.writeText(url);
        alert('초대 링크 복사됨 — 카톡방에 붙여넣기');
      }
    } catch {
      /* 취소 무시 */
    }
  };

  const cd = over
    ? '정산 대기'
    : `${Math.floor(remainMs / 3600000)}:${String(Math.floor((remainMs % 3600000) / 60000)).padStart(2, '0')}`;

  return (
    <section className="text-zinc-100">
      <div className="relative flex h-52 flex-col items-center justify-center bg-gradient-to-b from-zinc-800 to-zinc-950">
        <div className="absolute left-3 top-3 text-sm font-extrabold">
          {boss.name}
          {v.isHost ? (
            <span className="ml-1 rounded bg-amber-500 px-1 text-[9px] text-amber-950">방장</span>
          ) : null}
        </div>
        <div
          className={`absolute right-3 top-3 rounded-full px-2.5 py-1 font-mono text-sm font-bold ${
            over || settled ? 'bg-black/40 text-zinc-300' : 'bg-black/40 text-amber-200'
          }`}
        >
          {settled ? '종료' : `⏳ ${cd}`}
        </div>
        <div className={`text-7xl ${fx ? 'animate-flash-down' : ''}`}>{boss.emoji}</div>
        {fx ? (
          <span
            className={`absolute top-10 font-mono font-extrabold ${fx.crit ? 'text-2xl text-amber-300' : 'text-xl text-red-300'}`}
          >
            {fx.crit ? '⚡' : ''}
            {fx.dmg.toLocaleString()}
          </span>
        ) : null}
      </div>

      <div className="space-y-3 p-3">
        <div>
          <div className="flex justify-between text-[11px]">
            <span className="font-bold">
              PHASE <span className="font-mono text-lg text-emerald-300">{v.phasesCleared}</span> 돌파
            </span>
            <span className="font-mono text-[10px] text-zinc-500">
              누적 {v.totalDamage.toLocaleString()}
            </span>
          </div>
          <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full bg-emerald-400 transition-[width] duration-500"
              style={{ width: `${Math.max(2, prog * 100)}%` }}
            />
          </div>
        </div>

        <div className="rounded-lg border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-center text-[11px]">
          <span className="font-semibold text-amber-300">🎁 누적 보상</span>{' '}
          {v.phasesCleared > 0 ? (
            <span className="text-zinc-200">
              💎{drops.diamond}
              {boxStr ? ` · 보급상자 ${boxStr}` : ''}
            </span>
          ) : (
            <span className="text-zinc-500">아직 없음</span>
          )}
        </div>

        {settled ? (
          <div className="rounded-xl border-2 border-zinc-700 bg-zinc-900/60 p-3 text-center text-sm font-bold text-zinc-300">
            ✅ 정산 완료 — 보상은 우편함에서 수령
          </div>
        ) : !v.isParticipant ? (
          <div className="rounded-xl border border-zinc-700 p-3 text-center text-xs text-zinc-400">
            참여자가 아닙니다.
          </div>
        ) : (
          <div className="space-y-2">
            {canAttack ? (
              <button
                type="button"
                disabled={pending}
                onClick={attack}
                className="w-full rounded-full bg-gradient-to-r from-red-600 to-orange-500 px-4 py-3.5 text-sm font-extrabold text-white disabled:opacity-50"
              >
                ⚔️ {boss.name} 공격!  {left}/{allowed}
              </button>
            ) : !over && left <= 0 ? (
              <button
                type="button"
                disabled={pending}
                onClick={buyExtra}
                className="w-full rounded-full border-2 border-amber-400 bg-amber-400/10 px-4 py-3 text-sm font-bold text-amber-300 disabled:opacity-50"
              >
                💎 {raidExtraAttackCost(v.myExtraAttacks + 1)} 추가 공격
              </button>
            ) : (
              <div className="rounded-full bg-zinc-800 px-4 py-3 text-center text-sm text-zinc-400">
                {over ? '⏳ 정산 대기' : '공격 불가'}
              </div>
            )}
            {v.isHost && !over ? (
              <button
                type="button"
                onClick={invite}
                className="w-full rounded-full border-2 border-amber-300 bg-amber-400/10 px-4 py-3 text-sm font-extrabold text-amber-300"
              >
                🤝 동료 초대
              </button>
            ) : null}
          </div>
        )}

        <div>
          <div className="mb-1 text-[10px] font-semibold tracking-widest text-zinc-500">
            참여자 {v.participants.length}명 · 기여도
          </div>
          <ul className="space-y-1">
            {v.participants.map((p, i) => (
              <li
                key={i}
                className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px] ${
                  p.isMe ? 'bg-amber-900/40 ring-1 ring-amber-500/50' : 'bg-zinc-900'
                }`}
              >
                <span className="w-5 text-center">{MEDAL[i] ?? i + 1}</span>
                <span className="min-w-0 flex-1 truncate font-medium">
                  {p.nickname}
                  {p.isMe ? ' (나)' : ''}
                </span>
                <span className="font-mono tabular-nums text-zinc-300">
                  {p.totalDamage.toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-center text-[10px] text-zinc-500">
            보상은 전원 동일(기여도 무관) — 1회+ 공격 시 지급
          </p>
        </div>
      </div>
    </section>
  );
}
