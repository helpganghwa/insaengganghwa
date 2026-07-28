'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import * as haptic from '@/lib/game/haptic';
import { useResourceToast } from '@/components/ResourceToast';
import { RuneName, RuneValues, runeVectorDesc } from '@/components/RuneName';
import {
  ATTR_REGION_COLOR,
  ATTR_REGION_KO,
  attrPredator,
  attrPrey,
  GEM_TO_MS,
  RUNE_SWAP_COOLDOWN_MS,
  type AvatarAttr,
} from '@/lib/game/balance';

import { setActiveProfile, clearActiveProfile, deleteProfile, applyAttrProfile } from './actions';

type ProfileItem = {
  id: string;
  rotations: Record<string, string>;
  isDefault: boolean;
  attrId: string | null;
  attrName: string | null;
  attrs: AvatarAttr[];
};

/** 표시용 정면 이미지 — 항상 south(정면, 8방향 미사용). 레거시 프로필 대비 첫 값 폴백. */
function frontSrc(p: ProfileItem): string {
  return p.rotations.south ?? Object.values(p.rotations)[0] ?? '';
}

/** 남은 시간 — 71:32:10 (총 시:분:초). */
function fmtRemain(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * 아바타 관리(2026-07-28 재설계) — **선택 = 세트 미리보기**가 중심.
 * 상단 스티키 바(생성 상시 노출) → 미리보기 카드(아바타 크게 + 속성 이름·수치·상성 + 삭제)
 * → 3열 썸네일(현재 지정 뱃지). 외형/속성은 각각 지정(속성 교체만 72h 쿨 + 💎 단축).
 */
export function ProfileSelector({
  profiles,
  activeProfileId,
  equippedRuneId,
  runeChangedAtIso,
  diamond,
}: {
  profiles: ProfileItem[];
  activeProfileId: string | null;
  equippedRuneId: string | null;
  runeChangedAtIso: string | null;
  diamond: number;
}) {
  const router = useRouter();
  const { showHeaderToast, showError } = useResourceToast();

  // 낙관적 로컬 상태 — 액션 성공 즉시 반영. props 갱신 시 렌더 중 조정으로 재동기화.
  const [activeId, setActiveId] = useState(activeProfileId);
  const [eqAttrId, setEqAttrId] = useState(equippedRuneId);
  const [changedAt, setChangedAt] = useState(runeChangedAtIso ? Date.parse(runeChangedAtIso) : null);
  const [prevProps, setPrevProps] = useState({ activeProfileId, equippedRuneId, runeChangedAtIso });
  if (
    prevProps.activeProfileId !== activeProfileId ||
    prevProps.equippedRuneId !== equippedRuneId ||
    prevProps.runeChangedAtIso !== runeChangedAtIso
  ) {
    setPrevProps({ activeProfileId, equippedRuneId, runeChangedAtIso });
    setActiveId(activeProfileId);
    setEqAttrId(equippedRuneId);
    setChangedAt(runeChangedAtIso ? Date.parse(runeChangedAtIso) : null);
  }

  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const list = useMemo(() => profiles.filter((p) => !deletedIds.has(p.id)), [profiles, deletedIds]);

  // 미리보기 선택 — 기본은 현재 외형(없으면 첫 번째).
  const [selId, setSelId] = useState<string>(
    () => (activeProfileId && profiles.some((p) => p.id === activeProfileId) ? activeProfileId : profiles[0]?.id) ?? '',
  );
  const sel = list.find((p) => p.id === selId) ?? list[0] ?? null;

  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmGem, setConfirmGem] = useState(false);
  // 컨펌은 3s 후 자동 해제(오탭 보호) + 선택 변경 시 초기화.
  useEffect(() => {
    if (!confirmDelete) return;
    const t = setTimeout(() => setConfirmDelete(false), 3000);
    return () => clearTimeout(t);
  }, [confirmDelete]);
  useEffect(() => {
    if (!confirmGem) return;
    const t = setTimeout(() => setConfirmGem(false), 3000);
    return () => clearTimeout(t);
  }, [confirmGem]);

  // 속성 교체 쿨 카운트다운 — 남아있을 때만 1초 틱.
  const [now, setNow] = useState(() => Date.now());
  const coolEnd = changedAt != null ? changedAt + RUNE_SWAP_COOLDOWN_MS : null;
  const remainMs = coolEnd != null ? coolEnd - now : 0;
  useEffect(() => {
    if (coolEnd == null || coolEnd - Date.now() <= 0) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [coolEnd]);
  const inCooldown = remainMs > 0;
  const gemCost = inCooldown ? Math.ceil(remainMs / GEM_TO_MS) : 0;

  if (!sel) return null;
  const isLook = sel.id === activeId;
  const isAttr = sel.attrId != null && sel.attrId === eqAttrId;

  const pick = (p: ProfileItem) => {
    if (p.id === selId) return;
    setSelId(p.id);
    setConfirmDelete(false);
    setConfirmGem(false);
  };

  const doLook = () => {
    if (pending) return;
    haptic.success();
    if (isLook) {
      setActiveId(null);
      void clearActiveProfile().then((r) => {
        if (r.status === 'error') {
          setActiveId(sel.id);
          showError(r.message);
        }
      });
    } else {
      const prev = activeId;
      setActiveId(sel.id);
      void setActiveProfile(sel.id).then((r) => {
        if (r.status === 'error') {
          setActiveId(prev);
          showError(r.message);
        } else {
          showHeaderToast({ title: '외형 아바타 변경' });
        }
      });
    }
  };

  const doAttr = () => {
    if (pending || sel.attrId == null || isAttr) return;
    if (inCooldown && !confirmGem) {
      setConfirmGem(true); // 💎 소모는 2탭 확정
      return;
    }
    setConfirmGem(false);
    startTransition(async () => {
      const r = await applyAttrProfile(sel.id, inCooldown);
      if (r.status === 'success') {
        setEqAttrId(sel.attrId);
        setChangedAt(Date.now());
        showHeaderToast({ title: '속성 적용' });
      } else if (r.status === 'cooldown') {
        showError(`교체 대기 ${fmtRemain(r.remainingMs)} 남음 · 💎 ${r.gemCost.toLocaleString()}로 즉시 교체할 수 있어요.`);
      } else {
        showError(r.message);
      }
    });
  };

  const doDelete = () => {
    if (pending) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setConfirmDelete(false);
    startTransition(async () => {
      const r = await deleteProfile(sel.id);
      if (r.status === 'error') return showError(r.message);
      const remaining = list.filter((p) => p.id !== sel.id);
      setDeletedIds((s) => new Set(s).add(sel.id));
      if (sel.id === activeId) setActiveId(null);
      if (sel.attrId != null && sel.attrId === eqAttrId) setEqAttrId(null);
      setSelId(remaining[0]?.id ?? '');
      router.refresh();
    });
  };

  return (
    <div>
      {/* 스티키 헤더 — 생성 버튼 상시 노출(스크롤해도 사라지지 않음). */}
      <div className="sticky top-0 z-20 -mx-4 mb-3 flex items-center gap-2 border-b border-zinc-200 bg-white/90 px-4 py-2 backdrop-blur dark:border-zinc-800 dark:bg-black/85">
        <span className="flex-1 text-sm font-extrabold">아바타 관리</span>
        <Link
          prefetch={false}
          href="/me/create"
          className="flex items-center gap-1 rounded-full bg-amber-600 px-3.5 py-1.5 text-[12px] font-bold text-white shadow-sm transition active:scale-95"
        >
          <span aria-hidden>✨</span> 생성
        </Link>
      </div>

      {/* 미리보기 — 선택한 아바타 + 속성을 한 세트로. */}
      <div className="relative rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
        {!sel.isDefault && list.length > 1 ? (
          <button
            type="button"
            onClick={doDelete}
            disabled={pending}
            aria-label="선택한 아바타 삭제(속성 포함)"
            className={`absolute right-2 top-2 z-10 rounded-full px-2.5 py-1 text-[11px] font-bold backdrop-blur-sm transition active:scale-95 disabled:opacity-50 ${
              confirmDelete ? 'bg-red-600 text-white' : 'bg-black/50 text-red-300'
            }`}
          >
            {confirmDelete ? '속성도 함께 삭제' : '삭제'}
          </button>
        ) : null}

        <div className="flex gap-3">
          {/* 아바타 — 크게 */}
          <div className="relative flex h-[168px] w-[132px] shrink-0 select-none items-end justify-center isolate overflow-hidden rounded-xl">
            <div className="pointer-events-none absolute bottom-[5%] left-1/2 h-[6%] w-1/2 -translate-x-1/2 rounded-[50%] bg-black/40 blur-[5px]" />
            {frontSrc(sel) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={frontSrc(sel)}
                alt="아바타"
                draggable={false}
                className="pointer-events-none absolute inset-0 h-full w-full object-contain object-bottom"
                style={{ imageRendering: 'pixelated' }}
              />
            ) : null}
          </div>

          {/* 속성 — 이름·수치·상성 */}
          <div className="flex min-w-0 flex-1 flex-col justify-center">
            <div className="flex gap-1">
              {isLook ? (
                <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-extrabold text-violet-500 dark:text-violet-300">
                  외형
                </span>
              ) : null}
              {isAttr ? (
                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-extrabold text-amber-600 dark:text-amber-400">
                  속성 적용 중
                </span>
              ) : null}
            </div>
            {sel.attrId != null ? (
              <>
                <div className="mt-1 flex min-w-0">
                  <RuneName name={sel.attrName} attrs={sel.attrs} className="text-[15px]" />
                </div>
                <RuneValues attrs={sel.attrs} className="mt-1 text-[12px]" />
                <div className="mt-2 flex flex-col gap-0.5">
                  {runeVectorDesc(sel.attrs).map(([r]) => (
                    <p key={r} className="text-[11px] text-zinc-500">
                      <b style={{ color: ATTR_REGION_COLOR[r] }}>{ATTR_REGION_KO[r]}</b> 강함{' '}
                      <b className="text-emerald-600 dark:text-emerald-400">{ATTR_REGION_KO[attrPrey(r)]}</b> · 약점{' '}
                      <b className="text-rose-500 dark:text-rose-400">{ATTR_REGION_KO[attrPredator(r)]}</b>
                    </p>
                  ))}
                </div>
              </>
            ) : (
              <p className="mt-2 text-[12px] text-zinc-400">속성 없음</p>
            )}
          </div>
        </div>

        {/* 액션 — 외형 / 속성 */}
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={doLook}
            disabled={pending}
            className={`h-11 flex-1 rounded-xl text-[12.5px] font-bold transition active:scale-[0.98] disabled:opacity-60 ${
              isLook
                ? 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
                : 'bg-violet-600 text-white'
            }`}
          >
            {isLook ? '외형 해제' : '외형으로 적용'}
          </button>
          <button
            type="button"
            onClick={doAttr}
            disabled={pending || sel.attrId == null || isAttr || (inCooldown && diamond < gemCost)}
            className={`h-11 flex-[1.4] rounded-xl text-[12.5px] font-bold text-white transition active:scale-[0.98] disabled:opacity-60 ${
              isAttr
                ? 'bg-zinc-100 !text-zinc-500 dark:bg-zinc-800 dark:!text-zinc-400'
                : confirmGem
                  ? 'bg-rose-600'
                  : inCooldown
                    ? 'bg-sky-600'
                    : 'bg-amber-600'
            }`}
          >
            {isAttr
              ? '속성 적용 중'
              : inCooldown
                ? diamond < gemCost
                  ? `💎 ${gemCost.toLocaleString()} 부족`
                  : confirmGem
                    ? `💎 ${gemCost.toLocaleString()} 사용 확정`
                    : `💎 ${gemCost.toLocaleString()} 속성 교체`
                : '속성으로 적용'}
          </button>
        </div>
        {inCooldown ? (
          <p className="mt-2 text-center text-[11px] text-zinc-500">
            속성 교체 대기 <span className="font-mono tabular-nums">{fmtRemain(remainMs)}</span> · 대기 후 무료 교체
          </p>
        ) : null}
      </div>

      {/* 보유 목록 — 3열 썸네일(현재 지정 뱃지). 탭하면 미리보기 전환. */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        {list.map((p) => {
          const pLook = p.id === activeId;
          const pAttr = p.attrId != null && p.attrId === eqAttrId;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => pick(p)}
              className={`relative flex flex-col items-center gap-1 rounded-xl border-2 bg-white p-1.5 pt-2 transition active:scale-[0.98] dark:bg-zinc-950 ${
                p.id === sel.id
                  ? 'border-zinc-900 dark:border-white'
                  : 'border-zinc-200 dark:border-zinc-800'
              }`}
            >
              <span className="absolute left-1 top-1 flex gap-0.5">
                {pLook ? (
                  <span className="rounded-full bg-violet-600 px-1.5 py-px text-[9px] font-extrabold text-white">외형</span>
                ) : null}
                {pAttr ? (
                  <span className="rounded-full bg-amber-500 px-1.5 py-px text-[9px] font-extrabold text-black">속성</span>
                ) : null}
              </span>
              <div className="relative flex aspect-square w-full items-end justify-center isolate overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={frontSrc(p)}
                  alt="아바타"
                  draggable={false}
                  className="h-full w-full object-contain object-bottom"
                  style={{ imageRendering: 'pixelated' }}
                />
              </div>
              <div className="flex w-full min-w-0 justify-center">
                {p.attrId != null ? (
                  <RuneName name={p.attrName} attrs={p.attrs} className="text-[9.5px]" />
                ) : (
                  <span className="truncate text-[9.5px] text-zinc-400">속성 없음</span>
                )}
              </div>
            </button>
          );
        })}
        <Link
          prefetch={false}
          href="/me/create"
          className="flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-zinc-300 py-4 text-zinc-400 transition active:scale-[0.98] dark:border-zinc-700"
        >
          <span className="text-xl" aria-hidden>
            ✨
          </span>
          <span className="text-[10px]">생성</span>
        </Link>
      </div>
    </div>
  );
}
