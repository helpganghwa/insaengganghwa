'use client';

import { useEffect, useState } from 'react';

import { ModalShell } from '@/components/ModalShell';
import { ModalLayout } from '@/components/ModalLayout';
import { ZoomSafeInput } from '@/components/ui/ZoomSafeField';
import { transcendStyle } from '@/lib/game/equipment/transcend';

export type AutoConfig = {
  budget: number;
  target: number | null;
  count: number | null;
  down: boolean;
};

/**
 * 자동 강화 설정 모달(2026-08-07 렌더 감사에서 분리) — 이전엔 EnhanceSlotCard 트리 안에 있어
 * ① 카드의 1초 게이지 클럭마다 모달 전체(입력 3+체크 3+버튼 6)가 함께 재조정되고
 * ② 입력 한 글자마다 카드 최상단 state 갱신으로 스프라이트·게이지까지 전부 리렌더됐다
 * (ModalShell 주석의 "강화 카드 1초 타이머 리렌더" 포커스 사고와 같은 경로).
 * 입력 state 6개를 이 컴포넌트가 소유 — 부모는 원시 props + 콜백 2개만.
 * 항상 마운트(open=false면 null 반환)라 입력값이 열고 닫아도 유지되는 기존 동작 동일,
 * 단 열 때 예산·목표는 기존 로직대로 기본값으로 재설정된다.
 */
