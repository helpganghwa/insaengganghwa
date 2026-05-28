'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

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
  const initId =
    activeProfileId && profiles.some((p) => p.id === activeProfileId)
      ? activeProfileId
      : profiles[0]!.id;

  const [selectedId, setSelectedId] = useState<string>(initId);
  const sel = profiles.find((p) => p.id === selectedId) ?? profiles[0]!;
  const [dir, setDir] = useState<string>(sel.activeDirection);
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  // 캐릭터 선택 → 즉시 대표 전환 + 방향을 그 프로필 기준으로.
  const selectChar = (p: ProfileItem) => {
    if (p.id === selectedId) return;
    setSelectedId(p.id);
    setDir(p.activeDirection);
    setConfirmDelete(false);
    startTransition(async () => {
      const r = await setActiveProfile(p.id);
      if (r.status === 'error') return alert(r.message);
      router.refresh();
    });
  };

  // 스와이프 회전(turntable) — pointerup 시 방향 즉시 저장.
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
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    if (ROT_ORDER.indexOf(dir as (typeof ROT_ORDER)[number]) === d.baseIdx) return; // 안 돌면 저장 생략
    startTransition(async () => {
      const r = await setActiveDirection(selectedId, dir);
      if (r.status === 'error') return alert(r.message);
      router.refresh();
    });
  };

  const doDelete = () =>
    startTransition(async () => {
      const r = await deleteProfile(selectedId);
      if (r.status === 'error') return alert(r.message);
      router.push('/me');
    });

  return (
    <div className="space-y-4">
      {/* 선택된 캐릭터 8방향 뷰어 — 스와이프로 회전, 방향은 즉시 적용 */}
      <div className="rounded-2xl border border-zinc-200 p-3 dark:border-zinc-800">
        <div
          className="relative mx-auto flex aspect-square w-full max-w-[256px] cursor-grab touch-pan-y select-none items-center justify-center overflow-hidden rounded-xl bg-zinc-50 active:cursor-grabbing dark:bg-zinc-900"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          {ROT_ORDER.map((d) =>
            sel.rotations[d] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={d}
                src={sel.rotations[d]}
                alt={`프로필 ${DIR_LABEL[d] ?? d}`}
                draggable={false}
                className="pointer-events-none absolute inset-0 h-full w-full object-contain"
                style={{ imageRendering: 'pixelated', opacity: d === dir ? 1 : 0 }}
              />
            ) : null,
          )}
        </div>
        <p className="mt-2 text-center text-[11px] text-zinc-400">← 좌우로 밀어 돌려보세요 →</p>
        <div className="mt-1 text-center text-xs font-medium text-zinc-500">
          {DIR_LABEL[dir] ?? dir}
        </div>
      </div>

      {/* 보유 목록 — 탭하면 즉시 대표 전환 */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {profiles.map((p) => (
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
              alt="프로필"
              draggable={false}
              className="h-full w-full object-contain"
              style={{ imageRendering: 'pixelated' }}
            />
          </button>
        ))}
      </div>

      <p className="text-center text-[11px] text-zinc-400">
        선택한 캐릭터와 방향이 대표 프로필로 바로 적용돼요.
      </p>

      {/* 삭제 */}
      {confirmDelete ? (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setConfirmDelete(false)}
            disabled={pending}
            className="flex-1 rounded-xl border border-zinc-200 py-3 text-sm dark:border-zinc-800"
          >
            취소
          </button>
          <button
            type="button"
            onClick={doDelete}
            disabled={pending}
            className="flex-1 rounded-xl bg-red-600 py-3 text-sm font-semibold text-white"
          >
            삭제 확인
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          disabled={pending}
          className="w-full rounded-xl py-3 text-sm text-red-500"
        >
          선택한 프로필 삭제
        </button>
      )}
    </div>
  );
}
