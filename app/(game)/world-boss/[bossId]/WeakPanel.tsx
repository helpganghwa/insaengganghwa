'use client';

/**
 * 약점 패널(docs/WORLD-BOSS.md §3) — 지금 페이즈에서 맞혀서 공개된 약점과 내 장착 상태. 누가 밝혔는지는 보이지 않는다(10-10 사용자).
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
      {/* 약점은 주황 테두리로만(라벨 없음, 10-10 사용자) · 아바타 보너스만 +50% 배지 */}
      {av && <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-[3px] bg-violet-600 px-0.5 text-[8px] font-extrabold leading-[1.35] text-white">+50%</span>}
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
        // 그림만 간단히(10-10 사용자) — 이름은 title로. 줄바꿈해도 한 칸 36px라 30개여도 네 줄 안쪽.
        <div className="mt-1.5 flex flex-wrap gap-1">
          {weakKnown.map((w) => (
            <span key={w.code} title={w.name} className="flex h-9 w-9 items-center justify-center rounded-lg bg-stone-800/70">
              <ItemImg src={w.src} className="h-8 w-8" />
            </span>
          ))}
        </div>
      )}
      <p className="mt-1.5 text-[10px] leading-snug text-stone-500">약점 장비는 전투력 2배 · 약점 장비 2개 이상 장착 시 높은 보상 획득 확률 증가</p>

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
