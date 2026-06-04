'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import * as haptic from '@/lib/game/haptic';
import { useResourceToast } from '@/components/ResourceToast';
import { setActiveDirection, setActiveProfile, deleteProfile } from './actions';

type ProfileItem = {
  id: string;
  rotations: Record<string, string>;
  activeDirection: string;
};

// 시계방향 회전 순서: 정면 → 우앞 → 우 → 우뒤 → 뒤 → 좌뒤 → 좌 → 좌앞.
const ROT_ORDER = [
  'south',
  'south_east',
  'east',
  'north_east',
  'north',
  'north_west',
  'west',
  'south_west',
] as const;

const DIR_LABEL: Record<string, string> = {
  south: '정면',
  south_east: '우측 앞',
  east: '우측',
  north_east: '우측 뒤',
  north: '뒷면',
  north_west: '좌측 뒤',
  west: '좌측',
  south_west: '좌측 앞',
};

export function ProfileSelector({
  profiles,
  activeProfileId,
}: {
  profiles: ProfileItem[];
  activeProfileId: string | null;
}) {
  const router = useRouter();
  const { showHeaderToast } = useResourceToast();
  // 삭제된 프로필은 즉시 목록에서 제외(상세 페이지 유지) — optimistic.
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const list = profiles.filter((p) => !deletedIds.has(p.id));
  const initId =
    activeProfileId && list.some((p) => p.id === activeProfileId)
      ? activeProfileId
      : list[0]!.id;

  const [selectedId, setSelectedId] = useState<string>(initId);
  const sel = list.find((p) => p.id === selectedId) ?? list[0]!;
  const [dir, setDir] = useState<string>(sel.activeDirection);
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
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
    setDir(p.activeDirection);
    setConfirmDelete(false);
  };

  // 스와이프 회전(turntable) — 방향은 로컬 state만 변경.
  const STEP = 26;
  const dragRef = useRef<{ startX: number; baseIdx: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      baseIdx: Math.max(0, ROT_ORDER.indexOf(dir as (typeof ROT_ORDER)[number])),
    };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const steps = Math.round(-(e.clientX - d.startX) / STEP);
    const nd = ROT_ORDER[(((d.baseIdx + steps) % 8) + 8) % 8]!;
    if (nd !== dir) setDir(nd);
  };
  const endDrag = () => {
    dragRef.current = null;
  };

  // 적용 → 선택 캐릭터·방향을 한 번에 커밋.
  const activeNow = list.find((p) => p.id === activeProfileId);
  const dirty = selectedId !== activeProfileId || dir !== (activeNow?.activeDirection ?? '');
  const apply = () => {
    if (!dirty) return;
    haptic.success();
    // 낙관: 로딩 없이 즉시 /me로 이동. 두 갱신은 병렬로 백그라운드 커밋 →
    // 완료 후 router.refresh로 서버 권위 보정(초기 렌더가 stale이어도 자가 교정).
    router.push('/me');
    void Promise.all([
      setActiveProfile(selectedId),
      setActiveDirection(selectedId, dir),
    ]).then(([r1, r2]) => {
      const msg =
        r1.status === 'error' ? r1.message : r2.status === 'error' ? r2.message : null;
      if (msg) {
        alert(msg);
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
      if (r.status === 'error') return alert(r.message);
      // 삭제된 캐릭터는 목록에서 제외하고 남은 프로필로 전환 — 상세 페이지 유지.
      const remaining = list.filter((p) => p.id !== selectedId);
      if (remaining.length === 0) {
        router.push('/me');
        return;
      }
      setDeletedIds((s) => new Set(s).add(selectedId));
      setSelectedId(remaining[0]!.id);
      setDir(remaining[0]!.activeDirection);
      setConfirmDelete(false);
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      {/* 선택된 캐릭터 8방향 뷰어 — 스와이프로 회전, 방향은 즉시 적용 */}
      <div className="relative rounded-2xl border border-zinc-200 p-3 dark:border-zinc-800">
        {/* 삭제 — 프리뷰 컨테이너 우상단 코너. 3s 재탭 컨펌(마지막 1개 숨김). */}
        {list.length > 1 ? (
          <button
            type="button"
            onClick={doDelete}
            disabled={pending}
            aria-label="선택한 아바타 삭제"
            className={`absolute right-2 top-2 z-10 overflow-hidden rounded-full px-2.5 py-1 text-[11px] font-bold backdrop-blur-sm transition active:scale-95 disabled:opacity-50 ${
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
              {confirmDelete ? `삭제 확인 ${confirmDeleteLeft}s` : '삭제'}
            </span>
          </button>
        ) : null}
        <div
          className="relative mx-auto flex aspect-square w-full max-w-[256px] cursor-grab touch-pan-y select-none items-center justify-center overflow-hidden rounded-xl active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          {/* 발밑 타원 그림자 */}
          <div className="pointer-events-none absolute bottom-[6%] left-1/2 h-[6%] w-1/2 -translate-x-1/2 rounded-[50%] bg-black/45 blur-[6px]" />
          {ROT_ORDER.map((d) =>
            sel.rotations[d] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={d}
                src={sel.rotations[d]}
                alt={`아바타 ${DIR_LABEL[d] ?? d}`}
                draggable={false}
                className="pointer-events-none absolute inset-0 h-full w-full object-contain object-bottom"
                style={{
                  imageRendering: 'pixelated',
                  opacity: d === dir ? 1 : 0,
                  transform: 'scale(1.05)',
                  transformOrigin: 'center bottom',
                }}
              />
            ) : null,
          )}
        </div>
        <p className="mt-2 text-center text-[11px] text-zinc-400">← 좌우로 밀어 돌려보세요 →</p>
        <div className="mt-1 text-center text-xs font-medium text-zinc-500">
          {DIR_LABEL[dir] ?? dir}
        </div>
      </div>

      {/* 보유 목록 — 탭하면 미리보기(적용 버튼으로 확정) */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {list.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => selectChar(p)}
            className={`relative flex aspect-square w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border-2 bg-white dark:bg-zinc-950 ${
              p.id === selectedId
                ? 'border-violet-500'
                : 'border-zinc-200 dark:border-zinc-800'
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={p.rotations[p.activeDirection]}
              alt="아바타"
              draggable={false}
              className="h-full w-full object-contain"
              style={{ imageRendering: 'pixelated' }}
            />
          </button>
        ))}
      </div>

      {/* 적용 — 선택 캐릭터 + 방향을 대표 프로필로 커밋 */}
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
    </div>
  );
}
