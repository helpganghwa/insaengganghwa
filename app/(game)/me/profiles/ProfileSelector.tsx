'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import * as haptic from '@/lib/game/haptic';
import { useResourceToast } from '@/components/ResourceToast';
import { ModalShell } from '@/components/ModalShell';
import { runeVectorDesc } from '@/components/RuneName';
import {
  ATTR_REGION_COLOR,
  ATTR_REGION_KO,
  AVATAR_ATTR_REGIONS,
  AVATAR_ATTR_ROLL_MAX,
  AVATAR_ATTR_TOTAL_MAX,
  attrPredator,
  attrPrey,
  GEM_TO_MS,
  RUNE_SWAP_COOLDOWN_MS,
  type AttrRegion,
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

/** 막대 길이 기준 — 권역 합산 이론 최대는 150이나 실측 P99가 94라 100 스케일이 가장 잘 읽힌다. */
const BAR_SCALE = 100;
const barPct = (v: number) => `${Math.min(100, (v / BAR_SCALE) * 100)}%`;

/** 남은 시간 — 23:41:08 (총 시:분:초). */
function fmtRemain(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** 지배 권역 — 스테이지 틴트 색. 속성 없으면 null. */
function dominant(attrs: AvatarAttr[]): AttrRegion | null {
  return runeVectorDesc(attrs)[0]?.[0] ?? null;
}

/**
 * 아바타 관리 — 아바타가 메인, 속성은 라벨(2026-07-28 확정 C안).
 * 스테이지(지배 권역 틴트) 위에 아바타를 크게 두고, 데이터는 하단 글래스 패널에 권역·막대·수치만.
 * 상성은 카드에서 빼고 `?` → 속성 시스템 설명 모달로(컴팩트 유지). 3열 그리드는 미니 막대 라벨.
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
      {/* 헤더 — 생성 상시 노출 */}
      <div className="flex items-center gap-2 pb-3">
        <span className="flex-1 text-[13px] font-extrabold tracking-tight text-zinc-900 dark:text-zinc-100">
          아바타 <span className="text-zinc-400 dark:text-zinc-500">{list.length}</span>
        </span>
        <Link
          prefetch={false}
          href="/me/create"
          className="rounded-full bg-zinc-900 px-3.5 py-1.5 text-[11px] font-extrabold text-white transition active:scale-95 dark:bg-white/10"
        >
          생성
        </Link>
      </div>

      {/* 스테이지 — 지배 권역 틴트 + 아바타 + 글래스 데이터 패널 */}
      <div className="overflow-hidden rounded-2xl border border-white/10">
        <div className="relative">
          <div
            className="absolute inset-0"
            style={{
              background: `radial-gradient(110% 90% at 50% 8%, ${
                tint ? `${ATTR_REGION_COLOR[tint]}3d` : 'rgba(255,255,255,.06)'
              }, transparent 68%), linear-gradient(#14141a, #0c0c11)`,
            }}
          />
          {/* 상태 뱃지 — 무채색(권역색은 데이터 전용) */}
          <div className="absolute left-2.5 top-2.5 z-10 flex gap-1">
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
              className={`absolute right-2.5 top-2.5 z-10 rounded-[6px] px-2 py-[3px] text-[10px] font-extrabold transition active:scale-95 disabled:opacity-50 ${
                confirmDelete ? 'bg-red-600 text-white' : 'bg-black/35 text-rose-300'
              }`}
            >
              {confirmDelete ? '속성도 삭제' : '삭제'}
            </button>
          ) : null}

          <div className="relative flex h-[176px] items-end justify-center">
            <div className="absolute bottom-[6px] h-[10px] w-[88px] rounded-[50%] bg-black/50 blur-[5px]" />
            {frontSrc(sel) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={frontSrc(sel)}
                alt="아바타"
                draggable={false}
                className="relative h-[150px] w-full object-contain object-bottom drop-shadow-[0_10px_14px_rgba(0,0,0,0.55)]"
                style={{ imageRendering: 'pixelated' }}
              />
            ) : null}
          </div>

          {/* 글래스 패널 — 이름(보조) + 권역·막대·수치 */}
          <div className="relative border-t border-white/10 bg-[rgba(10,10,14,0.62)] px-3 pb-3 pt-2.5 backdrop-blur-md">
            <div className="mb-2 flex items-center gap-1.5">
              <span className="min-w-0 flex-1 truncate text-[10.5px] font-semibold text-zinc-400">
                {sel.attrId != null ? (sel.attrName ?? '이름 없는 속성') : '속성 없음'}
              </span>
              <button
                type="button"
                onClick={() => setHelpOpen(true)}
                aria-label="속성 시스템 설명"
                className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-white/10 text-[10px] font-black text-zinc-300 transition active:scale-90"
              >
                ?
              </button>
            </div>
            {selVec.length > 0 ? (
              <div className="flex flex-col gap-[3px]">
                {selVec.map(([r, v]) => (
                  <div key={r} className="flex items-center gap-2">
                    <span
                      className="w-6 text-[10.5px] font-extrabold"
                      style={{ color: ATTR_REGION_COLOR[r] }}
                    >
                      {ATTR_REGION_KO[r]}
                    </span>
                    <span className="h-1 flex-1 overflow-hidden rounded-sm bg-white/10">
                      <i
                        className="block h-full rounded-sm"
                        style={{ width: barPct(v), backgroundColor: ATTR_REGION_COLOR[r] }}
                      />
                    </span>
                    <span
                      className="w-6 text-right font-mono text-[12.5px] font-black tabular-nums"
                      style={{ color: ATTR_REGION_COLOR[r] }}
                    >
                      {v}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-1 text-[11px] text-zinc-500">이 아바타에는 속성이 없습니다.</p>
            )}
          </div>
        </div>
      </div>

      {/* 액션 */}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={doAttr}
          disabled={pending || sel.attrId == null || isAttr || (inCooldown && diamond < gemCost)}
          className={`flex h-11 flex-1 items-center justify-center rounded-xl text-[12.5px] font-black transition active:scale-[0.98] disabled:opacity-60 ${
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
                  ? `💎 ${gemCost.toLocaleString()} 사용 확정`
                  : `💎 ${gemCost.toLocaleString()} 속성 적용`
              : '속성 적용'}
        </button>
        <button
          type="button"
          onClick={doLook}
          disabled={pending}
          className="flex h-11 w-[74px] items-center justify-center rounded-xl bg-zinc-100 text-[11.5px] font-extrabold text-zinc-600 transition active:scale-[0.98] disabled:opacity-60 dark:bg-white/[0.07] dark:text-zinc-300"
        >
          {isLook ? '외형 해제' : '외형'}
        </button>
      </div>
      {inCooldown && !isAttr ? (
        <p className="mt-2 text-center font-mono text-[10.5px] tabular-nums text-zinc-500">
          교체 대기 {fmtRemain(remainMs)} · 대기 후 무료
        </p>
      ) : null}

      {/* 3열 그리드 — 아바타 + 미니 막대 라벨 */}
      <div className="mt-3.5 grid grid-cols-3 gap-[7px]">
        {list.map((p) => {
          const d = dominant(p.attrs);
          const vec = runeVectorDesc(p.attrs);
          const pLook = p.id === activeId;
          const pAttr = p.attrId != null && p.attrId === eqAttrId;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => pick(p)}
              className={`relative overflow-hidden rounded-[13px] border text-left transition active:scale-[0.98] ${
                p.id === sel.id ? 'border-white/55' : 'border-white/[0.07]'
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
              <div className="flex h-[74px] items-end justify-center">
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
              </div>
              <div className="flex flex-col gap-[2.5px] bg-black/50 px-1.5 pb-1.5 pt-[5px] backdrop-blur-sm">
                {vec.length > 0 ? (
                  vec.map(([r, v]) => (
                    <div key={r} className="flex items-center gap-1">
                      <span
                        className="w-4 text-[8px] font-extrabold"
                        style={{ color: ATTR_REGION_COLOR[r] }}
                      >
                        {ATTR_REGION_KO[r]}
                      </span>
                      <span className="h-[3px] flex-1 overflow-hidden rounded-sm bg-white/10">
                        <i
                          className="block h-full rounded-sm"
                          style={{ width: barPct(v), backgroundColor: ATTR_REGION_COLOR[r] }}
                        />
                      </span>
                      <span className="w-[14px] text-right font-mono text-[8.5px] font-black tabular-nums text-zinc-400">
                        {v}
                      </span>
                    </div>
                  ))
                ) : (
                  <span className="py-[3px] text-center text-[8px] text-zinc-600">속성 없음</span>
                )}
              </div>
            </button>
          );
        })}
        <Link
          prefetch={false}
          href="/me/create"
          className="flex min-h-[104px] flex-col items-center justify-center gap-1 rounded-[13px] border border-dashed border-zinc-300 text-zinc-400 transition active:scale-[0.98] dark:border-white/15 dark:text-zinc-500"
        >
          <span className="text-lg" aria-hidden>
            ✨
          </span>
          <span className="text-[10px] font-semibold">생성</span>
        </Link>
      </div>

      {helpOpen ? <AttrHelpModal onClose={() => setHelpOpen(false)} attrs={sel.attrs} /> : null}
    </div>
  );
}

