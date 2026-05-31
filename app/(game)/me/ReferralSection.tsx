import { formatCompactKR } from '@/lib/ui/format-number';

/**
 * 카카오톡 공유 가입 보상 — 카카오 노랑 액센트(좌측 strip + 아이콘)로
 * '카톡 공유 → 친구 가입' 연결을 시각화. 컴팩트하지만 폰트는 가독.
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
    <section className="relative overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      {/* 좌측 카카오 노랑 strip — 시각적 카톡 연결 표시 */}
      <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-[#FEE500]" />
      <div className="pl-3 pr-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <svg aria-hidden viewBox="0 0 24 24" className="h-3.5 w-3.5 text-[#FEE500]" fill="currentColor">
            <path d="M12 3C6.477 3 2 6.477 2 10.7c0 2.61 1.66 4.92 4.2 6.3l-.83 3.05a.4.4 0 0 0 .6.42l3.66-2.43c.77.12 1.56.19 2.37.19 5.523 0 10-3.477 10-7.74S17.523 3 12 3Z" />
          </svg>
          <h2 className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">
            카카오톡 공유 가입 보상
          </h2>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-1 text-center">
          <Stat label="초대한 친구" value={totalReferrals} unit="명" />
          <Stat label="획득" value={totalDiamondEarned} unit="💎" />
          <Stat label="획득" value={totalBoxEarned} unit="📦" />
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div className="rounded-lg bg-zinc-50 px-2 py-1.5 dark:bg-zinc-900">
      <div className="text-[10px] text-zinc-500">{label}</div>
      <div className="mt-0.5 font-mono text-sm font-bold tabular-nums text-zinc-900 dark:text-zinc-100">
        {formatCompactKR(value)}
        <span className="ml-0.5 text-[10px] font-normal text-zinc-500">{unit}</span>
      </div>
    </div>
  );
}
