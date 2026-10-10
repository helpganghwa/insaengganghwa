'use client';

/**
 * 약점 패널(docs/WORLD-BOSS.md §3) — 지금 페이즈에서 맞혀서 공개된 약점과 내 장착 상태. 누가 밝혔는지는 보이지 않는다(10-10 사용자).
 * 공개 전 약점은 아무도 모른다. "약점에 맞춰 장착"은 공개된 약점과 아바타 보너스까지 계산한 가장 좋은 조합으로 바꾼다.
 * weakBonus는 보스 특성(치명 약점이면 2.0) — 규칙 문구·배지 배율이 함께 바뀐다.
 */
import { useEffect, useRef } from 'react';

import { WORLD_BOSS_AVATAR_BONUS, WORLD_BOSS_WEAK_BONUS } from '@/lib/game/guild/balance';
import type { KnownWeak, Loadout, LoadoutPiece } from '@/lib/game/world-boss/loadout';
import { formatCompactKR } from '@/lib/ui/format-number';

function ItemImg({ src, className = 'h-8 w-8' }: { src: string | null; className?: string }) {
  if (!src) return <span className={`${className} rounded bg-stone-800`} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" className={`${className} object-contain`} style={{ imageRendering: 'pixelated' }} />;
}

function Piece({ p, hasAvatar, weakBonus }: { p: LoadoutPiece; hasAvatar: boolean; weakBonus: number }) {
  const av = p.av || (hasAvatar && p.weak);
  // 배지는 그 부위에 실제로 곱해지는 배율 하나만(×1.5 아바타 · ×2 약점 · ×2.5 둘 다) — '+50%'가 약점 보너스로 읽히던 혼동(10-10 사용자).
  const mult = 1 + (av ? WORLD_BOSS_AVATAR_BONUS : 0) + (p.weak ? weakBonus : 0);
  const label = mult > 1 ? `×${Number.isInteger(mult) ? mult : mult.toFixed(1)}` : null;
  return (
    <div className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${p.weak ? 'bg-orange-950/60 ring-1 ring-orange-500/70' : 'bg-stone-800/70'}`} title={p.name}>
      <ItemImg src={p.src} className="h-9 w-9" />
      {label && (
        <span className={`absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-[3px] px-1 text-[8.5px] font-extrabold leading-[1.35] text-white ${p.weak ? 'bg-orange-600' : 'bg-violet-600'}`}>
          {label}
        </span>
      )}
    </div>
  );
}

/** 가로 스크롤 행 — PC 마우스 휠(세로)도 가로로 흘려 보낸다(10-10 사용자). preventDefault가 필요해 React onWheel 대신 직접 등록한다. */
function useWheelToHorizontal() {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return;
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);
  return ref;
}

export function WeakPanel({
  phase,
  weakKnown,
  weakTotal,
  weakBonus = WORLD_BOSS_WEAK_BONUS,
  mine,
  onEquipBest,
}: {
  phase: { index: number; from: number; to: number };
  weakKnown: KnownWeak[];
  weakTotal: number;
  weakBonus?: number;
  mine: { loadout: Loadout; best: { power: number; pieces: LoadoutPiece[] } | null } | null;
  onEquipBest: () => void;
}) {
  const rowRef = useWheelToHorizontal();
  const weakMult = 1 + weakBonus;
  return (
    <section className="mx-3 mt-3 rounded-xl border border-stone-800 bg-stone-900 px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <b className="text-[13px] text-stone-100">
          약점 <span className="text-[11px] font-normal text-stone-500">{phase.from}~{phase.to}단계</span>
        </b>
        <span className="text-[11px] text-stone-500">
          밝혀짐 <b className="text-orange-300">{weakKnown.length}</b>/{weakTotal}
        </span>
      </div>
      {weakKnown.length === 0 ? (
        <p className="mt-1 text-[11px] text-stone-400">아직 없어요. 약점 장비로 공격하면 하나씩 드러나요.</p>
      ) : (
        // 그림만 한 줄 가로 스크롤(10-10 사용자) — 이름은 title로. 휠로도 넘어가고 얇은 스크롤바를 보여 PC에서도 스크롤되는 것이 보인다.
        <div ref={rowRef} className="-mx-3 mt-1.5 flex gap-1 overflow-x-auto px-3 pb-1 [scrollbar-color:#57534e_transparent] [scrollbar-width:thin]">
          {weakKnown.map((w) => (
            <span key={w.code} title={w.name} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-stone-800/70">
              <ItemImg src={w.src} className="h-8 w-8" />
            </span>
          ))}
        </div>
      )}
      <p className="mt-1.5 text-[10px] leading-snug text-stone-500">
        약점 장비는 전투력 {Number.isInteger(weakMult) ? weakMult : weakMult.toFixed(1)}배 · 약점 장비 2개 이상 장착 시 높은 보상 획득 확률 증가
      </p>

      {mine && (
        <div className="mt-2 flex items-center gap-2 border-t border-stone-800 pt-2.5">
          {mine.loadout.pieces.length === 0 ? (
            <p className="flex-1 text-[11px] text-stone-400">장착한 장비가 없어요. 장착 장비 3개로 싸워요.</p>
          ) : (
            <div className="flex shrink-0 gap-1.5">
              {mine.loadout.pieces.map((p) => (
                <Piece key={p.slot} p={p} hasAvatar={mine.loadout.hasAvatar} weakBonus={weakBonus} />
              ))}
            </div>
          )}
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block text-[10px] text-stone-500">내 전투력</span>
            <b className="block text-[15px] font-extrabold text-orange-300">{formatCompactKR(mine.loadout.power)}</b>
          </span>
          {mine.best && (
            // 낙관적: 누르면 상위에서 best가 비워져 버튼이 바로 사라진다 — pending으로 잠그지 않는다.
            <button
              type="button"
              onClick={onEquipBest}
              className="shrink-0 rounded-lg border border-orange-500/60 bg-orange-500/15 px-2 py-1.5 text-center leading-tight"
            >
              <span className="block text-[11px] font-extrabold text-orange-200">약점에 맞춰 장착</span>
              <span className="block text-[9.5px] text-orange-300/80">{formatCompactKR(mine.best.power)}</span>
            </button>
          )}
        </div>
      )}
      {mine && !mine.loadout.hasAvatar && (
        <p className="mt-1.5 text-[10px] text-stone-500">대표 아바타를 장착 장비로 만들면 그 부위가 +50%예요.</p>
      )}
    </section>
  );
}
