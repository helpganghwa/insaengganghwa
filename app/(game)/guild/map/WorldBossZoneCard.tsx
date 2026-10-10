'use client';

/**
 * 구역 시트의 월드보스 카드(docs/WORLD-BOSS.md §9 — 2026-10-09 C안).
 * 숲 무대 한 장에 이름·단계·남은 시간·전리품·진행 막대·'보스 토벌' 버튼을 모두 담는다. 주인 길드원·다른 유저 모두 같다. 원정이 종료된 뒤 48시간은 같은 크기의 카드를 흑백·정지로 두고 종료 내용만 보인다.
 */
import Link from 'next/link';

import { Ticker } from '@/components/Ticker';
import { WorldBossSprite } from '@/components/WorldBossSprite';
import { assetUrl } from '@/lib/asset-versions';
import { worldBossBgUrl, worldBossSpriteUrl } from '@/lib/game/world-boss/bosses';

type Common = { name: string; region: string; stage: number; lootDiamond: number; lootBoxes: number; href: string; traits?: { code: string; icon: string; name: string }[] };

export function WorldBossZoneCard(
  props:
    | (Common & { mode: 'active'; leaveAt: number; remainText: (now: number) => string })
    | (Common & { mode: 'left'; leftWhen: (now: number) => string; settledGuildName: string | null }),
) {
  const left = props.mode === 'left';
  // 한 장의 무대(10-10 사용자): 보스 왼쪽 · 정보 가운데 · 특성 아이콘은 우측 상단, 작은 '보스 토벌' 버튼은 우측 하단(10-11 사용자: 이름 오른쪽에 두면 이름이 말줄임된다). 색은 보스(잿빛 + 불씨 주황)에 맞춘다.
  // 카드 전체가 링크 — 버튼뿐 아니라 어디를 눌러도 보스 상세로(10-10 사용자). 버튼은 눌림 자리를 알려 주는 모양만.
  return (
    <Link
      prefetch={false}
      href={props.href}
      className={`relative mt-2 block h-[92px] overflow-hidden rounded-[12px] border bg-stone-950 active:opacity-90 ${left ? 'border-zinc-700 grayscale' : 'border-orange-800/70'}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={assetUrl(worldBossBgUrl(props.region))} alt="" className={`absolute inset-0 h-full w-full object-cover ${left ? 'opacity-55' : ''}`} style={{ imageRendering: 'pixelated' }} />
      <span className="absolute inset-0 bg-[linear-gradient(90deg,rgba(12,10,9,0.2)_0%,rgba(12,10,9,0.72)_34%,rgba(12,10,9,0.62)_75%,rgba(12,10,9,0.72)_100%)]" />
      {/* 보스 — 왼쪽 끝, 위아래 정중앙(10-10) */}
      {left ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={assetUrl(worldBossSpriteUrl(props.region))}
          alt=""
          className="absolute left-0 top-1/2 z-[1] h-[84px] w-[84px] -translate-y-1/2 object-contain opacity-80"
          style={{ imageRendering: 'pixelated', filter: 'drop-shadow(0 0 1px #000) drop-shadow(0 0 1px #000)' }}
        />
      ) : (
        <WorldBossSprite
          region={props.region}
          alt=""
          className="absolute left-0 top-1/2 z-[1] h-[84px] w-[84px] -translate-y-1/2"
          style={{ filter: 'drop-shadow(0 0 1px #000) drop-shadow(0 0 1px #000) drop-shadow(0 0 6px rgba(234,88,12,0.65))' }}
        />
      )}
      {/* 정보 — 보스 오른쪽 */}
      <div className="absolute inset-y-2 left-[88px] right-2 z-[2] flex min-w-0 flex-col justify-between whitespace-nowrap">
        <span className="flex min-w-0 items-center gap-1">
          <span className={`shrink-0 rounded-[4px] px-1 text-[8.5px] font-extrabold leading-[1.5] ${left ? 'bg-zinc-700 text-zinc-300' : 'bg-orange-700/85 text-orange-50'}`}>
            {left ? '원정 종료' : '월드보스'}
          </span>
          <b className={`min-w-0 truncate text-[12px] [text-shadow:0_1px_2px_#000] ${left ? 'text-zinc-200' : 'text-stone-100'}`}>{props.name}</b>
          {/* 특성 아이콘 — 카드 우측 상단(10-11 사용자). 상세에서 이름·효과를 본다. */}
          {props.traits && props.traits.length > 0 && (
            <span className="ml-auto shrink-0 pl-1 text-[11px]" title={props.traits.map((t) => t.name).join(' · ')}>
              {props.traits.map((t) => t.icon).join(' ')}
            </span>
          )}
        </span>
        <span className={`text-[18px] font-black leading-none [text-shadow:0_1px_3px_#000] ${left ? 'text-zinc-300' : 'text-orange-400'}`}>
          {left ? `최종 ${props.stage}페이즈` : `${props.stage}페이즈`}
        </span>
        <Ticker intervalMs={60_000}>
          {(now) => (
            <span className={`text-[10px] [text-shadow:0_1px_2px_#000] ${left ? 'text-zinc-400' : 'text-stone-300'}`}>{left ? props.leftWhen(now) : props.remainText(now)}</span>
          )}
        </Ticker>
        <span className={`flex items-center gap-1.5 pr-16 text-[10.5px] font-bold [text-shadow:0_1px_2px_#000] ${left ? 'text-zinc-300' : 'text-stone-100'}`}>
          <span>💎{props.lootDiamond.toLocaleString('ko-KR')}</span>
          <span>📦{props.lootBoxes.toLocaleString('ko-KR')}</span>
        </span>
      </div>
      {/* 버튼 모양 — 우측 하단, 작게(카드 전체가 링크라 span) */}
      <span
        className={`absolute bottom-2 right-2 z-[2] rounded-md px-2 py-1 text-center text-[10.5px] font-bold ${
          left ? 'bg-zinc-700 text-zinc-200 ring-1 ring-zinc-500/60' : 'bg-orange-800/90 text-orange-50 ring-1 ring-orange-500/60'
        }`}
      >
        보스 토벌
      </span>
    </Link>
  );
}
