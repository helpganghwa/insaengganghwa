'use client';

import { useLayoutEffect, useState, type ReactNode } from 'react';

const TAB_KEY = 'ig:deploy-tab'; // 전투 기록 등 이동 후 뒤로가기 시 탭 유지

/**
 * 길드 점령지 [배치 | 세계지도] 탭(2026-07-23) — 세계지도 역사/점령 탭과 동일하게 지도 우하단에
 * 오버레이(작은 세그먼트, 활성 amber). 배치 탭에선 점령전 시각 안내가 이 버튼 바로 위(4px)에 뜬다.
 * 배치=DeployBoard, 세계지도=WorldMapView(embedded: 구역명 노드 + 하단 점령현황, 팝업 기능 동일).
 * 지도는 두 화면 모두 aspect-square(폭=높이) → top을 정사각 하단 근처로 잡아 지도 안에 걸친다.
 * 탭 선택은 sessionStorage에 저장 — 전투 기록 페이지 이동 후 뒤로가기 시 '세계지도' 탭이 유지된다.
 */
export function DeployTerritoryTabs({ deploy, worldmap }: { deploy: ReactNode; worldmap: ReactNode }) {
  const [tab, setTab] = useState<'deploy' | 'map'>('deploy');
  useLayoutEffect(() => {
    try {
      if (sessionStorage.getItem(TAB_KEY) === 'map') setTab('map');
    } catch {
      // sessionStorage 불가 — 복원만 생략
    }
  }, []);
  const changeTab = (t: 'deploy' | 'map') => {
    setTab(t);
    try {
      sessionStorage.setItem(TAB_KEY, t);
    } catch {
      // 저장만 생략
    }
  };
  return (
    <div className="relative flex min-h-full shrink-0 flex-col">
      {tab === 'deploy' ? deploy : worldmap}
      {/* 지도 정사각 하단 근처(홈 세계지도 역사/점령 탭과 동일 위치). 배치 탭의 시각 안내는 이 버튼 위 4px. */}
      <div
        className="absolute right-2 z-40 inline-flex gap-0.5 rounded-lg bg-black/45 p-0.5 backdrop-blur-sm"
        style={{ top: 'calc(min(100vw, 390px) - 2.2rem)' }}
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
            onClick={() => changeTab(k)}
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
