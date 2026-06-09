'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { useResourceToast } from '@/components/ResourceToast';
import { useDiamond } from '@/components/DiamondContext';
import { GUILD_CREATE_COST_DIAMOND, GUILD_NAME_MAX_LEN } from '@/lib/game/guild/balance';
import type { EmblemSelection } from '@/lib/game/guild/emblem-vocab';

import { createGuildAction } from '../actions';
import { EmblemPicker, DEFAULT_EMBLEM } from '../EmblemPicker';
import { guildErrMsg } from '../errors-msg';

export function CreateGuildForm() {
  const router = useRouter();
  const { showHeaderToast, showError } = useResourceToast();
  const { optimisticAdjust } = useDiamond();
  const [name, setName] = useState('');
  const [emblem, setEmblem] = useState<EmblemSelection>(DEFAULT_EMBLEM);
  const [pending, start] = useTransition();

  const create = () => {
    const nm = name.trim();
    if (!nm) return showError('길드 이름을 입력하세요.');
    start(async () => {
      const r = await createGuildAction(nm, emblem);
      if (r.status !== 'success') return showError(guildErrMsg(r.code));
      optimisticAdjust(BigInt(-GUILD_CREATE_COST_DIAMOND));
      showHeaderToast({ title: '길드 결성 완료' });
      router.replace('/guild');
    });
  };

  return (
    <div className="px-4 py-4">
      <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-sm font-bold">길드 결성</h1>
        <p className="mt-1 text-[11px] text-zinc-500">
          비용 {GUILD_CREATE_COST_DIAMOND.toLocaleString('ko-KR')}💎 · 이름은 변경 불가
        </p>

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={GUILD_NAME_MAX_LEN}
          placeholder="길드 이름 (2~10자)"
          className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-900"
        />

        <div className="mt-3">
          <p className="text-[11px] font-semibold text-zinc-500">문양 (결성 시 무료 생성)</p>
          <div className="mt-2">
            <EmblemPicker value={emblem} onChange={setEmblem} disabled={pending} />
          </div>
        </div>

        <button
          type="button"
          onClick={create}
          disabled={pending}
          className="mt-4 w-full rounded-lg bg-amber-600 py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          {pending ? '결성 중…' : '결성하기'}
        </button>
      </section>
    </div>
  );
}
