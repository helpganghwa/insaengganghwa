'use client';

/**
 * 약점 패널(docs/WORLD-BOSS.md §3) — 지금 페이즈에서 맞혀서 공개된 약점과 내 장착 상태. 누가 밝혔는지는 보이지 않는다(10-10 사용자).
 * 공개 전 약점은 아무도 모른다. "추천 장비 장착"(10-11 사용자: 약점이 없을 때도 아바타 보너스로 추천하므로 '약점에 맞춰'가 아니다)은 공개된 약점과 아바타 보너스까지 계산한 가장 좋은 조합으로 바꾼다.
 * 내 장비(10-11 사용자 T1 — 무한의 탑 '내 장비' 줄 그대로): 부위마다 한 줄(그림 · 이름+강화 · 상태 칩 · 부위 전투력) → '아바타' 줄(만들 때 입은 장비 3칸, 지금 장착과 같으면 보라 빛 + 딱지) → 합.
 * 보너스가 둘이라 칩은 아바타(+50% 보라)·약점(+100% 주황)을 따로 달고, 줄 색은 약점 > 아바타 > 없음. 표기는 전부 +%(둘은 곱이 아니라 더해진다). weakBonus는 보스 특성(치명 약점이면 2.0 = +200%).
 */
import { useEffect, useRef } from 'react';

import { WORLD_BOSS_AVATAR_BONUS, WORLD_BOSS_WEAK_BONUS } from '@/lib/game/guild/balance';
import type { KnownWeak, Loadout, LoadoutPiece } from '@/lib/game/world-boss/loadout';
import { WEAK_SLOTS, type WeakSlot } from '@/lib/game/world-boss/weak';
import { formatCompactKR } from '@/lib/ui/format-number';

const SLOT_KO: Record<WeakSlot, string> = { weapon: '무기', armor: '방어구', accessory: '장신구' };
const PIX = { imageRendering: 'pixelated' } as const;

function ItemImg({ src, className = 'h-8 w-8' }: { src: string | null; className?: string }) {
  if (!src) return <span className={`${className} rounded bg-stone-800`} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" className={`${className} object-contain`} style={PIX} />;
}

const pct = (x: number) => `+${Math.round(x * 100)}%`;

/** 그 부위에 아바타 보너스가 붙는가 — 커스텀 아바타면 약점 장비 부위도 유지(loadout.ts piecePower와 같은 규칙). */
const avatarOn = (p: LoadoutPiece, hasAvatar: boolean) => p.av || (hasAvatar && p.weak);

