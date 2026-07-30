'use client';

import type { Region } from '@/lib/game/guild/region-meta';

/**
 * 길드 행의 공용 조각 — 목록(GuildList)·랭킹(GuildRankingBoard)·팝업이 같은 타입과
 * 같은 배지를 쓴다. 화면이 늘어도 표기가 갈라지지 않게 한 곳에 모은다(2026-07-30).
 */
export type GuildRow = {
  id: string;
  name: string;
  level: number;
  memberCount: number;
  emblemUrl: string | null;
  emblemColor: string | null;
  combat: number;
  intro: string | null;
  /** 가입 방식 — 'open'(자유) | 'approval'(승인). */
  joinPolicy: string;
  /** 카카오 오픈채팅 설정 여부(배지용). URL 원문은 비길드원에 미전송(보안) — GuildHome에서만. */
  hasOpenchat: boolean;
  /** 점령 구역 목록(없으면 빈 배열). 카드 배지 수 + 팝업 칩(지역색). */
  zones: { name: string; region: Region }[];
  /** 길드장 닉네임 — 카드 셋째 줄·팝업 헤더 노출(가입 의사결정 정보, 2026-07-13). */
  leaderNickname: string | null;
};

/** 컴팩트 수치(예: 53,000 → 5.3만). */
export function fmtNum(n: number): string {
  return new Intl.NumberFormat('ko-KR', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

/** 가입 방식 배지 — 자유(초록)=신청 즉시 가입 / 승인(주황)=길드장 승인 필요. */
export function JoinPolicyBadge({ policy }: { policy: string }) {
  const open = policy === 'open';
  return (
    <span
      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold leading-none ${
        open
          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
          : 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
      }`}
    >
      {open ? '자유' : '승인'}
    </span>
  );
}

/** 카카오 오픈채팅 배지 — openchatUrl 설정 길드만. 외부 소통 채널 보유 표시(비클릭 인디케이터). */
export function KakaoOpenchatBadge() {
  return (
    <span
      className="flex shrink-0 items-center rounded-[3px] bg-[#FEE500] px-1 py-[3px] leading-none"
      title="카카오톡 오픈채팅 운영 길드"
      aria-label="카카오톡 오픈채팅 운영 길드"
    >
      {/* 자유/승인 배지와 높이 동일(14px) — 아이콘 8px(h-2) + 상하 3px 패딩. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/kakao/kakao_symbol.png" alt="" aria-hidden className="h-2 w-auto" />
    </span>
  );
}

export function EmblemThumb({ url, size = 'h-9 w-9' }: { url: string | null; size?: string }) {
  return (
    <div className={`flex ${size} shrink-0 items-center justify-center overflow-hidden rounded-lg`}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          aria-hidden
          className="h-full w-full object-contain"
          style={{ imageRendering: 'pixelated' }}
        />
      ) : null}
    </div>
  );
}
