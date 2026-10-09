'use client';

/**
 * 약점 패널(docs/WORLD-BOSS.md §3) — 지금 페이즈에서 맞혀서 공개된 약점(발견자 이름)과 내 장착 상태.
 * 공개 전 약점은 아무도 모른다. "약점에 맞춰 장착"은 공개된 약점과 아바타 보너스까지 계산한 가장 좋은 조합으로 바꾼다.
 */
import type { KnownWeak, Loadout, LoadoutPiece } from '@/lib/game/world-boss/loadout';
import { formatCompactKR } from '@/lib/ui/format-number';

function ItemImg({ src, className = 'h-8 w-8' }: { src: string | null; className?: string }) {
  if (!src) return <span className={`${className} rounded bg-stone-800`} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" className={`${className} object-contain`} style={{ imageRendering: 'pixelated' }} />;
}

function Piece({ p, hasAvatar }: { p: LoadoutPiece; hasAvatar: boolean }) {
  const av = p.av || (hasAvatar && p.weak);
  return (
    <div className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${p.weak ? 'bg-orange-950/60 ring-1 ring-orange-500/70' : 'bg-stone-800/70'}`} title={p.name}>
      <ItemImg src={p.src} className="h-9 w-9" />
      <span className="absolute -bottom-1 left-1/2 flex -translate-x-1/2 gap-px text-[8px] font-extrabold leading-[1.35]">
        {p.weak && <span className="rounded-[3px] bg-orange-600 px-0.5 text-orange-50">약점</span>}
        {av && <span className="rounded-[3px] bg-violet-600 px-0.5 text-white">+50%</span>}
      </span>
    </div>
  );
}

export function WeakPanel({
  phase,
  weakKnown,
  weakTotal,
  mine,
  pending,
  onEquipBest,
}: {
  phase: { index: number; from: number; to: number };
  weakKnown: KnownWeak[];
  weakTotal: number;
  mine: { loadout: Loadout; best: { power: number; pieces: LoadoutPiece[] } | null } | null;
  pending: boolean;
  onEquipBest: () => void;
}) {
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
        // 한 줄 가로 스크롤 — 많아져도 패널 높이가 늘지 않는다.
        <div className="-mx-3 mt-1.5 flex gap-1.5 overflow-x-auto px-3 pb-0.5 [scrollbar-width:none]">
          {weakKnown.map((w) => (
            <div key={w.code} className="flex w-[104px] shrink-0 items-center gap-1 rounded-lg bg-stone-800/70 px-1.5 py-1">
              <ItemImg src={w.src} className="h-7 w-7 shrink-0" />
              <span className="min-w-0 leading-tight">
                <span className="block truncate text-[10.5px] text-stone-200">{w.name}</span>
                <span className="block truncate text-[9px] text-stone-500">{w.finder}</span>
              </span>
            </div>
          ))}
        </div>
      )}
      <p className="mt-1.5 text-[10px] leading-snug text-stone-500">
        약점 장비는 피해 2배 · 한 번에 2개 이상 맞히면 보상 운 상승 · {phase.to + 1}단계부터 약점이 바뀌어요
      </p>

      {mine && (
        <div className="mt-2 flex items-center gap-2 border-t border-stone-800 pt-2.5">
          {mine.loadout.pieces.length === 0 ? (
            <p className="flex-1 text-[11px] text-stone-400">장착한 장비가 없어요. 장착 장비 3개로 싸워요.</p>
          ) : (
            <div className="flex shrink-0 gap-1.5">
              {mine.loadout.pieces.map((p) => (
                <Piece key={p.slot} p={p} hasAvatar={mine.loadout.hasAvatar} />
              ))}
            </div>
          )}
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block text-[10px] text-stone-500">내 전투력</span>
            <b className="block text-[15px] font-extrabold text-orange-300">{formatCompactKR(mine.loadout.power)}</b>
          </span>
          {mine.best && (
            <button
              type="button"
              disabled={pending}
              onClick={onEquipBest}
              className="shrink-0 rounded-lg border border-orange-500/60 bg-orange-500/15 px-2 py-1.5 text-center leading-tight disabled:opacity-40"
            >
              <span className="block text-[11px] font-extrabold text-orange-200">약점에 맞춰 장착</span>
              <span className="block text-[9.5px] text-orange-300/80">{formatCompactKR(mine.best.power)}로</span>
            </button>
          )}
        </div>
      )}
      {mine && !mine.loadout.hasAvatar && (
        <p className="mt-1.5 text-[10px] text-stone-500">대표 아바타를 장착 장비로 만들면 그 부위가 +50%예요.</p>
      )}
      {mine?.best && <p className="mt-1 text-[10px] text-stone-500">장착은 게임 전체에 적용돼요.</p>}
    </section>
  );
}
