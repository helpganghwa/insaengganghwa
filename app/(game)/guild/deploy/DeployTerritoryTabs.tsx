'use client';

import { useState, type ReactNode } from 'react';

/**
 * 길드 점령지 상단 [배치 | 세계지도] 세그먼트 탭(2026-07-23) — 활성 emerald.
 * 배치=DeployBoard(점령전 배치·관리), 세계지도=WorldMapView(embedded: 지도 노드 구역명 +
 * 하단 점령 현황, 구역 팝업·이동·수금·전투 기록 기능은 세계지도와 동일).
 * 두 화면은 각자 렌더 트리가 무거워 조건부 렌더(전환 시 리셋 무방 — 상태 없는 열람 위주).
 */
export function DeployTerritoryTabs({ deploy, worldmap }: { deploy: ReactNode; worldmap: ReactNode }) {
  const [tab, setTab] = useState<'deploy' | 'map'>('deploy');
  return (
    <div className="flex min-h-full shrink-0 flex-col">
      <div className="flex shrink-0 gap-1 border-b border-zinc-200 bg-white px-4 py-2 dark:border-zinc-800 dark:bg-zinc-950">
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
            className={`flex-1 rounded-lg py-1.5 text-[13px] font-bold transition ${
              tab === k
                ? 'bg-emerald-500 text-white shadow-sm'
                : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex min-h-0 flex-auto flex-col">{tab === 'deploy' ? deploy : worldmap}</div>
    </div>
  );
}
