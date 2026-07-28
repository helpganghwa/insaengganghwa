'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import * as haptic from '@/lib/game/haptic';
import { useResourceToast } from '@/components/ResourceToast';
import { ModalShell } from '@/components/ModalShell';
import { RuneName, RuneValues, runeVectorDesc } from '@/components/RuneName';
import {
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
 * 아바타 관리(I안 확정, 2026-07-28) — 2열 그리드. 카드 = 아바타(크게) + 속성 4번째 줄 개념.
 * 아바타 영역: 외형 적용/해제 토글 · 속성 영역: 속성 적용(72h 쿨 + 💎 즉시) · 우상단 삭제.
 * 속성 이름/수치 탭 → 상성 시트. 삭제 시 속성도 함께 소멸(0141 cascade) — 컨펌에 명시.
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

  // 낙관적 로컬 상태 — 액션 성공 즉시 반영. props 갱신 시 렌더 중 조정 패턴으로 재동기화.
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
  const list = profiles.filter((p) => !deletedIds.has(p.id));

  const [pending, startTransition] = useTransition();
  // 삭제 2탭 컨펌(3s) — 카드별.
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  useEffect(() => {
    if (!confirmDeleteId) return;
    const t = setTimeout(() => setConfirmDeleteId(null), 3000);
    return () => clearTimeout(t);
  }, [confirmDeleteId]);
  // 💎 즉시 교체 2탭 컨펌(3s) — 카드별.
  const [confirmGemId, setConfirmGemId] = useState<string | null>(null);
  useEffect(() => {
    if (!confirmGemId) return;
    const t = setTimeout(() => setConfirmGemId(null), 3000);
    return () => clearTimeout(t);
  }, [confirmGemId]);

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

  const [sheetId, setSheetId] = useState<string | null>(null);
  const sheet = useMemo(() => list.find((p) => p.id === sheetId) ?? null, [list, sheetId]);

  const doLook = (p: ProfileItem) => {
    if (pending) return;
    const isActive = p.id === activeId;
    haptic.success();
    if (isActive) {
      setActiveId(null); // 낙관 해제
      void clearActiveProfile().then((r) => {
        if (r.status === 'error') {
          setActiveId(p.id);
          showError(r.message);
        }
      });
    } else {
      setActiveId(p.id); // 낙관 적용
      void setActiveProfile(p.id).then((r) => {
        if (r.status === 'error') {
          setActiveId(activeId);
          showError(r.message);
        } else {
          showHeaderToast({ title: '외형 아바타 변경' });
        }
      });
    }
  };

  const doAttr = (p: ProfileItem, useGems: boolean) => {
    if (pending || p.attrId == null || p.attrId === eqAttrId) return;
    if (useGems && confirmGemId !== p.id) {
      setConfirmGemId(p.id); // 1탭: 컨펌 진입
      return;
    }
    setConfirmGemId(null);
    startTransition(async () => {
      const r = await applyAttrProfile(p.id, useGems);
      if (r.status === 'success') {
        setEqAttrId(p.attrId);
        setChangedAt(Date.now());
        setSheetId(null);
        showHeaderToast({ title: '속성 적용' });
      } else if (r.status === 'cooldown') {
        showError(`교체 대기 ${fmtRemain(r.remainingMs)} 남음 · 💎 ${r.gemCost.toLocaleString()}로 즉시 교체할 수 있어요.`);
      } else {
        showError(r.message);
      }
    });
  };

  const doDelete = (p: ProfileItem) => {
    if (pending) return;
    if (confirmDeleteId !== p.id) {
      setConfirmDeleteId(p.id);
      return;
    }
    setConfirmDeleteId(null);
    startTransition(async () => {
      const r = await deleteProfile(p.id);
      if (r.status === 'error') return showError(r.message);
      setDeletedIds((s) => new Set(s).add(p.id));
      if (p.id === activeId) setActiveId(null);
      if (p.attrId != null && p.attrId === eqAttrId) setEqAttrId(null);
      router.refresh();
    });
  };

  return (
    <div>
      {/* 교체 쿨 상태 — 상단 1줄 요약(쿨 없으면 숨김) */}
      {inCooldown ? (
        <p className="mb-3 text-center text-[11px] text-zinc-500">
          속성 교체 대기 <span className="font-mono tabular-nums">{fmtRemain(remainMs)}</span> · 즉시 교체 💎{' '}
          {gemCost.toLocaleString()}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        {list.map((p) => {
          const isLook = p.id === activeId;
          const isAttr = p.attrId != null && p.attrId === eqAttrId;
          const confirmingDel = confirmDeleteId === p.id;
          const confirmingGem = confirmGemId === p.id;
          return (
            <div
              key={p.id}
              className={`relative flex flex-col rounded-2xl border bg-white p-2 dark:bg-zinc-950 ${
                isAttr
                  ? 'border-amber-400/70 dark:border-amber-500/50'
                  : isLook
                    ? 'border-violet-400/70 dark:border-violet-500/50'
                    : 'border-zinc-200 dark:border-zinc-800'
              }`}
            >
              {/* 삭제 — 우상단(기본 아바타 제외). 속성 동반 소멸 경고를 컨펌 라벨에 담음. */}
              {!p.isDefault && list.length > 1 ? (
                <button
                  type="button"
                  onClick={() => doDelete(p)}
                  disabled={pending}
                  aria-label="아바타 삭제(속성 포함)"
                  className={`absolute right-1.5 top-1.5 z-10 rounded-full px-2 py-0.5 text-[10px] font-bold backdrop-blur-sm transition active:scale-95 disabled:opacity-50 ${
                    confirmingDel ? 'bg-red-600 text-white' : 'bg-black/50 text-red-300'
                  }`}
                >
                  {confirmingDel ? '속성도 삭제됨' : '삭제'}
                </button>
              ) : null}

              {/* 뱃지 — 좌상단 */}
              <div className="absolute left-1.5 top-1.5 z-10 flex gap-1">
                {isLook ? (
                  <span className="rounded-full bg-violet-600/90 px-1.5 py-0.5 text-[9px] font-extrabold text-white">외형</span>
                ) : null}
                {isAttr ? (
                  <span className="rounded-full bg-amber-500/90 px-1.5 py-0.5 text-[9px] font-extrabold text-black">속성</span>
                ) : null}
              </div>

              {/* 아바타 — 크게 */}
              <div className="relative flex aspect-square w-full select-none items-end justify-center isolate overflow-hidden rounded-xl">
                <div className="pointer-events-none absolute bottom-[5%] left-1/2 h-[6%] w-1/2 -translate-x-1/2 rounded-[50%] bg-black/40 blur-[5px]" />
                {frontSrc(p) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={frontSrc(p)}
                    alt="아바타"
                    draggable={false}
                    className="pointer-events-none absolute inset-0 h-full w-full object-contain object-bottom"
                    style={{ imageRendering: 'pixelated' }}
                  />
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => doLook(p)}
                disabled={pending}
                className={`mt-1.5 h-9 w-full rounded-lg text-[12px] font-bold transition active:scale-[0.98] disabled:opacity-60 ${
                  isLook
                    ? 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
                    : 'bg-violet-600 text-white'
                }`}
              >
                {isLook ? '아바타 해제' : '아바타 적용'}
              </button>

              {/* 속성 — 4번째 줄 개념. 이름/수치 탭 → 상성 시트. */}
              <div className="mt-2 border-t border-zinc-100 pt-2 dark:border-zinc-900">
                {p.attrId != null ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setSheetId(p.id)}
                      className="block w-full text-left"
                      aria-label="속성 상세(상성)"
                    >
                      <div className="flex min-w-0 items-center gap-1">
                        <span className="shrink-0 text-[10px]" aria-hidden>🔮</span>
                        <RuneName name={p.attrName} attrs={p.attrs} className="text-[12px]" />
                      </div>
                      <RuneValues attrs={p.attrs} className="mt-0.5 text-[10.5px]" />
                    </button>
                    <button
                      type="button"
                      onClick={() => doAttr(p, inCooldown)}
                      disabled={pending || isAttr || (inCooldown && diamond < gemCost)}
                      className={`mt-1.5 h-9 w-full rounded-lg text-[12px] font-bold transition active:scale-[0.98] disabled:opacity-60 ${
                        isAttr
                          ? 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
                          : confirmingGem
                            ? 'bg-rose-600 text-white'
                            : inCooldown
                              ? 'bg-sky-600 text-white'
                              : 'bg-amber-600 text-white'
                      }`}
                    >
                      {isAttr
                        ? '속성 적용 중'
                        : inCooldown
                          ? diamond < gemCost
                            ? '다이아 부족'
                            : confirmingGem
                              ? `💎 ${gemCost.toLocaleString()} 확정`
                              : `💎 ${gemCost.toLocaleString()} 교체`
                          : '속성 적용'}
                    </button>
                  </>
                ) : (
                  <p className="py-2 text-center text-[10.5px] text-zinc-400">속성 없음</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 상성 시트 */}
      {sheet && sheet.attrId != null ? (
        <ModalShell
          onClose={() => setSheetId(null)}
          label={sheet.attrName ?? '속성 상세'}
          align="bottom"
          className="w-full max-w-[358px] rounded-2xl bg-white p-4 shadow-xl dark:bg-zinc-900"
        >
          <div className="flex min-w-0">
            <RuneName name={sheet.attrName} attrs={sheet.attrs} className="text-lg" />
          </div>
          <RuneValues attrs={sheet.attrs} className="mt-1.5 text-[13px]" />
          <div className="mt-3 space-y-1.5 rounded-xl bg-zinc-50 p-3 dark:bg-zinc-800/60">
            {runeVectorDesc(sheet.attrs).map(([r]) => (
              <p key={r} className="flex items-center gap-2 text-[12px]">
                <span className="w-9 shrink-0 font-bold">{ATTR_REGION_KO[r]}</span>
                <span className="text-zinc-500">
                  강함 <b className="text-emerald-600 dark:text-emerald-400">{ATTR_REGION_KO[attrPrey(r)]}</b>
                  {' · '}약점 <b className="text-rose-500 dark:text-rose-400">{ATTR_REGION_KO[attrPredator(r)]}</b>
                </span>
              </p>
            ))}
            <p className="pt-0.5 text-[10px] leading-relaxed text-zinc-400">
              상대가 내 각 권역의 &lsquo;강함&rsquo; 권역을 지니고 있으면 그만큼 내 공격이 강해집니다.
            </p>
          </div>
          <div className="mt-3">
            {sheet.attrId === eqAttrId ? (
              <div className="flex h-11 w-full items-center justify-center rounded-full bg-zinc-100 text-sm font-bold text-zinc-400 dark:bg-zinc-800">
                속성 적용 중
              </div>
            ) : (
              <button
                type="button"
                disabled={pending || (inCooldown && diamond < gemCost)}
                onClick={() => doAttr(sheet, inCooldown)}
                className={`flex h-11 w-full items-center justify-center rounded-full text-sm font-bold text-white shadow-md transition active:scale-[0.99] disabled:opacity-60 ${
                  confirmGemId === sheet.id ? 'bg-rose-600' : inCooldown ? 'bg-sky-600' : 'bg-amber-600'
                }`}
              >
                {inCooldown
                  ? diamond < gemCost
                    ? `다이아 부족 (💎 ${gemCost.toLocaleString()} 필요)`
                    : confirmGemId === sheet.id
                      ? `한 번 더 누르면 💎 ${gemCost.toLocaleString()} 사용`
                      : `💎 ${gemCost.toLocaleString()} 즉시 교체`
                  : '속성 적용'}
              </button>
            )}
          </div>
        </ModalShell>
      ) : null}
    </div>
  );
}
