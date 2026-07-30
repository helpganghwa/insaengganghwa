'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { BackButton } from '@/components/BackNav';
import { useResourceToast } from '@/components/ResourceToast';
import { ModalShell } from '@/components/ModalShell';
import { ModalLayout, ModalButton } from '@/components/ModalLayout';
import { assetUrl } from '@/lib/asset-versions';
import { GUILD_MAX_VICE, MAX_GUILD_EMBLEMS, guildXpToNext } from '@/lib/game/guild/balance';

import { disbandGuildAction } from '../actions';
import { guildErrMsg } from '../errors-msg';

type Role = 'leader' | 'vice' | 'member';

/** 허브 타일 — 홈 메뉴 카드와 같은 규격(aspect 50/17 · pixellab 배경 · 하단 그라데이션). */
type Tile = {
  key: string;
  /** 배경 파일명(public/sprites/guild-menu/{art}.png) — 키와 다를 수 있다(재사용 자산). */
  art: string;
  href: string;
  label: string;
  /** 수치 또는 짧은 명사만 — 문장은 쓰지 않는다. */
  desc: string;
  /** 배경 미생성 시 폴백 단색. */
  tint: string;
  /** 우상단 빨간 배지(대기 건수). */
  badge?: number;
  show: boolean;
};

export type GuildHubView = {
  name: string;
  level: number;
  xp: number;
  emblemUrl: string | null;
  memberCount: number;
  capacity: number;
  viceCount: number;
  emblemCount: number;
  taxPool: string;
  joinPolicy: 'open' | 'approval';
  joinRequestCount: number;
  /** 보유 구역 수. */
  zoneCount: number;
  /** 지금 수금할 수 있는 구역 수(집행관 있음 · 쿨타임 지남 · 세금 > 0). */
  collectableZones: number;
  /** 쿨타임 중이거나 세금이 없어 아직 못 걷는 구역 수. */
  waitingZones: number;
  /** 집행관이 없어 수금 자체가 불가한 구역 이름(앞 2곳 + 외 N곳). */
  noExecutorZones: { name: string; color: string }[];
  noExecutorTotal: number;
};

/**
 * 길드 관리 허브(C-3 확정안) — 탭을 버리고 요약 카드 + 2열 타일.
 *
 * 각 항목은 전용 화면으로 나갔다(가입 신청 · 길드원 · 부길드장 권한 · 길드 정보 · 세금 · 문양).
 * 이 화면은 **상태 요약과 진입**만 한다. 처리할 일 배너는 두지 않고, 대기 건수는 타일 배지로,
 * 점령전 상태는 요약 카드가 맡는다(사용자 결정 2026-07-30).
 *
 * 길드 해산은 타일이 아니라 화면 맨 아래 작은 텍스트 버튼이다 — 위험한 동작을 다른 메뉴와
 * 같은 크기로 두면 오탭 위험이 크다.
 */
