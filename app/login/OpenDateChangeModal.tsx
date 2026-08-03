'use client';

import { useEffect, useState } from 'react';

import { ModalShell } from '@/components/ModalShell';
import { ModalLayout, ModalButton } from '@/components/ModalLayout';

/**
 * 오픈일 변경 안내(2026-08-03) — CBT 종료 화면에 한 번만 뜨는 팝업.
 *
 * 종료 화면 본문은 날짜만 8/17로 고쳤기 때문에, 8/10으로 안내받았던 사람이 변경 자체를
 * 모르고 지나칠 수 있다. 그 한 번을 이 팝업이 맡는다. 닫으면 로컬에 표시해 다시 뜨지 않는다
 * (기기별 1회 — 로그아웃 화면이라 서버에 남길 식별자가 없다).
 *
 * 사유는 결제 심사 지연으로 밝히고, 심사가 더 늦어져도 상점만 닫고 오픈한다는 약속을 함께 둔다
 * (PAYMENTS_OPEN 미설정 = 상점 숨김. 세 번째 연기 우려를 미리 지운다).
 */
const SEEN_KEY = 'ig:open-date-change-2026-08-17';

export function OpenDateChangeModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(SEEN_KEY)) setOpen(true);
    } catch {
      // 저장소 불가(사파리 프라이빗 등) — 매번 뜨는 편이 안 뜨는 것보다 낫다.
      setOpen(true);
    }
  }, []);

  const close = () => {
    setOpen(false);
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      // 저장 실패는 무시 — 다음 방문에 한 번 더 뜰 뿐이다.
    }
  };

  if (!open) return null;

  return (
    <ModalShell
      onClose={close}
      onSubmit={close}
      label="오픈일 변경 안내"
      className="w-[320px] max-w-[calc(100vw-32px)]"
    >
      <ModalLayout
        title="오픈일이 8월 17일로 미뤄졌습니다"
        footer={
          <ModalButton tone="primary" grow={2} onClick={close}>
            알겠어요
          </ModalButton>
        }
      >
        <div className="space-y-3 text-[13px] leading-[1.8] text-zinc-300">
          <p className="break-keep">
            정식 오픈을 8월 10일로 안내드렸지만, 결제 심사가 예정보다 길어지고 있습니다. 오픈일을{' '}
            <b className="font-bold text-amber-300">8월 17일 오전 11시</b>로 미룹니다. 기다리게 해서
            죄송합니다.
          </p>
          <p className="break-keep">
            심사가 그날까지 끝나지 않으면{' '}
            <b className="font-bold text-zinc-200">상점을 닫은 채로 문을 엽니다.</b> 더는 미루지
            않겠습니다.
          </p>
          <p className="break-keep text-zinc-400">
            게임은 그대로 즐기실 수 있고, 상점은 준비되는 대로 바로 열겠습니다.
          </p>
        </div>
      </ModalLayout>
    </ModalShell>
  );
}
