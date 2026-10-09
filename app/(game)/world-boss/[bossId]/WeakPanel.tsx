'use client';

/**
 * 약점 패널(docs/WORLD-BOSS.md §3) — 지금 페이즈에서 맞혀서 공개된 약점(발견자 이름)과 내 장착 상태.
 * 공개 전 약점은 아무도 모른다. "약점에 맞춰 장착"은 공개된 약점과 아바타 보너스까지 계산한 가장 좋은 조합으로 바꾼다.
 */
import type { KnownWeak, Loadout, LoadoutPiece } from '@/lib/game/world-boss/loadout';
import { formatCompactKR } from '@/lib/ui/format-number';

const SLOT_LABEL = { weapon: '무기', armor: '방어구', accessory: '장신구' } as const;

function ItemImg({ src, className = 'h-8 w-8' }: { src: string | null; className?: string }) {
  if (!src) return <span className={`${className} rounded bg-zinc-800`} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" className={`${className} object-contain`} style={{ imageRendering: 'pixelated' }} />;
}

function Piece({ p, hasAvatar }: { p: LoadoutPiece; hasAvatar: boolean }) {
  const av = p.av || (hasAvatar && p.weak);
  return (
    <div className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 ${p.weak ? 'bg-amber-950/50 ring-1 ring-amber-500/50' : 'bg-zinc-800/60'}`}>
      <ItemImg src={p.src} />
      <span className="w-full truncate text-center text-[10px] text-zinc-300">{p.name}</span>
      <span className="flex gap-0.5 text-[9px] font-bold">
        {p.weak && <span className="rounded bg-amber-500/90 px-1 text-amber-950">약점</span>}
        {av && <span className="rounded bg-violet-500/80 px-1 text-white">아바타</span>}
        {!p.weak && !av && <span className="text-zinc-500">{SLOT_LABEL[p.slot]}</span>}
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
    <section className="mx-3 mt-3 rounded-xl border border-zinc-800 bg-zinc-900 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <b className="text-[13px] text-zinc-100">
          약점 <span className="text-[11px] font-normal text-zinc-500">· {phase.from}~{phase.to}단계</span>
        </b>
        <span className="text-[11px] text-zinc-500">
          밝혀진 약점 <b className="text-amber-300">{weakKnown.length}</b>/{weakTotal}
        </span>
      </div>
      {weakKnown.length === 0 ? (
        <p className="mt-1.5 text-[11.5px] text-zinc-400">아직 밝혀진 약점이 없어요. 원정대가 약점 장비로 공격하면 하나씩 드러나요.</p>
      ) : (
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {weakKnown.map((w) => (
            <div key={w.code} className="flex min-w-0 items-center gap-1 rounded-lg bg-zinc-800/60 px-1.5 py-1">
              <ItemImg src={w.src} className="h-7 w-7 shrink-0" />
              <span className="min-w-0 leading-tight">
                <span className="block truncate text-[10.5px] text-zinc-200">{w.name}</span>
                <span className="block truncate text-[9px] text-zinc-500">{w.finder}</span>
              </span>
            </div>
          ))}
        </div>
      )}
      <p className="mt-2 text-[10.5px] text-zinc-500">
        약점 장비는 피해가 두 배예요. 한 공격에 약점을 두 개 이상 맞히면 공격 보상 운도 좋아져요. 약점은 {phase.to + 1}단계부터 바뀌어요.
      </p>

      {mine && (
        <div className="mt-2.5 border-t border-zinc-800 pt-2.5">
          <div className="mb-1.5 flex items-baseline justify-between">
            <b className="text-[12px] text-zinc-200">내 장착</b>
            <span className="text-[11px] text-zinc-400">
              월드보스 전투력 <b className="text-amber-300">{formatCompactKR(mine.loadout.power)}</b>
            </span>
          </div>
          {mine.loadout.pieces.length === 0 ? (
            <p className="text-[11.5px] text-zinc-400">장착한 장비가 없어요. 장착한 장비 3개로 싸워요.</p>
          ) : (
            <div className="flex gap-1.5">
              {mine.loadout.pieces.map((p) => (
                <Piece key={p.slot} p={p} hasAvatar={mine.loadout.hasAvatar} />
              ))}
            </div>
          )}
          {!mine.loadout.hasAvatar && (
            <p className="mt-1.5 text-[10.5px] text-zinc-500">대표 아바타를 장착 장비로 만들면 그 부위가 +50%예요.</p>
          )}
          {mine.best && (
            <button
              type="button"
              disabled={pending}
              onClick={onEquipBest}
              className="mt-2 w-full rounded-lg border border-amber-500/60 bg-amber-500/15 py-2 text-[12.5px] font-extrabold text-amber-200 disabled:opacity-40"
            >
              약점에 맞춰 장착 · 전투력 {formatCompactKR(mine.best.power)}
            </button>
          )}
          {mine.best && <p className="mt-1 text-center text-[10px] text-zinc-500">장착은 게임 전체에 적용돼요</p>}
        </div>
      )}
    </section>
  );
}
