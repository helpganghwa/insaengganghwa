'use client';

import { BackButton } from '@/components/BackNav';

/**
 * 길드 화면 공용 헤더(2026-07-30) — 모든 길드 상세가 **같은 자리·같은 모양**을 쓴다.
 *
 * 화면마다 제각각이던 것을 하나로 강제한다: 뒤로가기 위치, 제목 크기, 컨텍스트, 좌우 여백.
 * 종전엔 어떤 화면은 띠형 BackBar, 어떤 화면은 인라인, 길드원은 헤더가 아예 없었다.
 *
 * 제목과 맥락을 **한 줄**에 둔다 — 두 줄이면 상세 화면이 많은 길드에서 세로 낭비가 크다.
 * 폭이 모자라면 맥락부터 줄어든다(제목은 끝까지 보인다).
 *
 * icon = 문양·아바타처럼 대상을 식별하는 이미지(선택). right = 카운트·액션 슬롯(선택).
 */
export function GuildPageHeader({
  title,
  kicker,
  icon,
  right,
  fallback = '/guild',
}: {
  title: React.ReactNode;
  /** 제목 옆 맥락 — 길드명·대기 건수 등. */
  kicker?: React.ReactNode;
  icon?: React.ReactNode;
  right?: React.ReactNode;
  fallback?: string;
}) {
  return (
    <div className="flex items-center gap-1.5 px-0.5">
      <BackButton fallback={fallback} compact />
      {icon ? (
        <div className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-md bg-zinc-100 dark:bg-zinc-900">
          {icon}
        </div>
      ) : null}
      <div className="flex min-w-0 flex-1 items-baseline gap-1.5">
        <h1 className="shrink-0 text-[14.5px] font-extrabold leading-none">{title}</h1>
        {kicker ? (
          <p className="min-w-0 truncate text-[10px] font-medium leading-none text-zinc-400">{kicker}</p>
        ) : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}
