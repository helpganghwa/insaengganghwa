'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import * as haptic from '@/lib/game/haptic';
import { useResourceToast } from '@/components/ResourceToast';
import { runeVectorDesc } from '@/components/RuneName';
import {
  ATTR_REGION_COLOR,
  ATTR_REGION_KO,
  GEM_TO_MS,
  RUNE_SWAP_COOLDOWN_MS,
  type AttrRegion,
  type AvatarAttr,
} from '@/lib/game/balance';

import { AttrHelpModal } from './AttrHelpModal';
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

/** 남은 시간 — 23:41:08 (총 시:분:초). */
function fmtRemain(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function dominant(attrs: AvatarAttr[]): AttrRegion | null {
  return runeVectorDesc(attrs)[0]?.[0] ?? null;
}

/**
 * 아바타 관리 — 아바타가 메인, 속성은 상세(이 화면)에서만 표시.
 * 스테이지는 **풀블리드**(좌우 패딩 0) + 지배 권역 틴트, 속성은 게이지 없이 `권역 55%` 라벨 한 줄로
 * **고정 높이**(1~3줄 편차로 레이아웃 시프트가 나던 문제 제거). 상성은 `?` → 원형 상성도 모달.
 * 선택은 하단 **가로 스와이프 스트립**.
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

  const [selId, setSelId] = useState<string>(
    () =>
      (activeProfileId && profiles.some((p) => p.id === activeProfileId)
        ? activeProfileId
        : profiles[0]?.id) ?? '',
  );
  const sel = list.find((p) => p.id === selId) ?? list[0] ?? null;

  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmGem, setConfirmGem] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
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

  // 선택 변경 시 스트립에서 해당 칸을 시야로.
  const stripRef = useRef<HTMLDivElement>(null);

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
  const selVec = runeVectorDesc(sel.attrs);
  const tint = dominant(sel.attrs);

  const pick = (p: ProfileItem, el: HTMLElement) => {
    if (p.id === selId) return;
    setSelId(p.id);
    setConfirmDelete(false);
    setConfirmGem(false);
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
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
        showError(
          `교체 대기 ${fmtRemain(r.remainingMs)} 남음 · 💎 ${r.gemCost.toLocaleString()}로 즉시 교체할 수 있어요.`,
        );
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
      {/* 스테이지 — 풀블리드(부모 px-4/py-6 상쇄) */}
      <div className="-mx-4 -mt-6 mb-4">
        <div className="relative">
          <div
            className="absolute inset-0"
            style={{
              background: `radial-gradient(110% 88% at 50% 6%, ${
                tint ? `${ATTR_REGION_COLOR[tint]}42` : 'rgba(255,255,255,.07)'
              }, transparent 66%), linear-gradient(#14141a, #0c0c11)`,
            }}
          />
          <div className="absolute left-3 top-3 z-10 flex gap-1">
            {isLook ? (
              <span className="rounded-[5px] bg-white/15 px-1.5 py-[3px] text-[8.5px] font-black tracking-wide text-white">
                외형
              </span>
            ) : null}
            {isAttr ? (
              <span className="rounded-[5px] bg-white px-1.5 py-[3px] text-[8.5px] font-black tracking-wide text-zinc-950">
                속성
              </span>
            ) : null}
          </div>
          {!sel.isDefault && list.length > 1 ? (
            <button
              type="button"
              onClick={doDelete}
              disabled={pending}
              aria-label="선택한 아바타 삭제(속성 포함)"
              className={`absolute right-3 top-3 z-10 h-6 rounded-md px-2 text-[10px] font-extrabold transition active:scale-95 disabled:opacity-50 ${
                confirmDelete ? 'bg-red-600 text-white' : 'bg-black/35 text-rose-300'
              }`}
            >
              {confirmDelete ? '속성도 삭제' : '삭제'}
            </button>
          ) : null}

          <div className="relative flex h-[188px] items-end justify-center">
            <div className="absolute bottom-[10px] h-[10px] w-[92px] rounded-[50%] bg-black/50 blur-[5px]" />
            {frontSrc(sel) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={frontSrc(sel)}
                alt="아바타"
                draggable={false}
                className="relative h-[164px] w-full object-contain object-bottom drop-shadow-[0_10px_14px_rgba(0,0,0,0.55)]"
                style={{ imageRendering: 'pixelated' }}
              />
            ) : null}
          </div>

          {/* 속성 라벨 — 게이지 없이 `권역 55%` 한 줄. 높이 고정(레이아웃 시프트 제거) */}
          <div className="relative flex h-[46px] items-center gap-2 border-t border-white/10 bg-[rgba(10,10,14,0.62)] px-4 backdrop-blur-md">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-0.5 overflow-hidden">
              {selVec.length > 0 ? (
                selVec.map(([r, v]) => (
                  <span
                    key={r}
                    className="whitespace-nowrap text-[12.5px] font-extrabold tabular-nums"
                    style={{ color: ATTR_REGION_COLOR[r] }}
                  >
                    {ATTR_REGION_KO[r]} {v}%
                  </span>
                ))
              ) : (
                <span className="text-[12px] text-zinc-500">속성 없음</span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              aria-label="속성 상성 보기"
              className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white/10 text-[11px] font-black text-zinc-300 transition active:scale-90"
            >
              ?
            </button>
          </div>
        </div>
      </div>

      {/* 액션 — 규격 통일(h-10, 동일 라운드) */}
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={doAttr}
          disabled={pending || sel.attrId == null || isAttr || (inCooldown && diamond < gemCost)}
          className={`flex h-10 flex-1 items-center justify-center rounded-lg text-[12px] font-extrabold transition active:scale-[0.98] disabled:opacity-55 ${
            isAttr
              ? 'bg-zinc-100 text-zinc-400 dark:bg-white/[0.07] dark:text-zinc-500'
              : confirmGem
                ? 'bg-rose-600 text-white'
                : 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-950'
          }`}
        >
          {isAttr
            ? '속성 적용 중'
            : inCooldown
              ? diamond < gemCost
                ? `💎 ${gemCost.toLocaleString()} 부족`
                : confirmGem
                  ? `💎 ${gemCost.toLocaleString()} 확정`
                  : `💎 ${gemCost.toLocaleString()} 속성 적용`
              : '속성 적용'}
        </button>
        <button
          type="button"
          onClick={doLook}
          disabled={pending}
          className="flex h-10 w-[68px] shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-[12px] font-extrabold text-zinc-600 transition active:scale-[0.98] disabled:opacity-55 dark:bg-white/[0.07] dark:text-zinc-300"
        >
          {isLook ? '해제' : '외형'}
        </button>
        <Link
          prefetch={false}
          href="/me/create"
          className="flex h-10 w-[56px] shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-[12px] font-extrabold text-zinc-600 transition active:scale-[0.98] dark:bg-white/[0.07] dark:text-zinc-300"
        >
          생성
        </Link>
      </div>
      <p className="mt-2 h-[14px] text-center font-mono text-[10.5px] tabular-nums text-zinc-500">
        {inCooldown && !isAttr ? `교체 대기 ${fmtRemain(remainMs)} · 대기 후 무료` : ''}
      </p>

      {/* 선택 — 가로 스와이프 스트립(아바타만) */}
      <div
        ref={stripRef}
        className="-mx-4 mt-1 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {list.map((p) => {
          const pLook = p.id === activeId;
          const pAttr = p.attrId != null && p.attrId === eqAttrId;
          const d = dominant(p.attrs);
          return (
            <button
              key={p.id}
              type="button"
              onClick={(e) => pick(p, e.currentTarget)}
              className={`relative h-[74px] w-[74px] shrink-0 overflow-hidden rounded-xl border transition ${
                p.id === sel.id
                  ? 'border-zinc-900 dark:border-white'
                  : 'border-zinc-200 dark:border-white/10'
              }`}
              style={{
                background: `linear-gradient(165deg, ${
                  d ? `${ATTR_REGION_COLOR[d]}26` : 'rgba(255,255,255,.05)'
                }, #101014)`,
              }}
            >
              <span className="absolute left-1.5 top-1.5 z-10 flex gap-[2.5px]">
                {pLook ? (
                  <i className="block h-[5px] w-[5px] rounded-full bg-violet-400 shadow-[0_0_0_1.5px_rgba(0,0,0,0.5)]" />
                ) : null}
                {pAttr ? (
                  <i className="block h-[5px] w-[5px] rounded-full bg-amber-400 shadow-[0_0_0_1.5px_rgba(0,0,0,0.5)]" />
                ) : null}
              </span>
              {frontSrc(p) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={frontSrc(p)}
                  alt="아바타"
                  draggable={false}
                  className="h-full w-full object-contain object-bottom"
                  style={{ imageRendering: 'pixelated' }}
                />
              ) : null}
            </button>
          );
        })}
        <Link
          prefetch={false}
          href="/me/create"
          className="flex h-[74px] w-[74px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl border border-dashed border-zinc-300 text-zinc-400 dark:border-white/15 dark:text-zinc-500"
        >
          <span className="text-base" aria-hidden>
            ✨
          </span>
          <span className="text-[10px] font-semibold">생성</span>
        </Link>
      </div>

      {helpOpen ? <AttrHelpModal onClose={() => setHelpOpen(false)} attrs={sel.attrs} /> : null}
    </div>
  );
}
