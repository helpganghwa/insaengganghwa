'use client';

import { assetUrl } from '@/lib/asset-versions';
import { TOWER_DAILY_ATTEMPTS, towerIsSpecial, towerReward } from '@/lib/game/balance';
import type { TowerFloorInfo } from '@/lib/game/tower/floors';

/**
 * 무한의 탑 공통 조각(시안 A 패널형) — 목록·층(상세+전투) 화면이 같은 바탕·패널·헤더 칩·버튼을 쓴다.
 * 바탕 = 그 구간 장면을 위에 깔고 아래로 거의 검게, 모든 카드 = 같은 반투명 패널.
 */
export const PANEL = 'rounded-[14px] border border-[rgba(168,145,107,.28)] bg-[rgba(18,17,16,.82)]';
export const PIX = { imageRendering: 'pixelated' as const };
export const n = (v: number) => v.toLocaleString('ko-KR');

export function pageBg(scene: string): React.CSSProperties {
  return {
    backgroundColor: '#141312',
    backgroundImage: `linear-gradient(180deg, rgba(43,42,40,.35), rgba(20,19,18,.96) 42%), url(${assetUrl(`/sprites/tower/scene/${scene}.png`)})`,
    backgroundSize: '100% auto',
    backgroundPosition: 'top center',
    backgroundRepeat: 'no-repeat',
    ...PIX,
  };
}

export function rewardText(floor: number) {
  const r = towerReward(floor);
  return `💎 ${n(r.diamond)}${r.boxes ? ` · 📦 ${r.boxes}` : ''}`;
}

/** 헤더 오른쪽 칩 — 오늘 남은 도전 N/3(다 쓰면 N만 빨간색). */
export function AttemptsChip({ left }: { left: number }) {
  return (
    <span className="rounded-full border border-[rgba(168,145,107,.28)] bg-black/45 px-2.5 py-0.5 text-[11px] tabular-nums text-zinc-200">
      오늘 도전 <b className={left <= 0 ? 'text-red-400' : 'text-zinc-50'}>{left}</b>
      <span className="text-zinc-400">/{TOWER_DAILY_ATTEMPTS}</span>
    </span>
  );
}

/** 층 머리 줄 — 'N층 · 장소 (· 특별층)'. 목록 층 카드·층 화면 무대 위가 같은 모양. 색 역할: 머리 줄은 회색, 특별층 표시만 빨강. */
export function FloorKicker({ floor, info, extra }: { floor: number; info: TowerFloorInfo; extra?: React.ReactNode }) {
  const sp = towerIsSpecial(floor);
  return (
    <span className="min-w-0 truncate text-[10.5px] font-bold text-zinc-300">
      {sp ? <span className="text-red-300">✦ </span> : null}
      {floor}층 · {info.theme}
      {sp ? <span className="text-red-300"> · 특별층</span> : null}
      {extra ? <> · {extra}</> : null}
    </span>
  );
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
