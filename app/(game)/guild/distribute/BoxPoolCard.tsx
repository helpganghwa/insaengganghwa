'use client';

/**
 * 금고 상자(월드보스 전리품) 분배 — docs/WORLD-BOSS.md §4. 상자가 쌓였을 때만 분배 탭 위에 **한 줄**로 뜬다(리뷰 10-08:
 * 큰 카드가 다이아 분배 흐름을 끊었다). 누르면 팝업에서 방식을 고른다. 부위 3종을 똑같이 주므로 사람마다 3의 배수.
 *  - 똑같이: 길드원 모두 같은 수(상자가 길드원 수 × 3 이상일 때)
 *  - 기여 순 3개씩: 기여 높은 순으로 3개씩, 상자가 떨어질 때까지(상자가 적을 때)
 *  - 한 사람에게: 고른 길드원에게 모두
 */
import { useState, useTransition } from 'react';

import { ModalButton, ModalLayout } from '@/components/ModalLayout';
import { ModalShell } from '@/components/ModalShell';
import { useResourceToast } from '@/components/ResourceToast';

import { distributeBoxesAction } from '../actions';
import { guildErrMsg } from '../errors-msg';
import type { DistributeMember } from './DistributeBoard';

type Mode = 'equal' | 'top' | 'target';

export function BoxPoolCard({ boxes, members }: { boxes: number; members: DistributeMember[] }) {
  const { showHeaderToast, showError } = useResourceToast();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const n = members.length;
  const per = n > 0 ? Math.floor(boxes / (3 * n)) * 3 : 0;
  const k = Math.min(n, Math.floor(boxes / 3));
  const all = Math.floor(boxes / 3) * 3;
  const [mode, setMode] = useState<Mode>(per > 0 ? 'equal' : 'top');
  const [target, setTarget] = useState(members[0]?.userId ?? '');

  const options: { m: Mode; label: string; desc: string; ok: boolean }[] = [
    { m: 'equal', label: '모두에게 똑같이', desc: per > 0 ? `${n}명에게 📦${per}씩 · 남는 📦${boxes - per * n}은 금고에` : `${n}명에게 3개씩 주려면 📦${n * 3}이 필요해요`, ok: per > 0 },
    { m: 'top', label: '기여 순으로 3개씩', desc: k > 0 ? `기여 높은 ${k}명에게 📦3씩${k < n ? ` · 나머지 ${n - k}명은 다음에` : ''}` : '상자가 3개보다 적어요', ok: k > 0 },
    { m: 'target', label: '한 사람에게', desc: all > 0 ? `고른 길드원에게 📦${all}` : '상자가 3개보다 적어요', ok: all > 0 },
  ];
  const cur = options.find((o) => o.m === mode)!;

  const run = () => {
    if (!cur.ok) return;
    setOpen(false);
    start(async () => {
      const r = await distributeBoxesAction(mode, mode === 'target' ? target : undefined).catch(() => null);
      if (!r) return showError('지금은 처리할 수 없어요. 잠시 후 다시 시도해 주세요.');
      if (r.status === 'error') return showError(guildErrMsg(r.code));
      showHeaderToast({ icon: '📦', title: '전리품을 나눴어요', detail: `${r.recipients}명에게 📦${r.total.toLocaleString('ko-KR')} 우편으로 보냈어요` });
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={pending}
        className="mt-3 flex w-full items-center gap-2 rounded-xl border border-sky-500/40 bg-sky-50/50 px-3 py-2 text-left disabled:opacity-50 dark:border-sky-500/30 dark:bg-sky-500/[0.06]"
      >
        <span className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400">금고 전리품 상자</span>
        <span className="font-extrabold tabular-nums text-sky-600 dark:text-sky-400">📦{boxes.toLocaleString('ko-KR')}</span>
        <span className="ml-auto rounded-lg bg-sky-600 px-2.5 py-1 text-[11.5px] font-bold text-white">나누기</span>
      </button>

      {open && (
        <ModalShell onClose={() => setOpen(false)} onSubmit={run} label="전리품 상자 나누기">
          <ModalLayout
            title="전리품 상자 나누기"
            subtitle={`금고 📦${boxes.toLocaleString('ko-KR')} · 부위 3종을 똑같이 주므로 3개 단위`}
            footer={
              <>
                <ModalButton onClick={() => setOpen(false)}>취소</ModalButton>
                <ModalButton tone="info" grow={2} onClick={run} disabled={pending || !cur.ok || (mode === 'target' && !target)}>
                  나누기
                </ModalButton>
              </>
            }
          >
            <div className="flex flex-col gap-1.5">
              {options.map((o) => (
                <label
                  key={o.m}
                  className={`flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-2 ${
                    mode === o.m ? 'border-sky-500 bg-sky-50 dark:bg-sky-500/10' : 'border-zinc-200 dark:border-zinc-700'
                  } ${o.ok ? '' : 'opacity-45'}`}
                >
                  <input
                    id={`box-mode-${o.m}`}
                    type="radio"
                    name="box-mode"
                    className="mt-1"
                    checked={mode === o.m}
                    disabled={!o.ok}
                    onChange={() => setMode(o.m)}
                  />
                  <span className="min-w-0">
                    <b className="block text-[13px]">{o.label}</b>
                    <span className="block text-[11.5px] text-zinc-500">{o.desc}</span>
                  </span>
                </label>
              ))}
              {mode === 'target' && (
                <select
                  id="box-target"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  className="mt-1 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-[12.5px] dark:border-zinc-700 dark:bg-zinc-900"
                >
                  {members.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.nickname}
                    </option>
                  ))}
                </select>
              )}
              <p className="mt-1 text-[11px] text-zinc-500">우편으로 보내고 되돌릴 수 없어요.</p>
            </div>
          </ModalLayout>
        </ModalShell>
      )}
    </>
  );
}
