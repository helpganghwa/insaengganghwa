'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { hideProfile, unhideProfile, dismissReports } from './actions';

export function AdminReportActions({
  profileId,
  hidden,
}: {
  profileId: string;
  hidden: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const run = (fn: (id: string) => Promise<void>, confirmMsg?: string) => {
    if (confirmMsg && !window.confirm(confirmMsg)) return; // 파괴적 액션은 오탭 방지 확인
    startTransition(async () => {
      await fn(profileId);
      router.refresh();
    });
  };

  return (
    <div className="mt-2 flex gap-2">
      {hidden ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => run(unhideProfile)}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium dark:border-zinc-700"
        >
          복원
        </button>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() => run(hideProfile, '이 프로필을 비공개 처리할까요? (복원 가능)')}
          className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white"
        >
          비공개
        </button>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          run(dismissReports, '신고를 기각하고 이 프로필의 신고 기록을 모두 삭제합니다. 되돌릴 수 없습니다. 계속할까요?')
        }
        className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium dark:border-zinc-700"
      >
        기각
      </button>
    </div>
  );
}
