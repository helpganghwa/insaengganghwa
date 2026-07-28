'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import * as haptic from '@/lib/game/haptic';
import { useResourceToast } from '@/components/ResourceToast';
import { runeVectorDesc } from '@/components/RuneName';
import { ATTR_REGION_COLOR, ATTR_REGION_KO, type AvatarAttr } from '@/lib/game/balance';

import dynamic from 'next/dynamic';

import { AttrHelpModal } from './AttrHelpModal';

// echarts는 무거워 초기 번들에서 제외 — 마운트 후 그려진다(자리는 미리 확보).
const AttrMiniChart = dynamic(() => import('./AttrMiniChart').then((m) => m.AttrMiniChart), {
  ssr: false,
  loading: () => <div className="h-[66px] w-[66px]" />,
});
import { setActiveProfile, deleteProfile } from './actions';

type ProfileItem = {
  id: string;
  rotations: Record<string, string>;
  /** 이 아바타에 각인된 속성(전투 적용은 대표 아바타 기준 — 별도 지정 없음). */
  attrs: AvatarAttr[];
};

/** 표시용 정면 이미지 — 항상 south(정면, 8방향 미사용). 레거시 프로필 대비 첫 값 폴백. */
function frontSrc(p: ProfileItem): string {
  return p.rotations.south ?? Object.values(p.rotations)[0] ?? '';
}

