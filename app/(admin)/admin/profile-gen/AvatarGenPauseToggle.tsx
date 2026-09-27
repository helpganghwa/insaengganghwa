'use client';

import { useState, useTransition } from 'react';

import { setAvatarGenPauseAction } from './actions';

/** 아바타 생성 일시 중지 스위치 — 켜면 유저 생성 화면에 안내가 뜨고 새 요청이 막힌다(전파 최대 15초). */
export function AvatarGenPauseToggle({ paused, note }: { paused: boolean; note: string | null }) {
  const [text, setText] = useState(note ?? '');
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const run = (next: boolean) =>
    start(async () => {
      setErr(null);
      const r = await setAvatarGenPauseAction(next, text).catch(() => null);
      if (!r?.ok) setErr('전환하지 못했어요. 다시 시도해 주세요.');
    });
  return (
    <div
      className={`rounded-lg border p-3 text-sm ${
        paused ? 'border-amber-500/60 bg-amber-950/30' : 'border-zinc-700 bg-zinc-900'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <b>아바타 생성</b>{' '}
          <span className={paused ? 'text-amber-300' : 'text-emerald-400'}>{paused ? '일시 중지 중' : '정상'}</span>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(!paused)}
          className={`rounded-md px-3 py-1.5 text-xs font-bold ${
            paused ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-amber-950'
          } disabled:opacity-50`}
        >
          {pending ? '처리 중…' : paused ? '생성 다시 열기' : '생성 일시 중지'}
        </button>
      </div>
      <label className="mt-2 block text-xs text-zinc-400">
        유저 안내 문구(비우면 기본 문구)
        <input
          value={text}
          maxLength={200}
          onChange={(e) => setText(e.target.value)}
          placeholder="생성 서비스 점검으로 지금은 새 아바타를 만들 수 없어요. 다시 열리면 이 화면에서 바로 이용할 수 있어요."
          className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-100"
        />
      </label>
      <p className="mt-1 text-[11px] text-zinc-500">
        새 요청만 막아요. 이미 진행 중인 생성은 그대로 돌고, 실패하면 자동 환불돼요. 문구를 바꾸려면 중지 상태에서 한 번 더 저장하세요.
      </p>
      {paused ? (
        <button type="button" disabled={pending} onClick={() => run(true)} className="mt-2 rounded-md border border-zinc-600 px-2.5 py-1 text-xs">
          안내 문구만 저장
        </button>
      ) : null}
      {err ? <p className="mt-1 text-xs text-red-400">{err}</p> : null}
    </div>
  );
}
