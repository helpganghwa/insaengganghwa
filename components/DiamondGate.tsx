'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';

import { ModalShell } from '@/components/ModalShell';
import { ModalLayout, ModalButton } from '@/components/ModalLayout';
import { useDiamondActions, useDiamondValue } from '@/components/DiamondContext';

/**
 * 다이아 부족 → 충전 유도 팝업(2026-08-22 결제 유도 개편, 소비 지점 11곳 공용).
 *
 * 종전엔 부족 시 버튼 disabled(막다른 길) 또는 실패 토스트로 끝나 상점 연결이 0곳이었다.
 * 이제 버튼은 항상 활성(비용 표기 유지)이고, 클릭 시 부족이면 이 팝업이 필요·보유·부족을
 * 보여주고 충전 화면으로 잇는다. **사전 체크는 UX용** — 최종 판정은 지금처럼 서버
 * (walletTrySpend 조건부 UPDATE)가 하며, 레이스로 서버가 거절한 경우도 같은 팝업을 재사용.
 */
export function DiamondShortfallModal({
  need,
  stacked = false,
  onClose,
  onCharge,
}: {
  /** 필요 다이아 — null이면 수치 없는 일반 안내(자동 강화 시작 등 필요액이 가변인 곳). */
  need: bigint | null;
  /** 다른 팝업 위에 뜰 때(닉변·아바타 확인 팝업 등) — ModalShell stacked 위임. */
  stacked?: boolean;
  onClose: () => void;
  /** 기본은 /shop?tab=charge 라우팅. 상점 내부처럼 탭 전환으로 처리할 곳만 override. */
  onCharge?: () => void;
}) {
  const router = useRouter();
  // 값 구독은 이 팝업 리프에서만 — 호스트 컴포넌트는 리렌더되지 않는다(렌더 감사 방침).
  const have = useDiamondValue();
  const lack = need !== null && need > have ? need - have : 0n;
  const fmt = (v: bigint) => Number(v).toLocaleString('ko-KR');
  return (
    // 불투명 패널 필수 — stacked 배경(bg-black/25)이 옅어 패널이 없으면 아래 모달 텍스트와
    // 겹쳐 보인다(2026-08-22 스크린샷 제보). 제목·버튼까지 패널 안에 담고 내부 카드는 bare로.
    <ModalShell
      onClose={onClose}
      label="다이아 부족 안내"
      stacked={stacked}
      className="w-full max-w-[300px] rounded-2xl border border-zinc-700/70 bg-zinc-950 p-4 shadow-2xl"
    >
      <ModalLayout
        bare
        icon={<span className="text-3xl">💎</span>}
        title="다이아가 부족합니다"
        subtitle={
          need !== null ? (
            <span>
              필요 {fmt(need)} · 보유 {fmt(have)}
              {lack > 0n && <b className="ml-1 text-amber-300">({fmt(lack)} 부족)</b>}
            </span>
          ) : (
            <span>보유 {fmt(have)}</span>
          )
        }
        footer={
          <>
            <ModalButton tone="ghost" onClick={onClose}>
              닫기
            </ModalButton>
            <ModalButton
              tone="primary"
              grow={2}
              onClick={() => {
                onClose();
                if (onCharge) onCharge();
                else router.push('/shop?tab=charge');
              }}
            >
              충전하러 가기
            </ModalButton>
          </>
        }
      >
        <p className="text-center text-[12.5px] leading-relaxed text-zinc-300">
          지금 충전하러 가시겠습니까?
        </p>
      </ModalLayout>
    </ModalShell>
  );
}

/**
 * 소비 지점용 게이트 훅 — 적용은 세 줄로 수렴:
 *   const gate = useDiamondGate();            // 잔액 구독 없음(get 참조만) — 리렌더 0
 *   if (!gate.ensure(cost)) return;           // 클릭/무장 시점 사전 체크 → 부족이면 팝업
 *   {gate.modal}                              // JSX에 동봉
 * 서버가 INSUFFICIENT를 반환한 레이스에는 gate.open(cost)로 같은 팝업을 띄운다.
 */
export function useDiamondGate(opts?: { stacked?: boolean; onCharge?: () => void }): {
  /** 충분하면 true. 부족하면 팝업을 열고 false. 잔액 미주입(초기 로드 창)이면 true —
      0 오탐으로 충분한 유저에게 부족 팝업을 띄우지 않는다(서버가 최종 판정, 적대 검수). */
  ensure: (cost: bigint | number) => boolean;
  /** 사전 체크 없이 팝업만(서버 거절 응답·가변 비용 안내). cost 생략 시 수치 없는 안내.
      두 번째 인자로 stacked를 호출 단위 override — 호스트 팝업이 이미 닫힌 레이스 경로 등. */
  open: (cost?: bigint | number, o?: { stacked?: boolean }) => void;
  modal: ReactNode;
} {
  const [st, setSt] = useState<{ need: bigint | null; stacked: boolean } | null>(null);
  const { get } = useDiamondActions();
  const toBig = (cost: bigint | number) =>
    typeof cost === 'bigint' ? cost : BigInt(Math.max(0, Math.ceil(cost)));
  const ensure = (cost: bigint | number): boolean => {
    const cur = get();
    const c = toBig(cost);
    if (cur === null || cur >= c) return true;
    setSt({ need: c, stacked: opts?.stacked ?? false });
    return false;
  };
  const open = (cost?: bigint | number, o?: { stacked?: boolean }) =>
    setSt({ need: cost === undefined ? null : toBig(cost), stacked: o?.stacked ?? opts?.stacked ?? false });
  const modal = st ? (
    <DiamondShortfallModal need={st.need} stacked={st.stacked} onCharge={opts?.onCharge} onClose={() => setSt(null)} />
  ) : null;
  return { ensure, open, modal };
}
