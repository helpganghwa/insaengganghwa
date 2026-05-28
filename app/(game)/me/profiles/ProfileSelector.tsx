'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { PROFILE_BACKGROUNDS, backgroundSrc } from '@/lib/game/profile/backgrounds';

import {
  setActiveDirection,
  setActiveProfile,
  setActiveBackground,
  deleteProfile,
} from './actions';

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
  activeBackground,
}: {
  profiles: ProfileItem[];
  activeProfileId: string | null;
  activeBackground: string | null;
}) {
  const router = useRouter();
  const initId =
    activeProfileId && profiles.some((p) => p.id === activeProfileId)
      ? activeProfileId
      : profiles[0]!.id;

  const [selectedId, setSelectedId] = useState<string>(initId);
  const sel = profiles.find((p) => p.id === selectedId) ?? profiles[0]!;
  const [dir, setDir] = useState<string>(sel.activeDirection);
  const [bgKey, setBgKey] = useState<string | null>(activeBackground);
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const bgSrc = backgroundSrc(bgKey);

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

  // 적용 → 선택 캐릭터·방향·배경을 한 번에 커밋.
  const activeNow = profiles.find((p) => p.id === activeProfileId);
  const dirty =
    selectedId !== activeProfileId ||
    dir !== (activeNow?.activeDirection ?? '') ||
    bgKey !== activeBackground;
  const apply = () =>
    startTransition(async () => {
      const r1 = await setActiveProfile(selectedId);
      if (r1.status === 'error') return alert(r1.message);
      const r2 = await setActiveDirection(selectedId, dir);
      if (r2.status === 'error') return alert(r2.message);
      const r3 = await setActiveBackground(bgKey);
      if (r3.status === 'error') return alert(r3.message);
      router.push('/me');
    });

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
          {bgSrc && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={bgSrc}
              alt=""
              aria-hidden
              draggable={false}
              className="pointer-events-none absolute inset-0 h-full w-full object-cover"
              style={{ imageRendering: 'pixelated' }}
            />
          )}
          {ROT_ORDER.map((d) =>
            sel.rotations[d] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={d}
                src={sel.rotations[d]}
                alt={`프로필 ${DIR_LABEL[d] ?? d}`}
                draggable={false}
                className="pointer-events-none absolute inset-0 h-full w-full object-contain object-bottom"
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

      {/* 보유 목록 — 탭하면 미리보기(적용 버튼으로 확정) */}
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

      {/* 배경 선택 (전역 1개) — 뷰어에 즉시 미리보기, 적용 버튼으로 확정 */}
      <div>
        <div className="mb-2 text-xs font-medium text-zinc-500">배경</div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setBgKey(null)}
            className={`flex aspect-square w-16 shrink-0 items-center justify-center rounded-lg border-2 text-[10px] ${
              bgKey === null
                ? 'border-violet-500 text-violet-600'
                : 'border-zinc-200 text-zinc-400 dark:border-zinc-800'
            }`}
          >
            없음
          </button>
          {PROFILE_BACKGROUNDS.map((bg) => (
            <button
              key={bg.key}
              type="button"
              onClick={() => setBgKey(bg.key)}
              aria-label={bg.label}
              className={`relative flex aspect-square w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border-2 ${
                bgKey === bg.key ? 'border-violet-500' : 'border-zinc-200 dark:border-zinc-800'
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={bg.src}
                alt={bg.label}
                draggable={false}
                className="h-full w-full object-cover"
                style={{ imageRendering: 'pixelated' }}
              />
            </button>
          ))}
        </div>
      </div>

      {/* 적용 — 선택 캐릭터 + 방향 + 배경을 대표 프로필로 커밋 */}
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
        {!dirty ? '현재 대표 프로필' : '이 프로필로 적용'}
      </button>

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
