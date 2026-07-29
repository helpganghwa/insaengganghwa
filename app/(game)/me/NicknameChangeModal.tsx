'use client';

import { useEffect, useState, useTransition } from 'react';
import { ModalShell } from '@/components/ModalShell';
import { ModalLayout, ModalButton } from '@/components/ModalLayout';
import { useRouter } from 'next/navigation';

import { NICKNAME_CHANGE_COST_DIAMOND } from '@/lib/game/balance';
import { NICKNAME_MAX_LEN, NICKNAME_MIN_LEN, nicknameLen, validateNickname } from '@/lib/game/nickname';
import { useResourceToast } from '@/components/ResourceToast';
import { ZoomSafeInput } from '@/components/ui/ZoomSafeField';

import { changeNicknameAction } from './actions';

/**
 * 닉네임 변경 팝업. 첫 변경 무료 / 이후 NICKNAME_CHANGE_COST_DIAMOND(=300) 차감.
 * 진입: 프로필 페이지의 닉네임(클릭) · 설정 페이지의 닉네임 row(클릭).
 */
export function NicknameChangeModal({
  open,
  onClose,
  currentNickname,
  changedCount,
  diamond,
}: {
  open: boolean;
  onClose: () => void;
  currentNickname: string;
  /** 이전 변경 횟수. 0이면 첫 변경 무료. */
  changedCount: number;
  /** 보유 다이아(bigint string). 비용 안내·검증용. */
  diamond: string;
}) {
  const router = useRouter();
  const { showHeaderToast } = useResourceToast();
  const [next, setNext] = useState(currentNickname);
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (open) {
      setNext(currentNickname);
      setErr(null);
    }
  }, [open, currentNickname]);

  if (!open) return null;
  const isFree = changedCount === 0;
  const cost = isFree ? 0 : NICKNAME_CHANGE_COST_DIAMOND;
  const canAfford = BigInt(diamond || '0') >= BigInt(cost);
  const unchanged = next.trim() === currentNickname.trim();
  const validation = validateNickname(next);
  const canSubmit = !pending && !unchanged && validation.ok && canAfford;
  const usedLen = nicknameLen(next.trim());

  const submit = () => {
    if (!canSubmit) return;
    startTransition(async () => {
      const r = await changeNicknameAction(next);
      if (r.status === 'error') {
        setErr(r.message);
        return;
      }
      onClose();
      showHeaderToast({ title: '닉네임 변경', detail: next.trim() });
      router.refresh();
    });
  };

  // body로 portal — 설정 Section의 isolate(stacking context) 밖으로 빼내 헤더/하단바(z-30) 위에 표시.
  return (
    <ModalShell onClose={onClose} onSubmit={() => canSubmit && submit()} label="닉네임 변경">
      <ModalLayout
        title="닉네임 변경"
        subtitle={
          isFree ? (
            <span className="font-bold text-emerald-600 dark:text-emerald-400">최초 변경 무료</span>
          ) : (
            <>
              <span className="font-mono font-bold text-sky-500">
                💎 {NICKNAME_CHANGE_COST_DIAMOND.toLocaleString('ko-KR')}
              </span>
              <span className="mx-1 text-zinc-400">·</span>보유{' '}
              <span className="tabular-nums">{Number(diamond).toLocaleString('ko-KR')}</span>
            </>
          )
        }
        footer={
          <>
            <ModalButton tone="ghost" onClick={onClose} disabled={pending}>
              취소
            </ModalButton>
            <ModalButton tone="contrast" onClick={submit} disabled={!canSubmit}>
              {pending ? '변경 중…' : isFree ? '변경(무료)' : `💎 ${NICKNAME_CHANGE_COST_DIAMOND.toLocaleString('ko-KR')} 변경`}
            </ModalButton>
          </>
        }
      >
      <div>

        {/* IME composition 중 자모 분리(ㄱ·ㅏ)를 onChange에서 strip하지 않음 — 한글 입력 보존. */}
        {/* 검증은 변경확인(submit) 시 validateNickname()이 수행. */}
        <ZoomSafeInput
          value={next}
          onChange={(e) => {
            setNext(e.target.value);
            setErr(null);
          }}
          // 자모 합성 여유로 약간 크게(10*2=20), 실제 한도는 validateNickname.
          maxLength={NICKNAME_MAX_LEN * 2}
          placeholder={`${NICKNAME_MIN_LEN}~${NICKNAME_MAX_LEN}자 (한글·영문·숫자)`}
          wrapClassName="mt-3 h-9 w-full"
          className="rounded-md border border-zinc-300 bg-transparent px-2.5 dark:border-zinc-700"
          autoFocus
        />
        <p className="mt-1 text-right text-[10px] text-zinc-500 tabular-nums">
          {usedLen} / {NICKNAME_MAX_LEN}자
        </p>

        {err ? (
          <p className="mt-2 rounded bg-red-50 px-2 py-1.5 text-[11px] text-red-700 dark:bg-red-950/60 dark:text-red-300">
            {err}
          </p>
        ) : !canAfford && !isFree ? (
          <p className="mt-2 rounded bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
            다이아가 부족합니다 (필요 {NICKNAME_CHANGE_COST_DIAMOND.toLocaleString('ko-KR')})
          </p>
        ) : null}

      </div>
      </ModalLayout>
    </ModalShell>
  );
}
