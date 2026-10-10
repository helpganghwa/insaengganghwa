'use client';

import { GuildEmblemImg } from '@/components/GuildEmblemImg';
import { REGION_META, type Region } from '@/lib/game/guild/region-meta';
import type { AdminZoneRow } from '@/lib/game/world-boss/admin';

/**
 * 관리자 소환용 세계지도(10-11 사용자) — 게임 세계지도와 같은 그림·좌표에 구역 이름·점령 길드 문양·보스 유무를 전부 보이고,
 * 노드를 눌러 구역을 고른다. 보스가 있는 구역(🔥, 불꽃 테두리)은 고를 수 없다. 고른 구역은 호박색 테두리로 커진다.
 */
export function AdminZoneMap({
  mapSrc,
  zones,
  selectedId,
  onSelect,
}: {
  mapSrc: string;
  zones: AdminZoneRow[];
  selectedId: number | null;
  onSelect: (zoneId: number) => void;
}) {
  return (
    <div className="relative isolate aspect-square w-full overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={mapSrc} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover" style={{ imageRendering: 'pixelated' }} />
      {zones.map((z) => {
        const color = REGION_META[z.region as Region]?.color ?? '#a1a1aa';
        const owned = !!z.ownerName;
        const sel = z.id === selectedId;
        return (
          <button
            key={z.id}
            type="button"
            disabled={z.busy}
            onClick={() => onSelect(z.id)}
            aria-label={`${z.name} · ${z.ownerName ?? '주인 없음'}${z.busy ? ' · 보스 있음' : ''}`}
            title={`${z.name} · ${z.ownerName ?? '주인 없음'}${z.busy ? ' · 보스 있음(선택 불가)' : ''}`}
            className="absolute -translate-x-1/2 -translate-y-1/2 p-1.5 disabled:cursor-not-allowed"
            style={{ left: `${z.mapX}%`, top: `${z.mapY}%`, zIndex: sel ? 30 : z.busy ? 20 : owned ? 10 : 1 }}
          >
            <span
              className={`relative block h-[26px] w-[26px] overflow-hidden rounded-[5px] ring-1 ring-black/70 transition ${z.busy ? 'wb-zone-flame' : ''} ${
                sel ? 'scale-125 ring-2 ring-amber-300 shadow-[0_0_10px_rgba(251,191,36,0.85)]' : ''
              }`}
              style={{
                backgroundColor: owned ? (z.ownerEmblemColor ? `${z.ownerEmblemColor}73` : 'transparent') : 'rgba(10,12,20,0.6)',
                outline: `1px solid ${color}${owned ? '' : '88'}`,
                outlineOffset: 0,
              }}
            >
              {z.ownerEmblemUrl ? <GuildEmblemImg src={z.ownerEmblemUrl} className="h-full w-full object-contain" /> : null}
              {z.busy ? <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-[13px]">🔥</span> : null}
            </span>
            <span
              className={`pointer-events-none absolute left-1/2 top-full -mt-1 -translate-x-1/2 whitespace-nowrap rounded-sm bg-black/75 px-1 text-[8px] font-bold leading-[1.4] shadow-[0_1px_2px_rgba(0,0,0,0.75)] ${
                sel ? 'text-amber-200' : z.busy ? 'text-orange-300' : 'text-zinc-100'
              }`}
            >
              {z.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}