export function GuildSettings({
  view,
  myRole,
  can,
}: {
  view: GuildHubView;
  myRole: Role;
  can: {
    notice: boolean;
    intro: boolean;
    openchat: boolean;
    joinReview: boolean;
    taxDistribute: boolean;
    emblem: boolean;
  };
}) {
  const router = useRouter();
  const { showHeaderToast, showError } = useResourceToast();
  const [pending, start] = useTransition();
  const [askDisband, setAskDisband] = useState(false);

  const isLeader = myRole === 'leader';
  const xpToNext = guildXpToNext(view.level);
  const xpPct = xpToNext > 0 ? Math.min(100, Math.round((view.xp / xpToNext) * 100)) : 0;

  const tiles: Tile[] = [
    {
      key: 'join',
      art: 'join',
      href: '/guild/join-requests',
      label: '가입 신청',
      desc: view.joinPolicy === 'approval' ? '승인제' : '자유 가입',
      tint: '#2a1a08',
      badge: view.joinRequestCount,
      show: can.joinReview,
    },
    {
      key: 'members',
      art: 'members',
      href: '/guild/members',
      label: '길드원',
      desc: `${view.memberCount} / ${view.capacity}`,
      tint: '#1c2238',
      show: true,
    },
    {
      key: 'roles',
      art: 'roles',
      href: '/guild/roles',
      label: '부길드장 권한',
      desc: `${view.viceCount} / ${GUILD_MAX_VICE}`,
      tint: '#101f2e',
      show: isLeader || myRole === 'vice',
    },
    {
      key: 'info',
      // 길드마스터 집무실 배경을 재사용 — 공지·소개 성격에 그대로 맞는다.
      art: 'settings',
      href: '/guild/info',
      label: '길드 정보',
      desc: '공지 · 소개 · 채팅',
      tint: '#2d0d12',
      show: can.notice || can.intro || can.openchat,
    },
    {
      key: 'tax',
      art: 'tax',
      href: '/guild/distribute',
      label: '세금 분배',
      desc: `💎${Number(view.taxPool).toLocaleString('ko-KR')}`,
      tint: '#332306',
      show: can.taxDistribute,
    },
    {
      key: 'emblem',
      art: 'emblem',
      href: '/guild/emblem',
      label: '문양',
      desc: `${view.emblemCount} / ${MAX_GUILD_EMBLEMS}`,
      tint: '#0b2a21',
      show: can.emblem,
    },
  ].filter((t) => t.show);

  const doDisband = () =>
    start(async () => {
      const r = await disbandGuildAction();
      if (r.status !== 'success') return showError(guildErrMsg(r.code));
      showHeaderToast({ title: '길드 해산됨' });
      router.replace('/guild');
    });

  return (
    <div className="space-y-3 px-3 py-3">
      {/* 헤더 — ‹ + 문양 + 이름. 별도 뒤로가기 띠를 두지 않는다(세로 공간 절약). */}
      <div className="flex items-center gap-2 px-0.5">
        <BackButton fallback="/guild" />
        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-zinc-100 dark:bg-zinc-900">
          {view.emblemUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={view.emblemUrl}
              alt="길드 문양"
              className="h-full w-full object-contain"
              style={{ imageRendering: 'pixelated' }}
            />
          ) : (
            <span className="text-xl">🛡️</span>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold tracking-wide text-zinc-400">길드 관리</p>
          <h1 className="truncate text-base font-extrabold leading-tight">{view.name}</h1>
        </div>
      </div>

      {/* 요약 — 타일이 담지 못하는 것만(레벨 진행 · 점령전 수금 상태). */}
      <section className="rounded-xl border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
        {/* 레벨 + XP바를 한 줄로 — 요약은 최대한 얇게(타일에 자리를 넘긴다). */}
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-[11px] font-bold">Lv.{view.level}</span>
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-600 to-amber-400"
              style={{ width: `${xpPct}%` }}
            />
          </div>
          <span className="shrink-0 text-[9.5px] tabular-nums text-zinc-400">{xpPct}%</span>
        </div>
        {/* 점령전 상태 — 카드 대신 구분점 한 줄. */}
        <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2 text-[10.5px] text-zinc-500">
          <span>
            구역{' '}
            <b className="tabular-nums text-zinc-700 dark:text-zinc-200">{view.zoneCount}</b>
          </span>
          <span className="text-zinc-300 dark:text-zinc-700">·</span>
          <span>
            수금 가능{' '}
            <b
              className={`tabular-nums ${
                view.collectableZones > 0
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-zinc-700 dark:text-zinc-200'
              }`}
            >
              {view.collectableZones}
            </b>
          </span>
          <span className="text-zinc-300 dark:text-zinc-700">·</span>
          <span>
            대기 <b className="tabular-nums text-zinc-700 dark:text-zinc-200">{view.waitingZones}</b>
          </span>
        </p>
        {view.noExecutorTotal > 0 ? (
          <p className="mt-0.5 text-[10.5px] leading-relaxed text-zinc-500">
            집행관 미지정 {view.noExecutorTotal}곳 —{' '}
            {view.noExecutorZones.map((z, i) => (
              <span key={z.name}>
                {i > 0 ? ' · ' : ''}
                <b style={{ color: z.color }}>{z.name}</b>
              </span>
            ))}
            {view.noExecutorTotal > view.noExecutorZones.length
              ? ` 외 ${view.noExecutorTotal - view.noExecutorZones.length}곳`
              : ''}
          </p>
        ) : null}
      </section>

      {/* 타일 — 홈 메뉴와 같은 규격. 배경 미생성이면 tint 단색으로 우아하게 폴백. */}
      <div className="grid grid-cols-2 gap-2.5">
        {tiles.map((t) => (
          <Link
            prefetch={false}
            key={t.key}
            href={t.href}
            style={{ backgroundColor: t.tint }}
            className="relative flex aspect-[25/13] isolate overflow-hidden rounded-2xl border border-zinc-800 transition active:scale-[0.98]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={assetUrl(`/sprites/guild-menu/${t.art}.png`)}
              alt=""
              aria-hidden
              draggable={false}
              className="absolute inset-0 h-full w-full object-cover"
              style={{ imageRendering: 'pixelated' }}
            />
            {t.badge && t.badge > 0 ? (
              <span
                aria-label={`대기 ${t.badge}건`}
                className="absolute right-1.5 top-1.5 z-10 inline-flex min-w-[20px] items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-white shadow ring-2 ring-zinc-900/50"
              >
                {t.badge > 99 ? '99+' : t.badge}
              </span>
            ) : null}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/55 to-transparent px-3 pb-2 pt-6">
              <div className="text-[15px] font-extrabold leading-tight text-white drop-shadow-sm">
                {t.label}
              </div>
              <div className="text-[11px] font-semibold leading-tight tabular-nums text-white/75">
                {t.desc}
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* 부길드장 안내 — 안 보이는 타일이 있는 이유. */}
      {!isLeader ? (
        <p className="px-1 text-center text-[11px] leading-relaxed text-zinc-400">
          길드 해산은 길드장만 할 수 있어요.
          {!can.taxDistribute || !can.emblem ? (
            <>
              <br />
              {!can.taxDistribute && !can.emblem ? '세금·문양' : !can.taxDistribute ? '세금' : '문양'}은
              길드장이 권한을 열어주면 관리할 수 있어요.
            </>
          ) : null}
        </p>
      ) : null}

      {/* 해산 — 타일이 아니라 맨 아래 작은 텍스트 버튼(오탭 방지). */}
      {isLeader ? (
        <div className="pb-2 pt-4 text-center">
          <button
            type="button"
            onClick={() => setAskDisband(true)}
            disabled={pending}
            className="text-[11px] font-bold text-red-500/80 underline decoration-red-500/30 underline-offset-[3px] active:opacity-60 disabled:opacity-40 dark:text-red-400/80"
          >
            길드 해산
          </button>
        </div>
      ) : null}

      {askDisband ? (
        <ModalShell onClose={() => setAskDisband(false)} label="길드 해산 확인">
          <ModalLayout
            icon="⚠️"
            title="길드를 해산할까요?"
            subtitle={<span className="font-bold text-red-500">되돌릴 수 없습니다</span>}
            footer={
              <>
                <ModalButton tone="ghost" onClick={() => setAskDisband(false)} disabled={pending}>
                  취소
                </ModalButton>
                <ModalButton
                  tone="danger"
                  onClick={() => {
                    setAskDisband(false);
                    doDisband();
                  }}
                  disabled={pending}
                >
                  해산
                </ModalButton>
              </>
            }
          >
            <p className="text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-300">
              길드원 {view.memberCount}명이 모두 길드를 잃고, 점령 중인 구역 {view.zoneCount}곳도
              주인을 잃습니다. 모아둔 세금 💎
              {Number(view.taxPool).toLocaleString('ko-KR')}도 사라집니다.
            </p>
          </ModalLayout>
        </ModalShell>
      ) : null}
    </div>
  );
}

