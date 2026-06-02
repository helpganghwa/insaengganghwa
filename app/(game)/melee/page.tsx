import { assetUrl } from '@/lib/asset-versions';

/**
 * /melee — 대난투 (추후 개발). 현재는 콜로세움 배경 + '준비 중' 안내만.
 * 배경: public/sprites/hub/melee.png (Pixellab object 생성 콜로세움, 불투명 풀프레임).
 */
export default function MeleePage() {
  return (
    <div className="px-4 py-6">
      <div className="relative flex h-72 flex-col items-center justify-end overflow-hidden rounded-2xl border border-zinc-800">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={assetUrl('/sprites/hub/melee.png')}
          alt=""
          aria-hidden
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover"
          style={{ imageRendering: 'pixelated' }}
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/15" />
        <div className="relative z-10 pb-6 text-center">
          <h1 className="text-2xl font-extrabold text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
            대난투
          </h1>
          <p className="mt-1 text-sm font-semibold text-amber-300 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
            준비 중 — 곧 공개됩니다
          </p>
        </div>
      </div>
      <p className="mt-4 text-center text-[13px] leading-relaxed break-keep text-zinc-400">
        강화한 장비로 다른 플레이어와 겨루는 콜로세움 대난투를 준비하고 있어요.
      </p>
    </div>
  );
}
