'use client';

/**
 * 약점 패널(docs/WORLD-BOSS.md §3) — 지금 페이즈에서 맞혀서 공개된 약점과 내 장착 상태. 누가 밝혔는지는 보이지 않는다(10-10 사용자).
 * 공개 전 약점은 아무도 모른다. "추천 장비 장착"(10-11 사용자: 약점이 없을 때도 아바타 보너스로 추천하므로 '약점에 맞춰'가 아니다)은 공개된 약점과 아바타 보너스까지 계산한 가장 좋은 조합으로 바꾼다.
 * 내 장착(10-11 A안): 윗줄 = 대표 아바타 전신 + 장비 3칸(아바타 +50% 보라 · 약점 +100% 주황 배지를 따로) + 내 전투력, 아랫줄 = 합산을 기본·아바타·약점으로 나눈 분해 + "추천 장비 장착" 버튼(한 줄에 다 넣으면 390에서 배지끼리 겹치고 전투력이 잘린다).
 * 표기는 전부 +%로 통일한다(둘은 곱이 아니라 더해지므로 ×N을 섞으면 틀리게 읽힌다). weakBonus는 보스 특성(치명 약점이면 2.0 = +200%).
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

const pct = (x: number) => `+${Math.round(x * 100)}%`;

/** 그 부위에 아바타 보너스가 붙는가 — 커스텀 아바타면 약점 장비 부위도 유지(loadout.ts piecePower와 같은 규칙). */
const avatarOn = (p: LoadoutPiece, hasAvatar: boolean) => p.av || (hasAvatar && p.weak);

function Piece({ p, hasAvatar, weakBonus }: { p: LoadoutPiece; hasAvatar: boolean; weakBonus: number }) {
  const av = avatarOn(p, hasAvatar);
  return (
    <div className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${p.weak ? 'bg-orange-950/60 ring-1 ring-orange-500/70' : 'bg-stone-800/70'}`} title={p.name}>
      <ItemImg src={p.src} className="h-9 w-9" />
      {/* 배지는 위(아바타 보라)·아래(약점 주황)로 나눠 단다 — 나란히 두면 44px 칸보다 넓어 옆 칸 배지와 겹친다. */}
      {av && <span className="absolute -top-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-[3px] bg-violet-600 px-[3px] text-[8px] font-extrabold leading-[1.35] text-white">{pct(WORLD_BOSS_AVATAR_BONUS)}</span>}
      {p.weak && <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-[3px] bg-orange-600 px-[3px] text-[8px] font-extrabold leading-[1.35] text-white">{pct(weakBonus)}</span>}
    </div>
  );
}

/** 대표 아바타 전신 — 정사각이 아니라 세로로 긴 칸에 아래 정렬, 비율은 그대로(옆을 자르지 않는다). */
function AvatarBody({ src }: { src: string | null }) {
  return (
    <span className="flex h-14 w-10 shrink-0 items-end justify-center rounded-md bg-stone-800/60" title="대표 아바타">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" decoding="async" draggable={false} className="h-full w-full object-contain object-bottom" style={{ imageRendering: 'pixelated' }} />
      ) : (
        <span className="pb-1 text-base">👤</span>
      )}
    </span>
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
  avatarSrc,
  onEquipBest,
}: {
  phase: { index: number; from: number; to: number };
  weakKnown: KnownWeak[];
  weakTotal: number;
  weakBonus?: number;
  mine: { loadout: Loadout; best: { power: number; pieces: LoadoutPiece[] } | null } | null;
  /** 대표 아바타 정면 전신(활성 프로필). 없으면 null → 👤. */
  avatarSrc: string | null;
  onEquipBest: () => void;
}) {
  const rowRef = useWheelToHorizontal();
  // 합산 분해 — 기본(장비 3개 전투력 합) · 아바타(+50% 부위의 더해지는 값) · 약점(+100% 부위의 더해지는 값). loadout.power와 같은 식.
  const parts = (() => {
    if (!mine) return null;
    const { pieces, hasAvatar } = mine.loadout;
    let base = 0, av = 0, weak = 0;
    for (const p of pieces) {
      base += p.cp;
      if (avatarOn(p, hasAvatar)) av += p.cp * WORLD_BOSS_AVATAR_BONUS;
      if (p.weak) weak += p.cp * weakBonus;
    }
    return { base: Math.round(base), av: Math.round(av), weak: Math.round(weak) };
  })();
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
        약점 장비는 전투력 {pct(weakBonus)} · 약점 장비 2개 이상 장착 시 높은 보상 획득 확률 증가
      </p>

      {mine && parts && (
        <>
          <div className="mt-2 flex items-center gap-2 border-t border-stone-800 pt-2.5">
            <AvatarBody src={avatarSrc} />
            {mine.loadout.pieces.length === 0 ? (
              <p className="flex-1 text-[11px] text-stone-400">장착한 장비가 없어요. 장착 장비 3개로 싸워요.</p>
            ) : (
              <div className="flex shrink-0 gap-2">
                {mine.loadout.pieces.map((p) => (
                  <Piece key={p.slot} p={p} hasAvatar={mine.loadout.hasAvatar} weakBonus={weakBonus} />
                ))}
              </div>
            )}
            <span className="min-w-0 flex-1 text-right leading-tight">
              <span className="block text-[10px] text-stone-500">내 전투력</span>
              <b className="block text-[16px] font-extrabold text-orange-300">{formatCompactKR(mine.loadout.power)}</b>
            </span>
          </div>
          {(mine.loadout.pieces.length > 0 || mine.best) && (
            <div className="mt-2 flex items-center justify-between gap-2">
              {mine.loadout.pieces.length > 0 ? (
                <p className="flex min-w-0 flex-wrap gap-x-2 text-[10px] text-stone-400">
                  <span>기본 <b className="font-bold text-stone-200">{formatCompactKR(parts.base)}</b></span>
                  <span className="text-violet-300">아바타 <b className="font-bold">+{formatCompactKR(parts.av)}</b></span>
                  <span className="text-orange-300">약점 <b className="font-bold">+{formatCompactKR(parts.weak)}</b></span>
                </p>
              ) : (
                <span />
              )}
              {mine.best && (
                // 낙관적: 누르면 상위에서 best가 비워져 버튼이 바로 사라진다 — pending으로 잠그지 않는다.
                <button
                  type="button"
                  onClick={onEquipBest}
                  className="shrink-0 rounded-lg border border-orange-500/60 bg-orange-500/15 px-2 py-1 text-[11px] font-extrabold leading-tight text-orange-200"
                >
                  추천 장비 장착 <span className="font-bold text-orange-300/80">{formatCompactKR(mine.best.power)}</span>
                </button>
              )}
            </div>
          )}
        </>
      )}
      {mine && !mine.loadout.hasAvatar && (
        <p className="mt-1.5 text-[10px] text-stone-500">대표 아바타를 장착 장비로 만들면 그 부위가 +50%예요.</p>
      )}
    </section>
  );
}
