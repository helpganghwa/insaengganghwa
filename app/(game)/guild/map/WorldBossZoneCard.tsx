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

type Common = { name: string; region: string; stage: number; lootDiamond: number; lootBoxes: number; href: string; onOpen?: () => void };

export function WorldBossZoneCard(
  props:
    | (Common & { mode: 'active'; leaveAt: number; pct: number; remainText: (now: number) => string })
    | (Common & { mode: 'left'; leftWhen: (now: number) => string; settledGuildName: string | null }),
) {
  const left = props.mode === 'left';
  // 한 장의 무대(10-10 사용자): 숲 배경 안에 이름·단계·남은 시간·전리품·진행 막대·버튼을 모두 담는다. 버튼은 '보스 토벌'로 통일.
  return (
    <div className={`relative mt-2 h-[92px] overflow-hidden rounded-[12px] border bg-zinc-950 ${left ? 'border-zinc-700 grayscale' : 'border-amber-500/50'}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={assetUrl(worldBossBgUrl(props.region))} alt="" className={`absolute inset-0 h-full w-full object-cover ${left ? 'opacity-55' : ''}`} style={{ imageRendering: 'pixelated' }} />
      <span className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.85)_0%,rgba(0,0,0,0.55)_45%,rgba(0,0,0,0.15)_70%,rgba(0,0,0,0.6)_100%)]" />
      {/* 보스 — 가운데 오른쪽(버튼 자리와 겹치지 않게) */}
      {left ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={assetUrl(worldBossSpriteUrl(props.region))}
          alt=""
          className="absolute -bottom-2 right-[66px] z-[1] h-[88px] w-[88px] object-contain opacity-80"
          style={{ imageRendering: 'pixelated', filter: 'drop-shadow(0 0 1px #000) drop-shadow(0 0 1px #000)' }}
        />
      ) : (
        <WorldBossSprite
          region={props.region}
          alt=""
          className="absolute -bottom-2 right-[66px] z-[1] h-[88px] w-[88px]"
          style={{ filter: 'drop-shadow(0 0 1px #000) drop-shadow(0 0 1px #000) drop-shadow(0 0 6px rgba(251,146,60,0.7))' }}
        />
      )}
      {/* 정보 — 왼쪽 */}
      <div className="absolute inset-y-2 left-2.5 z-[2] flex max-w-[52%] flex-col justify-between">
        <span className="flex items-center gap-1">
          <span className={`rounded-full px-1.5 text-[9px] font-extrabold ${left ? 'bg-zinc-700 text-zinc-200' : 'border border-orange-400/70 bg-black/60 text-orange-300'}`}>
            {left ? '원정 종료' : '월드보스'}
          </span>
          <b className={`text-[12px] [text-shadow:0_1px_2px_#000] ${left ? 'text-zinc-200' : 'text-amber-200'}`}>{props.name}</b>
        </span>
        <span className={`text-[18px] font-black leading-none [text-shadow:0_1px_3px_#000] ${left ? 'text-zinc-300' : 'text-amber-400'}`}>
          {left ? `최종 ${props.stage}단계` : `${props.stage}단계`}
        </span>
        <Ticker intervalMs={60_000}>
          {(now) => (
            <span className={`text-[10px] [text-shadow:0_1px_2px_#000] ${left ? 'text-zinc-400' : 'text-amber-100'}`}>{left ? props.leftWhen(now) : props.remainText(now)}</span>
          )}
        </Ticker>
        <span className="flex items-center gap-1.5 text-[10.5px] font-bold text-zinc-100 [text-shadow:0_1px_2px_#000]">
          <span>💎{props.lootDiamond.toLocaleString('ko-KR')}</span>
          <span>📦{props.lootBoxes.toLocaleString('ko-KR')}</span>
          <span className="truncate text-[9.5px] font-normal text-zinc-300">
            {left ? (props.settledGuildName ? `${props.settledGuildName} 금고로` : '주인 없어 사라짐') : '점령 길드 금고로'}
          </span>
        </span>
      </div>
      {/* 버튼 — 오른쪽 */}
      <Link
        prefetch={false}
        href={props.href}
        onClick={props.onOpen}
        className={`absolute bottom-2.5 right-2 z-[2] rounded-lg px-2.5 py-1.5 text-center text-[11.5px] font-extrabold shadow-[0_2px_6px_rgba(0,0,0,0.6)] ${left ? 'bg-zinc-600 text-zinc-100' : 'bg-amber-500 text-amber-950'}`}
      >
        보스 토벌
      </Link>
      {/* 진행 막대 — 아래 가장자리(종료 뒤엔 회색으로 가득) */}
      <div className={`absolute inset-x-0 bottom-0 z-[3] h-[3px] ${left ? 'bg-zinc-700' : 'bg-amber-950/70'}`}>
        <div className={`h-full ${left ? 'bg-zinc-500' : 'bg-gradient-to-r from-amber-500 to-yellow-300'}`} style={{ width: `${left ? 100 : props.pct}%` }} />
      </div>
    </div>
  );
}
