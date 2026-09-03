'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { rerunMeleeBattleAction } from './melee-actions';

/**
 * 배틀 다시 돌리기(2026-09-03) — 발표 전(computed) 오늘 배틀 카드에만 뜬다. 우승자·순위·보상이 바뀌는
 * 운영 개입이라 2단계 확인. 성공하면 refresh로 새 포디움·헤드라인(에디터 key가 생성 시각이라 리마운트)이 내려온다.
 */
export function MeleeRerunButton({ serverId, battleDate }: { serverId: number; battleDate: string }) {
  const router = useRouter();
  const [ask, setAsk] = useState(false);
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const run = () => {
    setAsk(false);
    setFlash(null);
    start(async () => {
      const r = await rerunMeleeBattleAction({ serverId, battleDate });
      if (r.status === 'success') {
        setFlash({ ok: true, text: `다시 돌림 — 참가 ${r.data.participants.toLocaleString('ko-KR')}명 · 헤드라인 후보 ${r.data.headlineCandidates}건` });
        router.refresh();
      } else setFlash({ ok: false, text: r.message });
    });
  };

  return (
    <span className="ml-auto flex flex-wrap items-center justify-end gap-2">
      {flash ? <span className={`text-[11px] font-bold ${flash.ok ? 'text-emerald-400' : 'text-red-400'}`}>{flash.text}</span> : null}
      {ask ? (
        <>
          <span className="text-[11px] text-red-300">우승자·순위·보상이 바뀝니다. 참가자·전투력은 지금 시점으로 다시 집계되고 헤드라인도 새로 만듭니다.</span>
          <button type="button" onClick={run} disabled={pending} className="rounded-lg bg-red-600 px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-40">
            다시 돌리기 실행
          </button>
          <button type="button" onClick={() => setAsk(false)} disabled={pending} className="rounded-lg border border-zinc-700 px-3 py-1.5 text-[12px] font-bold text-zinc-300">
            취소
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setAsk(true)}
          disabled={pending}
          className="rounded-lg border border-red-500/50 px-3 py-1.5 text-[12px] font-bold text-red-400 disabled:opacity-40"
        >
          {pending ? '다시 돌리는 중…' : '배틀 다시 돌리기'}
        </button>
      )}
    </span>
  );
}
