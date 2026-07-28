// 클라이언트 전용 — 'use client' 미부착(부모 클라 그래프에 포함).
import { ModalShell } from '@/components/ModalShell';
import {
  ATTR_REGION_COLOR,
  ATTR_REGION_KO,
  AVATAR_ATTR_REGIONS,
  AVATAR_ATTR_ROLL_MAX,
  AVATAR_ATTR_TOTAL_MAX,
} from '@/lib/game/balance';

/** 상성 순환 — 한 줄에 들어가도록 압축. 마지막 칩은 첫 지역(천사)이 되돌아온 것이라 같은 스타일. */
function CycleStrip() {
  const first = AVATAR_ATTR_REGIONS[0]!;
  const chip = 'rounded bg-zinc-100 px-1 py-[2px] text-[9px] font-extrabold dark:bg-white/[0.06]';
  return (
    <span className="-ml-[23px] flex items-center justify-center gap-[2px] whitespace-nowrap">
      {AVATAR_ATTR_REGIONS.map((r) => (
        <span key={r} className="flex items-center gap-[2px]">
          <span className={chip} style={{ color: ATTR_REGION_COLOR[r] }}>
            {ATTR_REGION_KO[r]}
          </span>
          <span className="text-[8px] text-zinc-400">▸</span>
        </span>
      ))}
      <span className={chip} style={{ color: ATTR_REGION_COLOR[first] }}>
        {ATTR_REGION_KO[first]}
      </span>
    </span>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="mt-3.5">
      <p className="flex items-center gap-1.5 text-[12.5px] font-bold">
        <span className="grid h-[17px] w-[17px] shrink-0 place-items-center rounded-full bg-zinc-900 text-[10px] font-black text-white dark:bg-white dark:text-zinc-950">
          {n}
        </span>
        {title}
      </p>
      <p className="mt-1 pl-[23px] text-[12px] leading-relaxed text-zinc-600 dark:text-zinc-300">
        {children}
      </p>
    </div>
  );
}

/** 속성 시스템 안내 — 각인 → 상성 순환 → 발동 조건 → 적용처. 공시 §6과 1:1. */
export function AttrGuideModal({ onClose }: { onClose: () => void }) {
  return (
    <ModalShell
      onClose={onClose}
      label="속성 시스템 설명"
      className="max-h-[86dvh] w-full max-w-[320px] overflow-y-auto rounded-2xl bg-white p-4 dark:bg-zinc-950"
    >
      <h2 className="text-[15px] font-bold">속성이란?</h2>

      <Step n={1} title="아바타마다 속성이 각인됩니다">
        아바타를 만들면 <b>무기·방어구·장신구의 지역 속성</b>에 따라 <b>0~{AVATAR_ATTR_ROLL_MAX}%</b>
        의 수치를 가집니다. 같은 지역이 겹치면 합산돼서 한 지역이 최대 {AVATAR_ATTR_TOTAL_MAX}%까지
        올라갑니다. 한 번 각인되면 바뀌지 않아요.
      </Step>

      <Step n={2} title="지역끼리는 상성을 가집니다">
        각 지역은 <b>바로 다음 지역 하나에만</b> 강합니다. 두 칸 건너뛴 지역과는 아무 관계가 없어요.
        <span className="mt-2 block">
          <CycleStrip />
        </span>
      </Step>

      <Step n={3} title="상대가 역상성 지역을 가진 만큼 세집니다">
        내 지역이 아무리 높아도, <b>상대가 그 역상성 지역을 안 가졌다면 보정은 0</b>입니다. 상대가
        많이 가질수록 내 잠재력이 그만큼 발동합니다.
        <span className="mt-2 block rounded-lg bg-zinc-100 px-3 py-2 font-mono text-[11.5px] font-bold leading-relaxed dark:bg-zinc-900">
          내 지역 수치 × (상대 역상성 지역 수치 ÷ {AVATAR_ATTR_TOTAL_MAX})
        </span>
        <span className="mt-1.5 block text-[11.5px] text-zinc-500">
          지역마다 계산해 모두 더합니다 · 최대 +{AVATAR_ATTR_TOTAL_MAX}%
        </span>
      </Step>

      <Step n={4} title="어디에 적용되나요">
        <span className="block">· 점령전 · 대난투 · 레이드</span>
        <span className="block">· 공격력만 오르고 체력은 변하지 않습니다</span>
        <span className="block">· 나와 상대가 각자 보정을 받습니다</span>
        <span className="block">
          · 전투에는 <b>대표 아바타</b>의 속성이 적용됩니다
        </span>
      </Step>

      <button
        type="button"
        onClick={onClose}
        className="mt-4 w-full rounded-xl bg-zinc-100 py-2.5 text-sm font-bold text-zinc-600 active:opacity-70 dark:bg-zinc-800 dark:text-zinc-300"
      >
        닫기
      </button>
    </ModalShell>
  );
}

/** 타이틀 옆 `?` 버튼 — 속성 안내 팝업 트리거. */
export function AttrGuideButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="속성 시스템 설명"
      className="shrink-0 text-zinc-400 transition active:scale-90 dark:text-zinc-500"
    >
      <svg width="17" height="17" viewBox="0 0 20 20" fill="none" aria-hidden>
        <circle cx="10" cy="10" r="8.25" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M7.9 7.7a2.15 2.15 0 1 1 3.05 1.95c-.62.3-.95.86-.95 1.5v.35"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <circle cx="10" cy="14.4" r="0.95" fill="currentColor" />
      </svg>
    </button>
  );
}
