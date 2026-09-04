'use client';

import { memo, useState } from 'react';
import Link from 'next/link';

import { MELEE_DEFENSE_BOX, MELEE_KILL_DIAMOND, MELEE_REWARD_TIERS } from '@/lib/game/balance';
import { BackFab } from '@/components/BackNav';
import { assetUrl } from '@/lib/asset-versions';
import { meleeFaceCropStyle } from '@/components/faceCrop';
import { Tabs } from '@/components/ui/Tabs';
import type { MeleeHistoryRow } from '@/lib/game/melee/history';

export type { MeleeHistoryRow };

/**
 * 보상 테이블 + 역대 우승자 — 탭 전환. MELEE §6.
 * showBanner=false: 상단 아레나 배너 생략(대기/진행중 화면에 무대 아래로 임베드 시).
 */
// memo(2026-08-07 렌더 감사) — MeleeCountdown의 1초 시계가 보상표·역대 우승자 전체를 매초
// 재렌더시키던 것 차단. props는 RSC 배열(history)+원시값이라 안정. 시간 파생 렌더 없음(검증).
export const MeleeInfo = memo(function MeleeInfo({
  history,
  initialTab = 'reward',
  showBanner = true,
}: {
  history: MeleeHistoryRow[];
  initialTab?: 'reward' | 'history';
  showBanner?: boolean;
}) {
  const [tab, setTab] = useState<'reward' | 'history'>(initialTab);

  // 필터(탭) — standalone에서는 고정 영역, 임베드에서는 본문 위.
  const tabBar = (
    <Tabs
      className="mx-4"
      value={tab}
      onChange={setTab}
      items={[
        { key: 'reward' as const, label: '보상 테이블' },
        { key: 'history' as const, label: '역대 우승자' },
      ]}
    />
  );

  const body = (
    <>
      {tab === 'reward' ? (
        <>
          <div className="isolate mx-4 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
            <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 border-b border-zinc-900 px-3 py-2 text-[10px] font-bold text-zinc-500">
              <span>순위</span>
              <span className="w-16 text-right text-sm">💎</span>
              <span className="w-12 text-right text-sm">📦</span>
              <span className="w-12 text-right">포인트</span>
            </div>
            <ul>
              {MELEE_REWARD_TIERS.map((t) => (
                <li
                  key={t.label}
                  className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 border-b border-zinc-900/60 px-3 py-2.5 text-[12px] last:border-b-0"
                >
                  <span className="font-bold text-white">{t.label}</span>
                  <span className="w-16 text-right font-mono text-sky-300">
                    {t.diamond > 0 ? t.diamond.toLocaleString() : '—'}
                  </span>
                  <span className="w-12 text-right font-mono text-amber-300">{t.boxes}</span>
                  <span className="w-12 text-right font-mono text-violet-300">{t.points > 0 ? `+${t.points}` : '—'}</span>
                </li>
              ))}
            </ul>
          </div>
          {/* 공격·방어 보너스(0192, 2026-09-04) — 순위와 별개로 전원. 결과 우편 총액에 합산되며 본문 설명은 없으니 표가 유일한 안내. */}
          <div className="isolate mx-4 mt-2 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
            <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2 border-b border-zinc-900 px-3 py-2 text-[10px] font-bold text-zinc-500">
              <span>공격·방어 보너스 (순위와 별개, 전원)</span>
              <span className="w-16 text-right text-sm">💎</span>
              <span className="w-12 text-right text-sm">📦</span>
            </div>
            <ul>
              <li className="grid grid-cols-[1fr_auto_auto] items-center gap-2 border-b border-zinc-900/60 px-3 py-2.5 text-[12px]">
                <span className="font-bold text-white">
                  공격 성공 1회 <span className="text-[10px] font-medium text-zinc-500">상대를 쓰러뜨림</span>
                </span>
                <span className="w-16 text-right font-mono text-sky-300">{MELEE_KILL_DIAMOND}</span>
                <span className="w-12 text-right font-mono text-zinc-600">—</span>
              </li>
              <li className="grid grid-cols-[1fr_auto_auto] items-center gap-2 px-3 py-2.5 text-[12px]">
                <span className="font-bold text-white">
                  방어 성공 1회 <span className="text-[10px] font-medium text-zinc-500">공격받고 버팀</span>
                </span>
                <span className="w-16 text-right font-mono text-zinc-600">—</span>
                <span className="w-12 text-right font-mono text-amber-300">{MELEE_DEFENSE_BOX}</span>
              </li>
            </ul>
          </div>
          {/* 다이아 상위 50% 컷오프(MELEE_DIAMOND_PCT_CUTOFF) 각주는 사용자 결정으로 미표시
              (2026-08-24) — 실지급 컷은 그대로이며 상세 안내는 위키 대난투 문서가 담당. */}
        </>
      ) : history.length === 0 ? (
        <div className="mx-4 rounded-xl border border-zinc-800 px-3 py-10 text-center text-[12px] text-zinc-500">
          아직 발표된 대난투가 없어요.
        </div>
      ) : (
        /* 로그처럼 풀폭(엣지-투-엣지, 별도 박스 없음) */
        <ul className="border-t border-zinc-900/60">
          {history.map((h) => {
            const inner = (
              <>
                {/* 챔피언 아바타 — 우측 배경 레이어. height/top으로 상반신·얼굴이 박스 세로 중앙. */}
                {h.championAvatar ? (
                  <div className="pointer-events-none absolute inset-y-0 right-0 w-40">
                    {/* 얼굴중심 크롭 — 아바타별 실제 faceBox(없으면 폴백). 가로 스트립 보정. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={h.championAvatar}
                      alt=""
                      aria-hidden
                      className="absolute inset-0 h-full w-full"
                      style={meleeFaceCropStyle(h.championFaceBox)}
                    />
                  </div>
                ) : null}
                {/* 콘텐츠 — 좌측. */}
                <div className="relative z-10 px-3 py-3.5">
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 font-mono text-[11px] font-bold text-amber-300">
                      제{h.edition}회
                    </span>
                    <span className="min-w-0 truncate text-[13px] font-bold text-white">
                      {h.championNick}
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-zinc-400">
                    <span>
                      전투력{' '}
                      <span className="font-mono text-zinc-300">
                        {h.championCp.toLocaleString()}
                      </span>
                    </span>
                    <span className="text-zinc-600">·</span>
                    <span>참가 {h.participantCount.toLocaleString()}명</span>
                  </div>
                </div>
              </>
            );
            return (
              <li key={h.edition} className="border-b border-zinc-900/60">
                {/* 회차(카드) 클릭 → 그날 결과로 이동. */}
                <Link prefetch={false}
                  href={`/melee/battle/${h.battleId}`}
                  className="relative block overflow-hidden transition active:bg-zinc-900/60"
                >
                  {inner}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );

  /* 상단 아레나 배경 배너 — standalone에서 고정. */
  const banner = (
    <div className="relative h-28 shrink-0 overflow-hidden border-b border-zinc-800">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={assetUrl('/sprites/hub/melee.png')}
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full object-cover"
        style={{ imageRendering: 'pixelated' }}
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/45 via-black/35 to-black/70" />
      {/* GNB 없는 페이지 — 뒤로가기 필수(PWA·PC 갇힘 방지). 제목은 중앙이라 좌상단과 충돌 없음. */}
      <BackFab fallback="/melee" className="absolute top-2.5 left-3 z-20" />
      <div className="relative z-10 flex h-full flex-col items-center justify-center gap-0.5">
        <h1 className="text-pixel-outline text-lg font-extrabold text-white">대난투 정보</h1>
        <p className="text-pixel-outline text-[11px] font-bold text-amber-200">
          {tab === 'reward' ? '보상 테이블' : '역대 우승자'}
        </p>
      </div>
    </div>
  );

  // standalone(/melee/info) — 배너+필터를 상단 고정, 본문만 스크롤(대난투 결과 화면과 동일 패턴).
  if (showBanner) {
    return (
      <div className="flex h-[calc(100%-var(--chat-dock-h,0px))] flex-col">
        {banner}
        <div className="shrink-0 bg-zinc-950 pt-3 pb-3">{tabBar}</div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pb-6">{body}</div>
      </div>
    );
  }

  // 임베드(대기/진행중 무대 아래) — 일반 흐름.
  return (
    <div className="space-y-3 pt-3 pb-6">
      {tabBar}
      {body}
    </div>
  );
});
