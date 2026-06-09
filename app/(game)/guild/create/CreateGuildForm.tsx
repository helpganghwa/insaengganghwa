'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { useResourceToast } from '@/components/ResourceToast';
import { useDiamond } from '@/components/DiamondContext';
import { GUILD_CREATE_COST_DIAMOND, GUILD_NAME_MAX_LEN } from '@/lib/game/guild/balance';
import type { EmblemSelection } from '@/lib/game/guild/emblem-vocab';

import { createGuildAction } from '../actions';
import { EmblemPicker, DEFAULT_EMBLEM } from '../EmblemPicker';
import { guildErrMsg } from '../errors-msg';

const CONFIRM_SECONDS = 3;
const COST = GUILD_CREATE_COST_DIAMOND.toLocaleString('ko-KR');

export function CreateGuildForm() {
  const router = useRouter();
  const { showHeaderToast, showError } = useResourceToast();
  const { optimisticAdjust } = useDiamond();
  const [name, setName] = useState('');
  const [emblem, setEmblem] = useState<EmblemSelection>(DEFAULT_EMBLEM);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [countdown, setCountdown] = useState(CONFIRM_SECONDS);
  const [pending, start] = useTransition();

  // 컨펌 오버레이 — 3초 카운트다운 후 확정 가능(고가 비가역 지출 오클릭 방지).
  useEffect(() => {
    if (!confirmOpen) return;
    const iv = setInterval(() => setCountdown((n) => (n <= 1 ? 0 : n - 1)), 1000);
    return () => clearInterval(iv);
  }, [confirmOpen]);

  const openConfirm = () => {
    if (!name.trim()) return showError('길드 이름을 입력하세요.');
    setCountdown(CONFIRM_SECONDS);
    setConfirmOpen(true);
  };

  const create = () => {
    start(async () => {
      const r = await createGuildAction(name.trim(), emblem);
      if (r.status !== 'success') {
        setConfirmOpen(false);
        return showError(guildErrMsg(r.code));
      }
      optimisticAdjust(BigInt(-GUILD_CREATE_COST_DIAMOND));
      showHeaderToast({ title: '길드 생성 완료' });
      router.replace('/guild');
    });
  };

  return (
    <div className="space-y-3 px-4 py-4">
      <h1 className="text-base font-bold">길드 생성</h1>

      {/* 길드 이름 */}
      <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-bold">길드 이름</span>
          <span className="text-[10px] text-zinc-400">2~10자 · 변경 불가</span>
        </div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={GUILD_NAME_MAX_LEN}
          placeholder="길드 이름을 입력하세요"
          className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-900"
        />
      </section>

      {/* 길드 문양 */}
      <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <span className="text-sm font-bold">길드 문양</span>
        <div className="mt-3">
          <EmblemPicker value={emblem} onChange={setEmblem} disabled={pending} />
        </div>
      </section>

      {/* 비용 표시 버튼 */}
      <button
        type="button"
        onClick={openConfirm}
        disabled={pending}
        className="w-full rounded-xl bg-amber-600 py-3 text-sm font-bold text-white disabled:opacity-50"
      >
        {COST}💎 · 길드 생성
      </button>

      {/* 3초 컨펌 오버레이 */}
      {confirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
          onClick={() => !pending && setConfirmOpen(false)}
        >
          <div
            className="w-full max-w-[320px] rounded-2xl bg-white p-5 text-center dark:bg-zinc-950"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-sm font-bold">길드를 생성할까요?</h2>
            <p className="mt-1 text-[12px] text-zinc-500">
              <span className="font-bold text-amber-600 dark:text-amber-400">{COST}💎</span>가
              차감됩니다. 이름은 이후 변경할 수 없습니다.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={pending}
                className="flex-1 rounded-lg border border-zinc-300 py-2.5 text-sm font-semibold text-zinc-600 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-400"
              >
                취소
              </button>
              <button
                type="button"
                onClick={create}
                disabled={pending || countdown > 0}
                className="flex-1 rounded-lg bg-amber-600 py-2.5 text-sm font-bold text-white disabled:opacity-60"
              >
                {pending ? '생성 중…' : countdown > 0 ? `${countdown}초` : '생성'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
