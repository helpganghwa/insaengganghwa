import { formatCompactKR } from '@/lib/ui/format-number';

/**
 * 카카오톡 공유 가입 보상 — 얇은 전체 카카오 노랑 보더로 카톡 연결 톤.
 */
export function ReferralSection({
  totalReferrals,
  totalDiamondEarned,
  totalBoxEarned,
}: {
  totalReferrals: number;
  totalDiamondEarned: number;
  totalBoxEarned: number;
}) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">
        카카오톡 공유 가입 보상
      </h2>
      <div className="mt-2 grid grid-cols-3 gap-1 text-center">
        <Stat label="초대한 친구" value={totalReferrals} />
        <Stat label="💎" value={totalDiamondEarned} />
        <Stat label="📦" value={totalBoxEarned} />
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-zinc-50 px-2 py-1.5 dark:bg-zinc-900">
      <div className="text-[10px] text-zinc-500">{label}</div>
      <div className="mt-0.5 font-mono text-sm font-bold tabular-nums text-zinc-900 dark:text-zinc-100">
        {formatCompactKR(value)}
      </div>
    </div>
  );
}
