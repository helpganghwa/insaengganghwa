import { formatCompactKR } from '@/lib/ui/format-number';

/**
 * 초대 보상 표시 — 컴팩트(사용자 결정 2026-05-31).
 * 타이틀 이모지·정책 안내문 없음. 숫자 폰트 작게.
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
      <h2 className="text-[11px] font-medium text-zinc-500">친구 초대</h2>
      <div className="mt-1.5 grid grid-cols-3 gap-1 text-center">
        <Stat label="초대한 친구" value={totalReferrals} />
        <Stat label="획득 💎" value={totalDiamondEarned} />
        <Stat label="획득 📦" value={totalBoxEarned} />
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-[10px] text-zinc-500">{label}</div>
      <div className="mt-0.5 font-mono text-xs font-bold tabular-nums">
        {formatCompactKR(value)}
      </div>
    </div>
  );
}
