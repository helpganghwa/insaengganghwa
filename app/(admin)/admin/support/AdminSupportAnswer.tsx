'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { answerInquiryAction } from './actions';

/** 관리자 답변 입력 — 우편 + 앱 알림으로 발송. 보상(다이아·상자 3종) 첨부 가능(수령형 우편). */
export function AdminSupportAnswer({ inquiryId }: { inquiryId: string }) {
  const router = useRouter();
  const [answer, setAnswer] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [diamond, setDiamond] = useState('');
  const [weapon, setWeapon] = useState('');
  const [armor, setArmor] = useState('');
  const [accessory, setAccessory] = useState('');

  const n = (v: string) => Math.max(0, Math.floor(Number(v) || 0));
  const hasReward = n(diamond) + n(weapon) + n(armor) + n(accessory) > 0;

  const send = () => {
    if (answer.trim().length < 2 || pending) return;
    setErr(null);
    start(async () => {
      const r = await answerInquiryAction(
        inquiryId,
        answer,
        hasReward
          ? { diamond: n(diamond), boxes: { weapon: n(weapon), armor: n(armor), accessory: n(accessory) } }
          : undefined,
      );
      if (!r.ok) return setErr(r.msg ?? '실패했습니다.');
      router.refresh();
    });
  };

  return (
    <div className="mt-2">
      <textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        rows={3}
        placeholder="답변을 작성하세요 — 유저 우편함 + 앱 알림으로 발송됩니다."
        className="w-full resize-none rounded-lg border border-zinc-300 bg-white px-2.5 py-2 text-base outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900"
      />
      {/* 보상 첨부 — 입력 시 답변 우편이 수령형이 된다(다이아·상자 3종). */}
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12px]">
        <span className="text-zinc-400">보상 첨부(선택):</span>
        {(
          [
            ['💎', diamond, setDiamond],
            ['⚔️', weapon, setWeapon],
            ['🛡️', armor, setArmor],
            ['💍', accessory, setAccessory],
          ] as const
        ).map(([icon, v, set]) => (
          <label key={icon} className="flex items-center gap-1">
            <span>{icon}</span>
            <input
              inputMode="numeric"
              value={v}
              onChange={(e) => set(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="0"
              className="w-16 rounded-md border border-zinc-600 bg-zinc-900 px-1.5 py-1 text-right text-[12px] tabular-nums outline-none focus:border-zinc-400"
            />
          </label>
        ))}
      </div>
      {err ? <p className="mt-1 text-[11px] font-semibold text-red-500">{err}</p> : null}
      <button
        type="button"
        onClick={send}
        disabled={pending || answer.trim().length < 2}
        className="mt-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-[13px] font-bold text-white active:opacity-90 disabled:opacity-40"
      >
        {pending ? '발송 중…' : hasReward ? '답변 + 보상 보내기 (우편 + 알림)' : '답변 보내기 (우편 + 알림)'}
      </button>
    </div>
  );
}
