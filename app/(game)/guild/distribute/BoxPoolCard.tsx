'use client';

/**
 * 금고 상자(월드보스 전리품) 분배 카드 — docs/WORLD-BOSS.md §4. 상자가 쌓였을 때만 분배 탭 맨 위에 뜬다.
 * 부위 3종을 똑같이 주므로 사람마다 3의 배수. 똑같이 나누기 / 한 사람에게(남는 상자는 금고에 남는다).
 * UI/UX는 나중에 다시 다듬는다(2026-10-08) — 지금은 동작 우선.
 */
import { useState, useTransition } from 'react';

import { ModalButton, ModalLayout } from '@/components/ModalLayout';
import { ModalShell } from '@/components/ModalShell';
import { useResourceToast } from '@/components/ResourceToast';

import { distributeBoxesAction } from '../actions';
import { guildErrMsg } from '../errors-msg';
import type { DistributeMember } from './DistributeBoard';

export function BoxPoolCard({ boxes, members }: { boxes: number; members: DistributeMember[] }) {
  const { showHeaderToast, showError } = useResourceToast();
  const [pending, start] = useTransition();
  const [ask, setAsk] = useState<{ mode: 'equal' } | { mode: 'target'; userId: string; nickname: string } | null>(null);
  const [target, setTarget] = useState('');
  const n = members.length;
  const per = n > 0 ? Math.floor(boxes / (3 * n)) * 3 : 0;
  const all = Math.floor(boxes / 3) * 3;

  const run = () => {
    if (!ask) return;
    const a = ask;
    setAsk(null);
    start(async () => {
      const r = await distributeBoxesAction(a.mode, a.mode === 'target' ? a.userId : undefined).catch(() => null);
      if (!r) return showError('지금은 처리할 수 없어요. 잠시 후 다시 시도해 주세요.');
      if (r.status === 'error') return showError(guildErrMsg(r.code));
      showHeaderToast({ icon: '📦', title: '전리품을 나눴어요', detail: `📦${r.total.toLocaleString('ko-KR')} 우편으로 보냈어요` });
    });
  };

  return (
    <div className="mt-3 rounded-xl border border-sky-500/40 bg-sky-50/50 px-3 py-2.5 dark:border-sky-500/30 dark:bg-sky-500/[0.06]">
      <div className="flex items-baseline justify-between">
        <p className="text-[10px] font-bold tracking-wide text-zinc-400">금고 전리품 상자</p>
        <p className="text-xl font-extrabold tabular-nums text-sky-600 dark:text-sky-400">📦{boxes.toLocaleString('ko-KR')}</p>
      </div>
      <p className="mt-0.5 text-[10.5px] text-zinc-500">월드보스가 떠날 때 남긴 상자예요. 부위 3종을 똑같이 주므로 3개 단위로 나눠요.</p>
      <div className="mt-2 flex flex-col gap-1.5">
        <button
          type="button"
          disabled={pending || per <= 0}
          onClick={() => setAsk({ mode: 'equal' })}
          className="w-full rounded-lg bg-sky-600 py-2 text-[12.5px] font-bold text-white disabled:opacity-40"
        >
          {per > 0 ? `${n}명에게 똑같이 📦${per}씩` : `${n}명에게 나누기엔 상자가 부족해요`}
        </button>
        <div className="flex gap-1.5">
          <select
            id="box-target"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-[12px] dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">한 사람에게 모두…</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.nickname}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={pending || !target || all <= 0}
            onClick={() => {
              const m = members.find((x) => x.userId === target);
              if (m) setAsk({ mode: 'target', userId: m.userId, nickname: m.nickname });
            }}
            className="shrink-0 rounded-lg border border-sky-500/60 px-3 text-[12px] font-bold text-sky-700 disabled:opacity-40 dark:text-sky-300"
          >
            📦{all} 주기
          </button>
        </div>
      </div>

      {ask && (
        <ModalShell onClose={() => setAsk(null)} onSubmit={run} label="전리품 분배 확인">
          <ModalLayout
            title="전리품을 나눌까요?"
            footer={
              <>
                <ModalButton onClick={() => setAsk(null)}>취소</ModalButton>
                <ModalButton tone="info" grow={2} onClick={run} disabled={pending}>
                  나누기
                </ModalButton>
              </>
            }
          >
            <p className="text-[12.5px] leading-relaxed text-zinc-600 dark:text-zinc-300">
              {ask.mode === 'equal'
                ? `길드원 ${n}명에게 📦${per}씩(부위별 ${per / 3}개), 모두 📦${per * n}을 우편으로 보내요.`
                : `${ask.nickname}님에게 📦${all}(부위별 ${all / 3}개)을 우편으로 보내요.`}{' '}
              남는 상자는 금고에 남아요. 되돌릴 수 없어요.
            </p>
          </ModalLayout>
        </ModalShell>
      )}
    </div>
  );
}
