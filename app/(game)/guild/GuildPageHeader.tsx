'use client';

import { BackButton } from '@/components/BackNav';

/**
 * 길드 화면 공용 헤더(2026-07-30) — 모든 길드 상세가 **같은 자리·같은 모양**을 쓴다.
 *
 * 화면마다 제각각이던 것을 하나로 강제한다: 뒤로가기 위치, 제목 크기, 컨텍스트 줄, 좌우 여백.
 * 종전엔 어떤 화면은 띠형 BackBar, 어떤 화면은 인라인, 길드원은 헤더가 아예 없었다.
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
  /** 제목 위 한 줄 — 길드명·대기 건수 등 맥락. */
  kicker?: React.ReactNode;
  icon?: React.ReactNode;
  right?: React.ReactNode;
  fallback?: string;
}) {
  return (
    <div className="flex items-center gap-2 px-0.5">
      <BackButton fallback={fallback} />
      {icon ? (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-zinc-100 dark:bg-zinc-900">
          {icon}
        </div>
      ) : null}
      <div className="min-w-0 flex-1">
        {kicker ? (
          <p className="truncate text-[10px] font-semibold tracking-wide text-zinc-400">{kicker}</p>
        ) : null}
        <h1 className="truncate text-base font-extrabold leading-tight">{title}</h1>
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}
