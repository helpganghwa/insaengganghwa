import { formatCompactKR } from '@/lib/ui/format-number';
import {
  INVITE_BOX_PER_REFERRAL,
  INVITE_DIAMOND_PER_REFERRAL,
} from '@/lib/game/referral/stats';

/**
 * 초대 보상 표시 섹션 — 내 프로필 자랑하기 아래에 노출.
 * 통계 3종(초대 친구 / 획득 💎 / 획득 📦) + 보상 정책 1줄 안내.
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
    <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <header className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium">🎟 친구 초대</h2>
      </header>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Stat label="초대한 친구" value={totalReferrals} />
        <Stat label="획득 💎" value={totalDiamondEarned} />
        <Stat label="획득 📦" value={totalBoxEarned} />
      </div>

      <p className="mt-3 text-center text-[11px] leading-relaxed text-zinc-500">
        내 공유 링크로 가입한 친구 1명당 💎 {INVITE_DIAMOND_PER_REFERRAL.toLocaleString('ko-KR')} ·
        📦 {INVITE_BOX_PER_REFERRAL}개(무기·방어구·장신구 각 1)
      </p>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-0.5 font-mono text-lg font-bold tabular-nums">
        {formatCompactKR(value)}
      </div>
    </div>
  );
}
