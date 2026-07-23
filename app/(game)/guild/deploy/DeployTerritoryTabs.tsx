'use client';

import { useState, type ReactNode } from 'react';

/**
 * 길드 점령지 [배치 | 세계지도] 탭(2026-07-23) — 세계지도 역사/점령 탭과 동일하게 지도 우하단에
 * 오버레이(작은 세그먼트, 활성 amber). 배치 탭에선 점령전 시각 안내(지도 bottom-2) 위에 뜬다.
 * 배치=DeployBoard, 세계지도=WorldMapView(embedded: 구역명 노드 + 하단 점령현황, 팝업 기능 동일).
 * 지도는 두 화면 모두 aspect-square(폭=높이) → top을 정사각 하단 근처로 잡아 지도 안에 걸친다.
 */
export function DeployTerritoryTabs({ deploy, worldmap }: { deploy: ReactNode; worldmap: ReactNode }) {
  const [tab, setTab] = useState<'deploy' | 'map'>('deploy');
  return (
    <div className="relative flex min-h-full shrink-0 flex-col">
      {tab === 'deploy' ? deploy : worldmap}
      {/* 지도 정사각 높이 = 컨테이너 폭(min(100vw, 390)). 그 하단에서 약간 위(시각 안내 위)에 배치. */}
      <div
        className="absolute right-2 z-40 inline-flex gap-0.5 rounded-lg bg-black/45 p-0.5 backdrop-blur-sm"
        style={{ top: 'calc(min(100vw, 390px) - 4.9rem)' }}
      >
        {(
          [
            ['deploy', '배치'],
            ['map', '세계지도'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            aria-pressed={tab === k}
            className={`rounded-md px-2 py-0.5 text-[11px] font-bold transition ${
              tab === k ? 'bg-amber-500 text-white shadow-sm' : 'text-white/70'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
