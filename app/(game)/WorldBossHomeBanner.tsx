'use client';

import Link from 'next/link';
import { useSyncExternalStore } from 'react';

import { REGION_COLOR } from '@/components/ExecutorTag';
import { GuildBadge } from '@/components/GuildBadge';
import { WorldBossSprite } from '@/components/WorldBossSprite';
import { assetUrl } from '@/lib/asset-versions';
import { worldBossBgUrl } from '@/lib/game/world-boss/bosses';
import { WORLD_BOSS_BANNER_COOKIE } from '@/lib/game/world-boss/home-banner';

/**
 * 홈 — 월드보스 출현 배너(무대 배너 B2, 10-11 사용자): 보스가 머무는 동안 캐러셀 위에 72px 무대(구역 배경 + 보스 대기 애니).
 * 글은 구역 · 주인 길드(문양과 함께, 이모지 없음 — 10-11 사용자) / 페이즈 · 종료까지 · 원정대 모집 중 N, 오른쪽 '토벌하기'. 어디를 눌러도 보스 상세로 간다.
 * 왼쪽 위 ✕(강화 슬롯 취소 버튼 모양, 모서리에 걸침)로 닫으면 **그 보스가 떠날 때까지** 안 보인다 — 쿠키 `ig_wb_banner_closed`에 보스 id를
 * 적어 두면 홈 서버 컴포넌트가 렌더 전에 읽고 배너를 아예 그리지 않는다(새로고침 때 보였다 사라지는 깜빡임 없음, 10-11 사용자). 새 보스는 다시 보인다.
 */
export type WorldBossHomeBannerData = {
  id: string;
  /** 출현 구역의 지역 — 구역 이름 색. */
  region: string;
  /** 보스 종류 코드 — 그림·배경. */
  bossCode: string;
  name: string;
  zone: string;
  owner: string | null;
  /** 주인 길드 문양(+대표색) — 길드 이름은 늘 문양과 함께(10-10 규칙). */
  ownerEmblem: string | null;
  ownerColor: string | null;
  stage: number;
  /** 종료까지 남은 시간(시간 단위, 내림). 0이면 '1시간 미만'. */
  hoursLeft: number;
  recruiting: number;
};

const CLOSED_EVENT = 'ig:wb-banner-closed-change';
const subscribe = (cb: () => void) => {
  window.addEventListener(CLOSED_EVENT, cb);
  return () => window.removeEventListener(CLOSED_EVENT, cb);
};
const isClosed = (id: string) => {
  try {
    return document.cookie.split('; ').some((c) => c === `${WORLD_BOSS_BANNER_COOKIE}=${id}`);
  } catch {
    return false;
  }
};

export function WorldBossHomeBanner({ b }: { b: WorldBossHomeBannerData }) {
  // 서버가 쿠키로 걸러 주므로 여기 오면 '보임'이 기본. 닫는 순간만 쿠키를 다시 읽어 즉시 사라진다(효과 안 setState 없이 외부 스토어).
  const closed = useSyncExternalStore(subscribe, () => isClosed(b.id), () => false);
  if (closed) return null;
  const close = () => {
    try {
      // 보스가 머무는 48시간을 넉넉히 덮는 4일. 쿠키가 막힌 환경이면 이번 화면에서만 사라진다.
      document.cookie = `${WORLD_BOSS_BANNER_COOKIE}=${b.id}; path=/; max-age=${60 * 60 * 24 * 4}; samesite=lax`;
    } catch {
      // 무시
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
        aria-label={`${b.zone}에 월드보스 출현, 토벌하기`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={assetUrl(worldBossBgUrl(b.bossCode))} alt="" aria-hidden draggable={false} className="absolute inset-0 h-full w-full object-cover" style={{ imageRendering: 'pixelated' }} />
        <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(12,10,9,0.2)_0%,rgba(12,10,9,0.78)_30%,rgba(12,10,9,0.7)_100%)]" />
        <WorldBossSprite kind={b.bossCode} alt={b.name} className="absolute left-1 top-1/2 z-[1] h-[68px] w-[68px] -translate-y-1/2" />
        <span className="relative z-10 min-w-0 flex-1 leading-tight">
          <i className="mb-0.5 inline-block rounded-[3px] bg-orange-700 px-1.5 text-[8.5px] font-black not-italic text-white">월드보스 출현</i>
          <b className="flex min-w-0 items-center gap-1 text-[12.5px] text-white [text-shadow:0_1px_2px_#000]">
            {/* 구역 이름은 지역색(세계지도·집행관 태그와 같은 REGION_COLOR, 10-11 사용자). 주인 길드는 문양과 함께(🛡 이모지였던 자리, 10-11 사용자). */}
            <span className="shrink-0" style={{ color: REGION_COLOR[b.region] ?? '#fcd34d' }}>{b.zone}</span>
            {b.owner && (
              <>
                <span className="shrink-0 text-stone-400">·</span>
                <GuildBadge emblemUrl={b.ownerEmblem} emblemColor={b.ownerColor} name={b.owner} size={12} className="min-w-0" />
              </>
            )}
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
