'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { useResourceToast } from '@/components/ResourceToast';
import { useDiamond } from '@/components/DiamondContext';
import {
  GUILD_CREATE_COST_DIAMOND,
  GUILD_NAME_MAX_LEN,
  GUILD_NAME_MIN_LEN,
} from '@/lib/game/guild/balance';
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
  const [confirm, setConfirm] = useState(false);
  const [confirmLeft, setConfirmLeft] = useState(0);
  const [pending, start] = useTransition();
  const composing = useRef(false); // 한글 IME 조합 중 여부 — 조합 중엔 자모 필터링 스킵.

  // 인-버튼 컨펌 — 강화/아바타 생성과 동일 3초 재탭 컨펌(오탭 보호). 만료 시 자동 해제.
  useEffect(() => {
    if (!confirm) return;
    const id = setInterval(() => {
      setConfirmLeft((s) => {
        if (s <= 1) {
          setConfirm(false);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [confirm]);

  const onClick = () => {
    if (pending) return;
    if (!name.trim()) return showError('길드 이름을 입력하세요.');
    if (!confirm) {
      setConfirmLeft(CONFIRM_SECONDS);
      setConfirm(true);
      return;
    }
    setConfirm(false);
    optimisticAdjust(BigInt(-GUILD_CREATE_COST_DIAMOND)); // 낙관 차감(실패 시 롤백)
    start(async () => {
      const r = await createGuildAction(name.trim(), emblem);
      if (r.status !== 'success') {
        optimisticAdjust(BigInt(GUILD_CREATE_COST_DIAMOND));
        return showError(guildErrMsg(r.code));
      }
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
          <span className="text-[10px] text-zinc-400">
            {GUILD_NAME_MIN_LEN}~{GUILD_NAME_MAX_LEN}자 · 변경 불가
          </span>
        </div>
        <input
          value={name}
          // 한글·영문·숫자만. ⚠ IME 조합 중엔 자모(ㄱ,ㅏ…)가 완성형이 아니라 필터하면 한글이 깨짐 →
          // 조합 중엔 원본 유지, compositionEnd·비조합 입력에서만 정제(서버도 동일 검증).
          onChange={(e) => {
            const v = e.target.value;
            setName(composing.current ? v : v.replace(/[^A-Za-z0-9가-힣]/g, ''));
          }}
          onCompositionStart={() => {
            composing.current = true;
          }}
          onCompositionEnd={(e) => {
            composing.current = false;
            setName((e.target as HTMLInputElement).value.replace(/[^A-Za-z0-9가-힣]/g, ''));
          }}
          maxLength={GUILD_NAME_MAX_LEN}
          placeholder="한글·영문·숫자 (공백·특수문자 불가)"
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

      {/* 생성 버튼 — 인-버튼 3초 재탭 컨펌(강화/아바타 패턴) */}
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className={`relative w-full isolate overflow-hidden rounded-xl py-3.5 text-sm font-bold transition-colors disabled:opacity-50 ${
          confirm ? 'bg-amber-700 text-white' : 'bg-amber-600 text-white'
        }`}
      >
        {confirm ? (
          <span
            aria-hidden
            className="absolute inset-0 bg-amber-500"
            style={{ animation: 'confirm-bg-pulse 1.2s ease-in-out infinite' }}
          />
        ) : null}
        <span className="relative">
          {pending
            ? '생성 중…'
            : confirm
              ? `한 번 더 누르면 ${COST}💎 차감 (${confirmLeft}s)`
              : `${COST}💎 · 길드 생성`}
        </span>
      </button>
    </div>
  );
}
