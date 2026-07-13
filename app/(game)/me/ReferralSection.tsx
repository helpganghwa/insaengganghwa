'use client';

import { useState } from 'react';

import { BoastModal, type BoastPiece } from '@/components/BoastModal';
import { formatCompactKR } from '@/lib/ui/format-number';

/**
 * 카카오톡 공유 가입 보상 — 얇은 전체 카카오 노랑 보더로 카톡 연결 톤.
 * 섹션 전체 탭 → 자랑하기(BoastModal) 팝업(2026-07-13: 공유 도달률 개선 — 통계만 보이고
 * 공유 동선이 없어 아무도 공유하지 않던 문제). 제목 우측에 가입당 보상 라벨로 유인 명시.
 */
export function ReferralSection({
  totalReferrals,
  totalDiamondEarned,
  totalBoxEarned,
  perDiamond,
  perBox,
  boast,
}: {
  totalReferrals: number;
  totalDiamondEarned: number;
  totalBoxEarned: number;
  /** 가입당 보상(라벨) — lib/game/referral/stats 상수를 서버에서 주입(공시 일치). */
  perDiamond: number;
  perBox: number;
  /** 자랑하기 팝업 데이터 — /me의 BoastLauncher와 동일 세트. */
  boast: {
    nickname: string;
    publicCode: string;
    pieces: BoastPiece[];
    total: number;
    profileImg: string | null;
    guildEmblemUrl: string | null;
    guildName: string | null;
    serverId: number;
  };
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="카카오톡 공유하기"
        className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-left transition active:scale-[0.99] dark:border-zinc-800 dark:bg-zinc-950"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">
            카카오톡 공유 가입 보상
          </h2>
          <span className="shrink-0 rounded-full bg-[#FEE500] px-2 py-0.5 text-[10px] font-bold text-[#191919]">
            가입당 💎{perDiamond.toLocaleString('ko-KR')} 📦{perBox}
          </span>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-1 text-center">
          <Stat label="초대한 친구" value={totalReferrals} />
          <Stat label="💎" value={totalDiamondEarned} />
          <Stat label="📦" value={totalBoxEarned} />
        </div>
      </button>
      <BoastModal
        open={open}
        onClose={() => setOpen(false)}
        nickname={boast.nickname}
        publicCode={boast.publicCode}
        set={{ pieces: boast.pieces, total: boast.total }}
        profileImg={boast.profileImg}
        guildEmblemUrl={boast.guildEmblemUrl}
        guildName={boast.guildName}
        serverId={boast.serverId}
      />
    </>
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
