'use client';

import { towerHuntRange, towerReward } from '@/lib/game/balance';

/** 무한의 탑 층 화면(상세·전투) 공통 조각 — 픽셀 그림 표시·숫자·보상 문구·버튼 줄. */
export const PIX = { imageRendering: 'pixelated' as const };
export const n = (v: number) => v.toLocaleString('ko-KR');

export function rewardText(floor: number) {
  const r = towerReward(floor);
  return `💎 ${n(r.diamond)}${r.boxes ? ` · 📦 ${r.boxes}` : ''}`;
}

/** 토벌 💎 범위 — 위아래가 같으면 한 값. */
export function huntText(floor: number) {
  const { min, max } = towerHuntRange(floor);
  return `💎${min === max ? n(min) : `${n(min)}~${n(max)}`}`;
}

/** 아래 고정 버튼 줄 — 높이 44, 주 버튼 금색·보조 버튼 테두리. 두 개면 같은 크기. */
export function ActionBar({ children }: { children: React.ReactNode }) {
  return <div className="flex h-11 flex-none gap-2">{children}</div>;
}

export function PrimaryButton({ children, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...p}
      className="flex-1 rounded-xl bg-gradient-to-b from-[#e7a93a] to-[#c98622] text-[14px] font-black text-[#2a1a05] shadow-[0_2px_10px_rgba(0,0,0,.4)] disabled:opacity-50"
    >
      {children}
    </button>
  );
}

export function SecondaryButton({ children, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" {...p} className="flex-1 rounded-xl border border-[rgba(168,145,107,.4)] bg-[rgba(18,17,16,.7)] text-[13px] font-extrabold text-zinc-200 disabled:opacity-50">
      {children}
    </button>
  );
}
