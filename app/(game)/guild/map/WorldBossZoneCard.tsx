'use client';

/**
 * 구역 시트의 월드보스 카드(docs/WORLD-BOSS.md §9 — 2026-10-09 C안).
 * 숲 무대 위 큰 보스 + 단계·남은 시간 + 진행 막대 + 전리품 칩 + 버튼 하나. 주인 길드원·다른 유저 모두 같은 구성이고
 * 버튼 이름만 상황에 맞게 바뀐다. 원정이 종료된 뒤 48시간은 같은 크기의 카드를 흑백·정지로 두고 종료 내용만 보인다.
 */
import Link from 'next/link';

import { Ticker } from '@/components/Ticker';
import { WorldBossSprite } from '@/components/WorldBossSprite';
import { assetUrl } from '@/lib/asset-versions';
import { worldBossBgUrl, worldBossSpriteUrl } from '@/lib/game/world-boss/bosses';

type Common = { name: string; region: string; stage: number; lootDiamond: number; lootBoxes: number; href: string; onOpen?: () => void };

export function WorldBossZoneCard(
  props:
    | (Common & { mode: 'active'; leaveAt: number; pct: number; cta: string; remainText: (now: number) => string })
    | (Common & { mode: 'left'; leftWhen: (now: number) => string; settledGuildName: string | null }),
) {
  const left = props.mode === 'left';
  return (
    <div
      className={`mt-2 rounded-[14px] border p-2 ${left ? 'border-zinc-700 bg-zinc-900/70 grayscale' : 'border-amber-500/40 bg-[#1c1410]'}`}
    >
      {/* 무대 — 숲 배경 + 큰 보스(종료 뒤엔 정지 그림) */}
      <div className="relative h-[110px] overflow-hidden rounded-[10px] bg-zinc-950">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={assetUrl(worldBossBgUrl(props.region))} alt="" className={`absolute inset-0 h-full w-full object-cover ${left ? 'opacity-60' : ''}`} style={{ imageRendering: 'pixelated' }} />
        <span className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.78),transparent_72%)]" />
        {left ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={assetUrl(worldBossSpriteUrl(props.region))}
            alt=""
            className="absolute -bottom-1.5 right-1 z-[1] h-[118px] w-[118px] object-contain opacity-80"
            style={{ imageRendering: 'pixelated', filter: 'drop-shadow(0 0 1px #000) drop-shadow(0 0 1px #000)' }}
          />
        ) : (
          <WorldBossSprite
            region={props.region}
            alt=""
            className="absolute -bottom-1.5 right-1 z-[1] h-[118px] w-[118px]"
            style={{ filter: 'drop-shadow(0 0 1px #000) drop-shadow(0 0 1px #000) drop-shadow(0 0 6px rgba(251,146,60,0.7))' }}
          />
        )}
        <div className="absolute inset-y-2 left-2.5 z-[2] flex flex-col gap-px">
          <span className={`self-start rounded-full px-1.5 text-[9.5px] font-extrabold ${left ? 'bg-zinc-700 text-zinc-200' : 'border border-orange-400/70 bg-black/60 text-orange-300'}`}>
            {left ? '원정 종료' : '월드보스'}
          </span>
          <b className={`text-[14px] ${left ? 'text-zinc-200' : 'text-amber-200'}`}>{props.name}</b>
          <span className={`text-[22px] font-black leading-[1.1] ${left ? 'text-zinc-300' : 'text-amber-400'}`}>
            {left ? `최종 ${props.stage}단계` : `${props.stage}단계`}
          </span>
          <Ticker intervalMs={60_000}>
            {(now) => (
              <span className={`text-[10.5px] ${left ? 'text-zinc-400' : 'text-amber-100'}`}>
                {left ? props.leftWhen(now) : props.remainText(now)}
              </span>
            )}
          </Ticker>
        </div>
      </div>
      {/* 진행 막대 — 종료 뒤엔 회색으로 가득(크기 유지) */}
      <div className={`mt-1.5 h-[5px] overflow-hidden rounded-full ${left ? 'bg-zinc-700' : 'bg-amber-900/50'}`}>
        <div
          className={`h-full rounded-full ${left ? 'bg-zinc-500' : 'bg-gradient-to-r from-amber-500 to-yellow-300'}`}
          style={{ width: `${left ? 100 : props.pct}%` }}
        />
      </div>
      {/* 전리품 */}
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="rounded-full bg-zinc-800 px-2 font-bold text-zinc-100">💎{props.lootDiamond.toLocaleString('ko-KR')}</span>
        <span className="rounded-full bg-zinc-800 px-2 font-bold text-zinc-100">📦{props.lootBoxes.toLocaleString('ko-KR')}</span>
        <span className="min-w-0 truncate text-[10.5px] text-zinc-400">
          {left
            ? props.settledGuildName
              ? `${props.settledGuildName} 금고로 들어갔어요`
              : '주인이 없어 사라졌어요'
            : '종료 때 점령 길드 금고로'}
        </span>
      </div>
      <Link
        prefetch={false}
        href={props.href}
        onClick={props.onOpen}
        className={`mt-2 block rounded-lg py-2 text-center text-[12.5px] font-extrabold ${left ? 'bg-zinc-700 text-zinc-200' : 'bg-amber-500 text-amber-950'}`}
      >
        {left ? '전투 기록 보기' : props.cta}
      </Link>
    </div>
  );
}