/** 속성 시스템 설명 — 상성 순환·계산식·적용처 + 선택 아바타의 강/약 요약(공시 §6과 1:1). */
function AttrHelpModal({ onClose, attrs }: { onClose: () => void; attrs: AvatarAttr[] }) {
  const vec = runeVectorDesc(attrs);
  return (
    <ModalShell
      onClose={onClose}
      label="속성 시스템 설명"
      align="bottom"
      className="w-full max-w-[358px] rounded-2xl border border-white/10 bg-zinc-950 p-4 text-zinc-100 shadow-xl"
    >
      <h2 className="text-[15px] font-black tracking-tight">속성</h2>
      <p className="mt-1.5 text-[11.5px] leading-relaxed text-zinc-400">
        아바타를 만들 때 무기·방어구·장신구 세 줄의 속성이 함께 각인됩니다. 각 줄은 여섯 권역 중
        하나와 수치(0~{AVATAR_ATTR_ROLL_MAX})를 가지며, 같은 권역끼리는 합산됩니다(권역당 최대{' '}
        {AVATAR_ATTR_TOTAL_MAX}). 각인된 속성은 바뀌지 않습니다.
      </p>

      <h3 className="mt-4 text-[10px] font-black uppercase tracking-[0.09em] text-zinc-500">
        상성 순환
      </h3>
      <div className="mt-2 flex flex-wrap items-center gap-x-1 gap-y-1.5">
        {AVATAR_ATTR_REGIONS.map((r, i) => (
          <span key={r} className="flex items-center gap-1">
            <span className="text-[11.5px] font-extrabold" style={{ color: ATTR_REGION_COLOR[r] }}>
              {ATTR_REGION_KO[r]}
            </span>
            <span className="text-[10px] text-zinc-600">▸</span>
            {i === AVATAR_ATTR_REGIONS.length - 1 ? (
              <span className="text-[11.5px] font-extrabold" style={{ color: ATTR_REGION_COLOR[AVATAR_ATTR_REGIONS[0]] }}>
                {ATTR_REGION_KO[AVATAR_ATTR_REGIONS[0]]}
              </span>
            ) : null}
          </span>
        ))}
      </div>
      <p className="mt-1.5 text-[11px] text-zinc-500">왼쪽 권역이 바로 오른쪽 권역에만 강합니다.</p>

      <h3 className="mt-4 text-[10px] font-black uppercase tracking-[0.09em] text-zinc-500">
        계산 방법
      </h3>
      <p className="mt-2 rounded-lg bg-white/[0.05] px-3 py-2.5 text-[11px] leading-relaxed text-zinc-300">
        내 공격 보정 = 내 권역 수치 ×{' '}
        <span className="whitespace-nowrap">(상대가 가진 &lsquo;내가 강한 권역&rsquo; 수치 ÷ {AVATAR_ATTR_TOTAL_MAX})</span>
        <span className="mt-1 block text-zinc-500">권역마다 계산해 모두 더하며, 최대 +{AVATAR_ATTR_TOTAL_MAX}%까지 오릅니다.</span>
      </p>
      <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
        예) 내 <b className="text-zinc-300">화산 40</b> · 상대 <b className="text-zinc-300">신전 75</b> →
        40 × (75 ÷ {AVATAR_ATTR_TOTAL_MAX}) = <b className="text-zinc-300">+20%</b> 공격.
        상대가 내가 강한 권역을 안 가졌다면 보정은 0입니다.
      </p>

      <h3 className="mt-4 text-[10px] font-black uppercase tracking-[0.09em] text-zinc-500">
        적용되는 곳
      </h3>
      <p className="mt-1.5 text-[11.5px] text-zinc-400">
        점령전 · 대난투에 그대로, 레이드에는 절반만 적용됩니다.
      </p>

      {vec.length > 0 ? (
        <>
          <h3 className="mt-4 text-[10px] font-black uppercase tracking-[0.09em] text-zinc-500">
            이 아바타
          </h3>
          <div className="mt-2 flex flex-col gap-1.5">
            {vec.map(([r, v]) => (
              <div key={r} className="flex items-center gap-2 text-[11.5px]">
                <span className="w-14 font-extrabold" style={{ color: ATTR_REGION_COLOR[r] }}>
                  {ATTR_REGION_KO[r]} {v}
                </span>
                <span className="text-zinc-500">
                  강함 <b className="text-emerald-400">{ATTR_REGION_KO[attrPrey(r)]}</b> · 약점{' '}
                  <b className="text-rose-400">{ATTR_REGION_KO[attrPredator(r)]}</b>
                </span>
              </div>
            ))}
          </div>
        </>
      ) : null}

      <button
        type="button"
        onClick={onClose}
        className="mt-4 h-11 w-full rounded-xl bg-white text-[12.5px] font-black text-zinc-950 transition active:scale-[0.98] dark:bg-white dark:text-zinc-950"
      >
        확인
      </button>
    </ModalShell>
  );
}
