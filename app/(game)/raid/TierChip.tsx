import { RAID_TIERS, type RaidTier } from '@/lib/game/balance';

/** 난이도 배지 — 목록 카드·상세 헤더·초대 랜딩 공용(어두운 보스 배경 위 반투명 톤). */
const TONE: Record<RaidTier, string> = {
  easy: 'bg-emerald-500/25 text-emerald-200 ring-emerald-400/40',
  normal: 'bg-sky-500/25 text-sky-200 ring-sky-400/40',
  hard: 'bg-rose-500/25 text-rose-200 ring-rose-400/40',
};

export function TierChip({ tier, className = '' }: { tier: RaidTier; className?: string }) {
  return (
    <span
      className={`inline-block rounded px-1 py-px align-middle text-[9px] font-extrabold ring-1 ring-inset ${TONE[tier]} ${className}`}
    >
      {RAID_TIERS[tier].label}
    </span>
  );
}