/** 부위 한 줄 — 탑의 '내 장비' 줄: 왼쪽 2px 띠 · 그림 칸 · 이름+강화 · 칩 · 오른쪽 부위 전투력. */
function GearRow({ slot, p, hasAvatar, weakBonus }: { slot: WeakSlot; p: LoadoutPiece | undefined; hasAvatar: boolean; weakBonus: number }) {
  const av = !!p && avatarOn(p, hasAvatar);
  const weak = !!p?.weak;
  const power = p ? Math.round(p.cp * (1 + (av ? WORLD_BOSS_AVATAR_BONUS : 0) + (weak ? weakBonus : 0))) : 0;
  return (
    <div
      className={`-mx-3 flex items-center gap-2.5 border-l-2 py-1.5 pl-2.5 pr-3 ${
        weak ? 'border-l-orange-500 bg-orange-950/25' : av ? 'border-l-violet-500 bg-violet-950/15' : 'border-l-stone-700'
      }`}
    >
      <span
        className={`flex h-9 w-9 flex-none items-center justify-center rounded-md border ${
          weak ? 'border-orange-500 bg-orange-950/60 shadow-[0_0_8px_rgba(249,115,22,.35)]' : av ? 'border-violet-500 bg-violet-950/50' : 'border-stone-700 bg-stone-900'
        } ${p ? '' : 'opacity-40'}`}
      >
        {p && <ItemImg src={p.src} className="h-7 w-7" />}
      </span>
      <span className={`min-w-0 flex-1 leading-tight ${!p || (!weak && !av) ? 'opacity-70' : ''}`}>
        <span className="block truncate text-[12px] text-stone-100">
          {p ? p.name : <span className="text-stone-500">{SLOT_KO[slot]} 없음</span>}
          {p && <span className="text-stone-500"> +{p.level}{p.transcend ? ` · 초월 ${p.transcend}` : ''}</span>}
        </span>
        <span className="mt-0.5 flex items-center gap-1 text-[10.5px] text-stone-500">
          {av && <span className="rounded bg-violet-600 px-1 text-[9.5px] font-black leading-[1.5] text-white">{pct(WORLD_BOSS_AVATAR_BONUS)} 아바타</span>}
          {weak && <span className="rounded bg-orange-600 px-1 text-[9.5px] font-black leading-[1.5] text-white">{pct(weakBonus)} 약점</span>}
          {p && !av && !weak && <span className="rounded border border-stone-700 px-1 text-[9.5px] font-black leading-[1.5] text-stone-500">보너스 없음</span>}
          {SLOT_KO[slot]}
        </span>
      </span>
      <b className={`flex-none tabular-nums ${weak ? 'text-[13px] text-orange-300' : av ? 'text-[12.5px] text-violet-300' : 'text-[12.5px] text-stone-100'}`}>
        {p ? formatCompactKR(power) : '-'}
      </b>
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
          {/* 내 장비 헤더 — 탑의 '착용 가능 장비 보기 ›' 자리에 추천 장착 링크. 낙관적: 누르면 상위에서 best가 비워져 링크가 바로 사라진다. */}
          <div className="mt-2 flex items-baseline justify-between border-t border-stone-800 pt-2.5 pb-1">
            <span className="text-[11px] font-bold text-stone-500">내 장비</span>
            {mine.best && (
              <button type="button" onClick={onEquipBest} className="text-[11px] text-stone-400">
                추천 장비 장착 <b className="font-bold text-orange-300">{formatCompactKR(mine.best.power)} ›</b>
              </button>
            )}
          </div>
          {WEAK_SLOTS.map((slot) => (
            <GearRow key={slot} slot={slot} p={mine.loadout.pieces.find((x) => x.slot === slot)} hasAvatar={mine.loadout.hasAvatar} weakBonus={weakBonus} />
          ))}
          {/* 아바타 줄 — 탑과 같이: '아바타' · 작은 전신 · 만들 때 입은 장비 3칸(지금 장착과 같으면 보라 빛 + 딱지, 아니면 흐리게). */}
          <div className="flex items-center gap-2 py-1.5 text-[12px]">
            <span className="flex-none text-stone-400">아바타</span>
            {avatarSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarSrc} alt="" decoding="async" draggable={false} className="h-8 w-auto" style={PIX} />
            ) : (
              <span className="text-base">👤</span>
            )}
            {mine.loadout.hasAvatar && mine.loadout.avatarGear.length > 0 ? (
              <span className="flex items-center gap-1.5 pl-0.5">
                {mine.loadout.avatarGear.map((g) => (
                  <span
                    key={g.slot}
                    title={SLOT_KO[g.slot]}
                    className={`relative flex h-[26px] w-[26px] items-center justify-center rounded-[5px] border ${
                      g.on ? 'border-violet-500 bg-violet-950/50 shadow-[0_0_8px_rgba(139,92,246,.4)]' : 'border-stone-700 bg-stone-900 opacity-45'
                    }`}
                  >
                    <ItemImg src={g.src} className="h-5 w-5" />
                    {g.on && <span className="absolute -right-2 -top-1.5 rounded-[3px] bg-violet-600 px-[3px] text-[8px] font-black leading-[1.4] text-white">{pct(WORLD_BOSS_AVATAR_BONUS)}</span>}
                  </span>
                ))}
              </span>
            ) : (
              <span className="text-[10.5px] text-stone-500">만들 때 입은 장비 없음</span>
            )}
            <span className="ml-auto text-[10.5px] text-stone-500">{mine.loadout.hasAvatar ? `같은 장비·약점 장비면 ${pct(WORLD_BOSS_AVATAR_BONUS)}` : `대표 아바타를 만들면 ${pct(WORLD_BOSS_AVATAR_BONUS)}`}</span>
          </div>
          {/* 합 — 부위 전투력을 그대로 더한 값 = 월드보스에서 싸우는 전투력(공개된 약점 기준). */}
          <div className="mt-1 flex items-baseline justify-between border-t border-dashed border-stone-700 pt-2">
            <span className="text-[12px] text-stone-400">내 전투력</span>
            <b className="text-[18px] font-black tabular-nums text-orange-300">{formatCompactKR(mine.loadout.power)}</b>
          </div>
          {mine.loadout.pieces.length > 0 && (
            <p className="mt-0.5 flex flex-wrap gap-x-2 text-[10px] text-stone-400">
              <span>기본 <b className="font-bold text-stone-200">{formatCompactKR(parts.base)}</b></span>
              <span className="text-violet-300">아바타 <b className="font-bold">+{formatCompactKR(parts.av)}</b></span>
              <span className="text-orange-300">약점 <b className="font-bold">+{formatCompactKR(parts.weak)}</b></span>
            </p>
          )}
        </>
      )}
    </section>
  );
}
