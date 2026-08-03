'use client';

import { useEffect, useState } from 'react';

import { ModalShell } from '@/components/ModalShell';
import { ModalLayout, ModalButton } from '@/components/ModalLayout';

/**
 * 오픈일 변경 안내(2026-08-03) — CBT 종료 화면에 한 번만 뜨는 팝업.
 *
 * 종료 화면 본문은 날짜만 8/24로 고쳤기 때문에, 8/10으로 안내받았던 사람이 변경 자체를
 * 모르고 지나칠 수 있다. 그 한 번을 이 팝업이 맡는다. 닫으면 로컬에 표시해 다시 뜨지 않는다
 * (기기별 1회 — 로그아웃 화면이라 서버에 남길 식별자가 없다).
 *
 * 사유는 결제 심사 지연으로 밝히고, 심사가 더 늦어져도 상점만 닫고 오픈한다는 약속을 함께 둔다
 * (PAYMENTS_OPEN 미설정 = 상점 숨김. 세 번째 연기 우려를 미리 지운다).
 */
const SEEN_KEY = 'ig:open-date-change-2026-08-24';

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
        title="오픈일이 8월 24일로 미뤄졌습니다"
        maxBodyClass="max-h-[52vh] overflow-y-auto"
        footer={
          <ModalButton tone="primary" grow={2} onClick={close}>
            알겠어요
          </ModalButton>
        }
      >
        <div className="space-y-3 text-left text-[13px] leading-[1.85] text-zinc-300">
          <p className="break-keep">안녕하세요, 인생강화입니다.</p>
          <p className="break-keep">
            8월 10일로 안내드렸던 정식 오픈이{' '}
            <b className="font-bold text-amber-300">8월 24일 오전 11시</b>로 미뤄졌습니다. 결제
            심사가 예정보다 길어지고 있어 부득이하게 일정을 조정하게 되었습니다. 먼저 말씀드린
            날짜를 지키지 못해 죄송합니다.
          </p>
          <p className="break-keep">
            심사가 그때까지 마무리되지 않더라도{' '}
            <b className="font-bold text-zinc-200">8월 24일에는 상점만 닫은 채 문을 열겠습니다.</b>{' '}
            더 미루는 일은 없습니다. 게임은 그대로 즐기실 수 있고, 상점은 준비되는 대로 바로
            열어드리겠습니다.
          </p>
          <p className="break-keep">
            비공개 테스트에 함께해 주신 분들의{' '}
            <b className="font-bold text-zinc-200">이월 보상은 그대로 기다리고 있습니다.</b> 오픈일에
            접속하시면 바로 받으실 수 있습니다.
          </p>
          <p className="break-keep text-zinc-400">기다려 주셔서 고맙습니다.</p>
        </div>
      </ModalLayout>
    </ModalShell>
  );
}