export function AutoSettingsModal({
  open,
  name,
  fromLevel,
  transcendLevel,
  diamond,
  onClose,
  onStart,
}: {
  open: boolean;
  name: string;
  fromLevel: number;
  transcendLevel: number;
  /** 보유 다이아(문자열 bigint) — 예산 캡·'최대' 버튼용. */
  diamond: string;
  onClose: () => void;
  /** 시작 요청 — 검증·실행·모달 닫기는 부모(startAuto)가 담당(실패 시 모달 유지). */
  onStart: (cfg: AutoConfig) => void;
}) {
  const [budget, setBudget] = useState('5000');
  const [useTarget, setUseTarget] = useState(true);
  const [target, setTarget] = useState('');
  const [useCount, setUseCount] = useState(false);
  const [count, setCount] = useState('50');
  const [down, setDown] = useState(false);

  // 열릴 때 기본값 재설정 — 종전 ⚙️자동 버튼 onClick에서 하던 것과 동일 로직.
  useEffect(() => {
    if (!open) return;
    setTarget(String(fromLevel + 10));
    setBudget(String(Math.min(5000, Number(diamond) || 0))); // 기본 예산 = min(5000, 보유)
    // 열리는 순간의 스냅샷만 반영 — diamond/fromLevel 변동에 재설정하지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const bal = Number(diamond) || 0;
  const submit = () =>
    onStart({
      budget: parseInt(budget, 10) || 0,
      target: useTarget ? parseInt(target, 10) || null : null,
      count: useCount ? parseInt(count, 10) || null : null,
      down,
    });
  // 목표 레벨/횟수 ± 조정(스텝 1) — 목표는 현재 강화수치 초과로, 횟수는 1 이상으로 클램프.
  const bumpTarget = (delta: number) => {
    const minLv = fromLevel + 1;
    const cur = parseInt(target, 10) || minLv;
    setTarget(String(Math.max(minLv, cur + delta)));
  };
  const bumpCount = (delta: number) => {
    const cur = parseInt(count, 10) || 1;
    setCount(String(Math.max(1, cur + delta)));
  };

  return (
    <ModalShell onClose={onClose} onSubmit={submit} label="자동 강화 설정">
      <ModalLayout
        title="자동 강화 설정"
        subtitle={
          <>
            <span className="font-bold text-zinc-600 dark:text-zinc-300">{name}</span>{' '}
            <span className="font-bold text-amber-500">+{fromLevel}</span>
            {transcendLevel > 0 ? (
              <>
                <span className="mx-1 text-zinc-400">·</span>
                <span
                  className="font-bold"
                  style={{ color: `rgb(${transcendStyle(transcendLevel).colorRgb.join(',')})` }}
                >
                  ✦{transcendLevel}
                </span>
              </>
            ) : null}
            <br />
            💎로 시간을 단축하며 자동 반복 · 예산 소진이나 조건 달성 시 정지
          </>
        }
        maxBodyClass="max-h-[58vh]"
        footer={
          <>
            <button
              type="button"
              onClick={onClose}
              style={{ flex: 1 }}
              className="rounded-xl border border-zinc-300 py-2.5 text-[13px] font-bold text-zinc-500 dark:border-zinc-700 dark:text-zinc-400"
            >
              취소
            </button>
            <button
              type="button"
              onClick={submit}
              style={{ flex: 2 }}
              className="rounded-xl bg-amber-500 py-2.5 text-[13px] font-extrabold text-black active:scale-[0.98]"
            >
              자동 시작
            </button>
          </>
        }
      >
        {/* 예산 — 필수(체크박스 없음). 라벨 정렬용 체크박스폭 스페이서. 값은 입력창 직접 입력 +
            오른쪽 '최대' 버튼(보유 전액). ± 버튼은 목표/횟수 항목에만(사용자 피드백 2). */}
        <div className="flex items-center gap-2 py-2.5">
          <span aria-hidden className="h-4 w-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-semibold text-zinc-200">다이아 예산</div>
            <div className="text-[10px] text-zinc-500">
              소진 시 정지 · 보유 {bal.toLocaleString()}💎
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <ZoomSafeInput
              wrapClassName="h-8 w-[72px]"
              value={budget}
              onChange={(e) => {
                const v = e.target.value.replace(/[^0-9]/g, '');
                setBudget(v === '' ? '' : String(Math.min(parseInt(v, 10), bal))); // 보유 초과 입력 즉시 캡
              }}
              inputMode="numeric"
              className="w-full rounded-md border border-zinc-700 bg-black/40 px-2 text-right font-mono text-zinc-100"
            />
            <button
              type="button"
              onClick={() => setBudget(String(bal))}
              className="flex h-8 shrink-0 items-center justify-center rounded-md border border-zinc-700 bg-black/40 px-2 text-[10px] font-bold text-zinc-300 active:scale-95"
            >
              최대
            </button>
          </div>
        </div>
        {/* 목표 레벨 — 선택. 체크박스 토글은 라벨(체크박스+텍스트)까지만, 오른쪽 입력/±은 제외. */}
        <div className="flex items-center gap-2 border-t border-zinc-800 py-2.5">
          <label className="flex min-w-0 flex-1 items-center gap-2">
            <input type="checkbox" checked={useTarget} onChange={(e) => setUseTarget(e.target.checked)} className="h-4 w-4 shrink-0 accent-amber-500" />
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-semibold text-zinc-200">목표 레벨까지</div>
              <div className="text-[10px] text-zinc-500">선택 · 도달 시 정지</div>
            </div>
          </label>
          <div className="flex shrink-0 items-center gap-1">
            <button type="button" onClick={() => bumpTarget(-1)} disabled={!useTarget} className="flex h-8 w-7 items-center justify-center rounded-md border border-zinc-700 bg-black/40 text-[15px] leading-none text-zinc-300 active:scale-95 disabled:opacity-40" aria-label="목표 레벨 1 감소">−</button>
            <ZoomSafeInput
              wrapClassName="h-8 w-[56px]"
              value={target}
              onChange={(e) => setTarget(e.target.value.replace(/[^0-9]/g, ''))}
              inputMode="numeric"
              disabled={!useTarget}
              className="w-full rounded-md border border-zinc-700 bg-black/40 px-2 text-center font-mono text-zinc-100 disabled:opacity-40"
            />
            <button type="button" onClick={() => bumpTarget(1)} disabled={!useTarget} className="flex h-8 w-7 items-center justify-center rounded-md border border-zinc-700 bg-black/40 text-[15px] leading-none text-zinc-300 active:scale-95 disabled:opacity-40" aria-label="목표 레벨 1 증가">+</button>
          </div>
        </div>
        {/* 횟수 — 선택. 체크박스 토글은 라벨(체크박스+텍스트)까지만, 오른쪽 입력/±은 제외. */}
        <div className="flex items-center gap-2 border-t border-zinc-800 py-2.5">
          <label className="flex min-w-0 flex-1 items-center gap-2">
            <input type="checkbox" checked={useCount} onChange={(e) => setUseCount(e.target.checked)} className="h-4 w-4 shrink-0 accent-amber-500" />
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-semibold text-zinc-200">횟수 제한</div>
              <div className="text-[10px] text-zinc-500">선택 · N회 후 정지</div>
            </div>
          </label>
          <div className="flex shrink-0 items-center gap-1">
            <button type="button" onClick={() => bumpCount(-1)} disabled={!useCount} className="flex h-8 w-7 items-center justify-center rounded-md border border-zinc-700 bg-black/40 text-[15px] leading-none text-zinc-300 active:scale-95 disabled:opacity-40" aria-label="횟수 1 감소">−</button>
            <ZoomSafeInput
              wrapClassName="h-8 w-[56px]"
              value={count}
              onChange={(e) => setCount(e.target.value.replace(/[^0-9]/g, ''))}
              inputMode="numeric"
              disabled={!useCount}
              className="w-full rounded-md border border-zinc-700 bg-black/40 px-2 text-center font-mono text-zinc-100 disabled:opacity-40"
            />
            <button type="button" onClick={() => bumpCount(1)} disabled={!useCount} className="flex h-8 w-7 items-center justify-center rounded-md border border-zinc-700 bg-black/40 text-[15px] leading-none text-zinc-300 active:scale-95 disabled:opacity-40" aria-label="횟수 1 증가">+</button>
          </div>
        </div>
        {/* 하락 시 정지 — 선택 */}
        <label className="flex items-center gap-2 border-t border-zinc-800 py-2.5">
          <input type="checkbox" checked={down} onChange={(e) => setDown(e.target.checked)} className="h-4 w-4 accent-amber-500" />
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-semibold text-zinc-200">하락 시 정지</div>
            <div className="text-[10px] text-zinc-500">선택 · 위험구간 안전장치</div>
          </div>
        </label>
        {/* 이탈 시 정지 안내 — 자동 강화는 이 화면에서만 동작(백그라운드 대행 없음). */}
        <p className="mt-2 rounded-lg border border-zinc-800 bg-black/20 px-2.5 py-2 text-[10px] leading-relaxed text-zinc-500">
          화면을 벗어나거나 앱을 종료하면 자동 강화가 멈춥니다. 진행 중엔 화면이 꺼지지 않도록 유지됩니다.
        </p>
      </ModalLayout>
    </ModalShell>
  );
}
