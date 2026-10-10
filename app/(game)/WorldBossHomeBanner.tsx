'use client';

import Link from 'next/link';
import { useSyncExternalStore } from 'react';

import { REGION_COLOR } from '@/components/ExecutorTag';
import { WorldBossSprite } from '@/components/WorldBossSprite';
import { assetUrl } from '@/lib/asset-versions';
import { worldBossBgUrl } from '@/lib/game/world-boss/bosses';

/**
 * 홈 — 월드보스 출현 배너(무대 배너 B2, 10-11 사용자): 보스가 머무는 동안 캐러셀 위에 72px 무대(구역 배경 + 보스 대기 애니).
 * 글은 구역 · 주인 길드 / 페이즈 · 종료까지 · 원정대 모집 중 N, 오른쪽 '토벌하기'. 어디를 눌러도 보스 상세로 간다.
 * 왼쪽 위 ✕(강화 슬롯 취소 버튼과 같은 자리·모양)로 닫으면 **그 보스가 떠날 때까지** 안 보인다(localStorage에 보스 id — 새 보스는 다시 보인다).
 */
export type WorldBossHomeBannerData = {
  id: string;
  region: string;
  name: string;
  zone: string;
  owner: string | null;
  stage: number;
  /** 종료까지 남은 시간(시간 단위, 내림). 0이면 '1시간 미만'. */
  hoursLeft: number;
  recruiting: number;
};

const CLOSED_KEY = 'ig:wb-banner-closed';
const CLOSED_EVENT = 'ig:wb-banner-closed-change';
const subscribe = (cb: () => void) => {
  window.addEventListener(CLOSED_EVENT, cb);
  return () => window.removeEventListener(CLOSED_EVENT, cb);
};
const isClosed = (id: string) => {
  try {
    return localStorage.getItem(CLOSED_KEY) === id;
  } catch {
    return false; // 시크릿·차단 환경은 늘 보인다.
  }
};

export function WorldBossHomeBanner({ b }: { b: WorldBossHomeBannerData }) {
  // 서버·하이드레이션은 '보임', 그 뒤 저장소 값으로 — 효과 안 setState 없이 외부 스토어로 읽는다.
  const closed = useSyncExternalStore(subscribe, () => isClosed(b.id), () => false);
  if (closed) return null;
  const close = () => {
    try {
      localStorage.setItem(CLOSED_KEY, b.id);
    } catch {
      // 저장 실패면 이번 화면에서만 사라지지 않는다 — 다음 홈 진입 때 다시 보인다.
    }
    window.dispatchEvent(new Event(CLOSED_EVENT));
  };
  return (
    <div className="relative h-[72px] w-full">
      {/* 안쪽 상자가 둥근 모서리·배경 클립을 맡고, ✕는 바깥 상자에 붙어 모서리에 걸친다(10-11 사용자). */}
      <Link
        prefetch={false}
        href={`/world-boss/${b.id}`}
        className="relative isolate flex h-full w-full items-center gap-2 overflow-hidden rounded-xl border border-orange-700/60 bg-black pl-[78px] pr-2.5 active:opacity-90"
        aria-label={`${b.zone}에 월드보스 출현 — 토벌하기`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={assetUrl(worldBossBgUrl(b.region))} alt="" aria-hidden draggable={false} className="absolute inset-0 h-full w-full object-cover" style={{ imageRendering: 'pixelated' }} />
        <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(12,10,9,0.2)_0%,rgba(12,10,9,0.78)_30%,rgba(12,10,9,0.7)_100%)]" />
        <WorldBossSprite region={b.region} alt={b.name} className="absolute left-1 top-1/2 z-[1] h-[68px] w-[68px] -translate-y-1/2" />
        <span className="relative z-10 min-w-0 flex-1 leading-tight">
          <i className="mb-0.5 inline-block rounded-[3px] bg-orange-700 px-1.5 text-[8.5px] font-black not-italic text-white">월드보스 출현</i>
          <b className="block truncate text-[12.5px] text-white [text-shadow:0_1px_2px_#000]">
            {/* 구역 이름은 지역색(세계지도·집행관 태그와 같은 REGION_COLOR, 10-11 사용자). */}
            <span style={{ color: REGION_COLOR[b.region] ?? '#fcd34d' }}>{b.zone}</span>
            {b.owner ? ` · 🛡 ${b.owner}` : ''}
          </b>
          <small className="block truncate text-[10px] text-stone-300 [text-shadow:0_1px_2px_#000]">
            {b.stage}페이즈 · 종료까지 {b.hoursLeft >= 1 ? `${b.hoursLeft}시간` : '1시간 미만'} · 원정대 모집 중 {b.recruiting}
          </small>
        </span>
        <span className="relative z-10 shrink-0 rounded-lg bg-orange-600 px-3 py-1.5 text-[11.5px] font-black text-white shadow-[0_0_10px_rgba(234,88,12,0.5)]">토벌하기</span>
      </Link>
      {/* 닫기 — 강화 슬롯 취소 X 모양을 왼쪽 위 모서리에 반쯤 걸친다. 히트 영역은 p-1.5로 32px. */}
      <button type="button" onClick={close} className="absolute -left-[13px] -top-[13px] z-20 p-1.5" aria-label="월드보스 배너 닫기">
        <span className="flex h-5 w-5 items-center justify-center rounded-md border border-zinc-600 bg-zinc-950 text-[11px] leading-none text-zinc-300 shadow-[0_1px_3px_rgba(0,0,0,0.8)] active:scale-95">✕</span>
      </button>
    </div>
  );
}