export function ProfileSelector({
  profiles,
  activeProfileId,
}: {
  profiles: ProfileItem[];
  activeProfileId: string | null;
}) {
  const router = useRouter();
  const { showHeaderToast, showError } = useResourceToast();
  // 삭제된 프로필은 즉시 목록에서 제외(상세 페이지 유지) — optimistic.
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const list = profiles.filter((p) => !deletedIds.has(p.id));
  const initId =
    activeProfileId && list.some((p) => p.id === activeProfileId)
      ? activeProfileId
      : list[0]!.id;

  const [selectedId, setSelectedId] = useState<string>(initId);
  const sel = list.find((p) => p.id === selectedId) ?? list[0]!;
  const selAttrs = runeVectorDesc(sel.attrs);
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [confirmDeleteLeft, setConfirmDeleteLeft] = useState(0); // 3s 재탭 컨펌 카운트다운

  // 삭제 — 강화 취소와 동일 3s 재탭 패턴(오탭 보호). 만료 시 자동 해제.
  useEffect(() => {
    if (!confirmDelete) {
      setConfirmDeleteLeft(0);
      return;
    }
    setConfirmDeleteLeft(3);
    const id = setInterval(() => {
      setConfirmDeleteLeft((s) => {
        if (s <= 1) {
          setConfirmDelete(false);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [confirmDelete]);

  // 캐릭터 선택 → 로컬 미리보기만(서버 반영은 "적용" 버튼).
  const selectChar = (p: ProfileItem) => {
    if (p.id === selectedId) return;
    setSelectedId(p.id);
    setConfirmDelete(false);
  };

  // 적용 → 선택 캐릭터를 대표로 커밋(방향은 정면 고정 — 회전 미사용).
  const dirty = selectedId !== activeProfileId;
  const apply = () => {
    if (!dirty) return;
    haptic.success();
    // 낙관: 로딩 없이 즉시 /me로 이동 → 백그라운드 커밋 후 router.refresh로 보정.
    router.push('/me');
    void setActiveProfile(selectedId).then((r) => {
      if (r.status === 'error') {
        showError(r.message);
        return;
      }
      showHeaderToast({ title: '대표 아바타 변경' });
      router.refresh();
    });
  };

  const doDelete = () => {
    if (pending) return;
    if (!confirmDelete) {
      setConfirmDelete(true); // 1탭: 3s 컨펌 진입
      return;
    }
    setConfirmDelete(false);
    startTransition(async () => {
      const r = await deleteProfile(selectedId);
      if (r.status === 'error') return showError(r.message);
      // 삭제된 캐릭터는 목록에서 제외하고 남은 프로필로 전환 — 상세 페이지 유지.
      const remaining = list.filter((p) => p.id !== selectedId);
      if (remaining.length === 0) {
        router.push('/me');
        return;
      }
      setDeletedIds((s) => new Set(s).add(selectedId));
      setSelectedId(remaining[0]!.id);
      setConfirmDelete(false);
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      {/* 선택된 캐릭터 정면 프리뷰(회전 미사용). */}
      <div className="relative rounded-2xl border border-zinc-200 p-3 dark:border-zinc-800">
        {/* 삭제 — 프리뷰 컨테이너 우상단 코너. 3s 재탭 컨펌(마지막 1개 숨김). */}
        {list.length > 1 ? (
          <button
            type="button"
            onClick={doDelete}
            disabled={pending}
            aria-label="선택한 아바타 삭제"
            className={`absolute right-2 top-2 z-10 isolate overflow-hidden rounded-full px-2.5 py-1 text-[11px] font-bold backdrop-blur-sm transition active:scale-95 disabled:opacity-50 ${
              confirmDelete ? 'bg-red-600 text-white' : 'bg-black/55 text-red-300'
            }`}
          >
            {/* 배경만 펄스(텍스트 안정) — 일괄 초월 확인버튼 패턴. */}
            {confirmDelete ? (
              <span
                aria-hidden
                className="absolute inset-0 bg-red-500"
                style={{ animation: 'confirm-bg-pulse 1.2s ease-in-out infinite' }}
              />
            ) : null}
            <span className="relative">
              {confirmDelete ? `삭제 ${confirmDeleteLeft}s` : '삭제'}
            </span>
          </button>
        ) : null}
        {/* 속성 코너 위젯 — 미니 폴라 차트(C1) + 중앙 '?' + 하단 수치. 위젯 전체가 상성 팝업 트리거. */}
        <button
          type="button"
          onClick={() => setHelpOpen(true)}
          aria-label="속성 상성 보기"
          className="absolute left-2 top-2 z-10 w-[78px] rounded-xl border border-white/10 bg-white/[0.05] p-1.5 text-left backdrop-blur-sm transition active:scale-95"
        >
          <div className="relative flex justify-center">
            <AttrMiniChart attrs={sel.attrs} />
            <span className="pointer-events-none absolute inset-0 grid place-items-center">
              <span className="grid h-[19px] w-[19px] place-items-center rounded-full bg-zinc-700 text-[10px] font-black text-zinc-200 ring-[1.5px] ring-black/50">
                ?
              </span>
            </span>
          </div>
          <div className="mt-1 flex flex-col gap-[2px]">
            {selAttrs.length > 0 ? (
              selAttrs.map(([r, v]) => (
                <span key={r} className="flex items-center gap-1 text-[9.5px] font-bold leading-[1.35] text-zinc-200">
                  <i
                    className="block h-[5px] w-[5px] shrink-0 rounded-full"
                    style={{ backgroundColor: ATTR_REGION_COLOR[r] }}
                  />
                  {ATTR_REGION_KO[r]}
                  <b className="ml-auto font-mono font-black tabular-nums">{v}%</b>
                </span>
              ))
            ) : (
              <span className="text-center text-[9px] text-zinc-500">속성 없음</span>
            )}
          </div>
        </button>
        <div className="relative mx-auto flex aspect-square w-full max-w-[256px] select-none items-center justify-center isolate overflow-hidden rounded-xl">
          {/* 발밑 타원 그림자 */}
          <div className="pointer-events-none absolute bottom-[6%] left-1/2 h-[6%] w-1/2 -translate-x-1/2 rounded-[50%] bg-black/45 blur-[6px]" />
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
      </div>

      {/* 보유 목록 — 탭하면 미리보기(적용 버튼으로 확정) */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {list.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => selectChar(p)}
            className={`relative flex aspect-square w-16 shrink-0 items-center justify-center isolate overflow-hidden rounded-lg border-2 bg-white dark:bg-zinc-950 ${
              p.id === selectedId
                ? 'border-violet-500'
                : 'border-zinc-200 dark:border-zinc-800'
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={frontSrc(p)}
              alt="아바타"
              draggable={false}
              className="h-full w-full object-contain"
              style={{ imageRendering: 'pixelated' }}
            />
          </button>
        ))}
      </div>

      {/* 적용 — 선택 캐릭터를 대표 프로필로 커밋 */}
      <button
        type="button"
        onClick={apply}
        disabled={pending || !dirty}
        className={`w-full rounded-xl py-3.5 text-sm font-bold transition-colors ${
          pending || !dirty
            ? 'bg-zinc-200 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-600'
            : 'bg-violet-600 text-white'
        }`}
      >
        {!dirty ? '현재 대표 아바타' : '이 아바타로 적용'}
      </button>

      {helpOpen ? <AttrHelpModal onClose={() => setHelpOpen(false)} attrs={sel.attrs} /> : null}
    </div>
  );
}
