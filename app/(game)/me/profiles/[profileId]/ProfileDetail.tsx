'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { setActiveDirection, setActiveProfile, deleteProfile } from './actions';

export type ProfileOptionsView = {
  gender?: string;
  race?: string;
  expression?: string;
  hairLength?: string;
};

// 시계방향 회전 순서 (PROFILE §8.2): 정면 → 우앞 → 우 → 우뒤 → 뒤 → 좌뒤 → 좌 → 좌앞.
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

const GENDER_LABEL: Record<string, string> = { female: '여성', male: '남성' };
const RACE_LABEL: Record<string, string> = {
  human: '인간',
  elf: '엘프',
  dark_elf: '다크엘프',
  nekomimi: '수인',
  dragonkin: '용인',
  fairy: '요정',
};

export function ProfileDetail({
  profileId,
  rotations,
  initialDirection,
  isActive,
  options,
}: {
  profileId: string;
  rotations: Record<string, string>;
  initialDirection: string;
  isActive: boolean;
  options: ProfileOptionsView;
}) {
  const router = useRouter();
  const [dir, setDir] = useState<string>(initialDirection);
  const [savedDir, setSavedDir] = useState<string>(initialDirection);
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const idx = Math.max(0, ROT_ORDER.indexOf(dir as (typeof ROT_ORDER)[number]));
  const go = (delta: number) => setDir(ROT_ORDER[(idx + delta + 8) % 8]!);

  const saveDir = () =>
    startTransition(async () => {
      const r = await setActiveDirection(profileId, dir);
      if (r.status === 'error') return alert(r.message);
      setSavedDir(dir);
      router.refresh();
    });

  const makeActive = () =>
    startTransition(async () => {
      const r = await setActiveProfile(profileId);
      if (r.status === 'error') return alert(r.message);
      router.refresh();
    });

  const doDelete = () =>
    startTransition(async () => {
      const r = await deleteProfile(profileId);
      if (r.status === 'error') return alert(r.message);
      router.push('/me');
    });

  const src = rotations[dir];
  const tags = [
    options.gender ? (GENDER_LABEL[options.gender] ?? options.gender) : null,
    options.race ? (RACE_LABEL[options.race] ?? options.race) : null,
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-4">
      {/* 8방향 뷰어 */}
      <div className="rounded-2xl border border-zinc-200 p-3 dark:border-zinc-800">
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label="이전 방향"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-lg dark:bg-zinc-800"
          >
            ‹
          </button>
          <div className="relative flex aspect-square w-full max-w-[256px] items-center justify-center overflow-hidden rounded-xl bg-zinc-50 dark:bg-zinc-900">
            {src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={src}
                alt={`프로필 ${DIR_LABEL[dir] ?? dir}`}
                draggable={false}
                className="h-full w-full object-contain"
                style={{ imageRendering: 'pixelated' }}
              />
            ) : (
              <span className="text-xs text-zinc-400">이미지 없음</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => go(1)}
            aria-label="다음 방향"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-lg dark:bg-zinc-800"
          >
            ›
          </button>
        </div>

        {/* 방향 라벨 + dot 인디케이터 */}
        <div className="mt-2 text-center text-xs font-medium text-zinc-500">
          {DIR_LABEL[dir] ?? dir}
          {savedDir === dir && <span className="ml-1 text-violet-500">· 현재 설정</span>}
        </div>
        <div className="mt-2 flex items-center justify-center gap-1.5">
          {ROT_ORDER.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDir(d)}
              aria-label={DIR_LABEL[d]}
              className={`h-2 w-2 rounded-full transition-colors ${
                d === dir
                  ? 'bg-violet-500'
                  : d === savedDir
                    ? 'bg-violet-300'
                    : 'bg-zinc-300 dark:bg-zinc-700'
              }`}
            />
          ))}
        </div>
      </div>

      {/* 옵션 태그 */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <span
              key={t}
              className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
            >
              {t}
            </span>
          ))}
        </div>
      )}

      {/* 액션 */}
      <div className="space-y-2">
        <button
          type="button"
          onClick={saveDir}
          disabled={pending || savedDir === dir}
          className={`w-full rounded-xl py-3 text-sm font-semibold transition-colors ${
            pending || savedDir === dir
              ? 'bg-zinc-200 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-600'
              : 'bg-violet-600 text-white'
          }`}
        >
          {savedDir === dir ? '이 방향으로 설정됨' : '이 방향으로 설정'}
        </button>

        <button
          type="button"
          onClick={makeActive}
          disabled={pending || isActive}
          className={`w-full rounded-xl border py-3 text-sm font-semibold transition-colors ${
            isActive
              ? 'border-zinc-200 text-zinc-400 dark:border-zinc-800 dark:text-zinc-600'
              : 'border-violet-300 text-violet-700 dark:border-violet-700/50 dark:text-violet-300'
          }`}
        >
          {isActive ? '대표 프로필 ✓' : '대표 프로필로 설정'}
        </button>

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
            프로필 삭제
          </button>
        )}
      </div>
    </div>
  );
}
