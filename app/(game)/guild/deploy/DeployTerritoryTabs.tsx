'use client';

import { useLayoutEffect, useState, type ReactNode } from 'react';

const TAB_KEY = 'ig:deploy-tab'; // 전투 기록 등 이동 후 뒤로가기 시 탭 유지

/**
 * 길드 점령지 [배치 | 세계지도] 탭(2026-07-23) — 세계지도 역사/점령 탭과 동일하게 지도 우하단에
 * 오버레이(작은 세그먼트, 활성 amber). 배치 탭에선 점령전 시각 안내가 이 버튼 바로 위(4px)에 뜬다.
 * 배치=DeployBoard, 세계지도=WorldMapView(embedded: 구역명 노드 + 하단 점령현황, 팝업 기능 동일).
 * 지도는 두 화면 모두 aspect-square(폭=높이) → top을 정사각 하단 근처로 잡아 지도 안에 걸친다.
 * 탭 복원(2026-07-24): 자식 세계지도에서 전투 기록·프로필로 이동 후 **뒤로가기**로 돌아온 경우에만
 * '세계지도' 탭을 되살린다(구역 팝업 복원 키 ig:worldmap-restore 존재로 판정). 길드 메뉴에서 새로
 * 진입하면 복원 키가 없어 기본(배치) 탭이 열린다.
 */
export function DeployTerritoryTabs({ deploy, worldmap }: { deploy: ReactNode; worldmap: ReactNode }) {
  const [tab, setTab] = useState<'deploy' | 'map'>('deploy');
  useLayoutEffect(() => {
    try {
      // 뒤로가기(구역 팝업 복원 키 존재)일 때만 탭 복원. 새 진입이면 기본 배치 탭.
      if (sessionStorage.getItem('ig:worldmap-restore') == null) return;
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
  // isolate — 탭 버튼 z-40이 전역 스태킹으로 새어 채팅 미니바(z-20 fixed) 위로 떠오르던 버그 방지
  // (WorldMapView 지도 컨테이너와 동일 처리, 2026-07-23 제보 #67).
  return (
    <div className="relative isolate flex min-h-full shrink-0 flex-col">
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
