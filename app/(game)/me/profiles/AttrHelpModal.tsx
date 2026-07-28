// 클라이언트 전용 — 'use client'는 붙이지 않는다(ProfileSelector가 클라 경계라 그 그래프에 포함되며,
// 지시어를 달면 entry 취급되어 함수 prop(onClose) 직렬화 경고가 난다).
import { useState } from 'react';
import dynamic from 'next/dynamic';

import { ModalShell } from '@/components/ModalShell';
import { runeVectorDesc } from '@/components/RuneName';
import {
  ATTR_REGION_COLOR,
  ATTR_REGION_KO,
  AVATAR_ATTR_REGIONS,
  AVATAR_ATTR_ROLL_MAX,
  AVATAR_ATTR_TOTAL_MAX,
  attrPredator,
  attrPrey,
  type AvatarAttr,
} from '@/lib/game/balance';

// echarts는 무거워 팝업을 열 때만 로드(프로필 화면 초기 번들에서 제외).
const AttrSynergyChart = dynamic(
  () => import('./AttrSynergyChart').then((m) => m.AttrSynergyChart),
  { ssr: false, loading: () => <div className="h-[168px] w-full" /> },
);

/** 계산 방법 상세(2차) — 공시 §6과 1:1. 공용 팝업 스타일. */
function CalcModal({ onClose }: { onClose: () => void }) {
  return (
    <ModalShell
      onClose={onClose}
      label="속성 계산 방법"
      className="w-full max-w-[320px] rounded-2xl bg-white p-4 dark:bg-zinc-950"
    >
      <h2 className="text-[15px] font-bold">계산 방법</h2>

      <p className="mt-2.5 text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-300">
        아바타를 만들 때 무기·방어구·장신구 세 줄이 각인됩니다. 각 줄은 여섯 권역 중 하나와 0~
        {AVATAR_ATTR_ROLL_MAX}% 수치를 가지며, 같은 권역끼리 합산됩니다(권역당 최대{' '}
        {AVATAR_ATTR_TOTAL_MAX}%). 한 번 각인된 속성은 바뀌지 않습니다.
      </p>

      <div className="mt-3 rounded-xl bg-zinc-100 p-3 dark:bg-zinc-900">
        <p className="text-[12.5px] font-bold leading-relaxed">
          공격 보정 = 내 권역 수치 ×{' '}
          <span className="whitespace-nowrap">
            (상대의 &lsquo;내가 강한 권역&rsquo; 수치 ÷ {AVATAR_ATTR_TOTAL_MAX})
          </span>
        </p>
        <p className="mt-1 text-[11.5px] text-zinc-500">
          권역마다 계산해 모두 더합니다 · 최대 +{AVATAR_ATTR_TOTAL_MAX}%
        </p>
      </div>

      <p className="mt-2.5 text-[12.5px] leading-relaxed text-zinc-600 dark:text-zinc-300">
        예) 내 <b>화산 40%</b>, 상대 <b>신전 75%</b> → 40 × (75 ÷ {AVATAR_ATTR_TOTAL_MAX}) ={' '}
        <b className="text-zinc-900 dark:text-zinc-100">+20%</b> 공격. 상대가 내가 강한 권역을 갖고
        있지 않으면 보정은 0입니다.
      </p>

      <ul className="mt-3 space-y-1 text-[12.5px] text-zinc-600 dark:text-zinc-300">
        <li>· 점령전 · 대난투 — 그대로 적용</li>
        <li>· 레이드 — 절반만 적용</li>
        <li>· 공격력에만 적용되며 체력은 변하지 않습니다</li>
        <li>· 전투에는 대표 아바타의 속성이 적용됩니다</li>
      </ul>

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

/** 1차 팝업 — 상대 권역별 내 우위 차트(ECharts) + 강/약 요약. 계산식은 하단 링크 → 2차. */
export function AttrHelpModal({ onClose, attrs }: { onClose: () => void; attrs: AvatarAttr[] }) {
  const [calcOpen, setCalcOpen] = useState(false);
  const vec = runeVectorDesc(attrs);
  return (
    <>
      <ModalShell
        onClose={onClose}
        label="속성 상성"
        className="w-full max-w-[320px] rounded-2xl bg-white p-4 dark:bg-zinc-950"
      >
        <div className="flex items-baseline gap-2">
          <h2 className="flex-1 text-[15px] font-bold">속성 상성</h2>
          <span className="shrink-0 text-[11.5px] font-bold text-zinc-500">
            {vec.length > 0
              ? vec.map(([r, v]) => `${ATTR_REGION_KO[r]} ${v}%`).join(' · ')
              : '속성 없음'}
          </span>
        </div>

        {vec.length > 0 ? (
          <>
            <p className="mt-2 text-[11.5px] text-zinc-500">
              상대가 그 권역을 100% 가졌을 때 내 공격 보정
            </p>
            <AttrSynergyChart attrs={attrs} />
            <div className="mt-1 flex flex-col gap-1 rounded-xl bg-zinc-100 px-3 py-2.5 dark:bg-zinc-900">
              {vec.map(([r, v]) => (
                <p key={r} className="text-[12px]">
                  <b style={{ color: ATTR_REGION_COLOR[r] }}>
                    {ATTR_REGION_KO[r]} {v}%
                  </b>{' '}
                  <span className="text-zinc-500">
                    → <b className="text-emerald-600 dark:text-emerald-400">{ATTR_REGION_KO[attrPrey(r)]}</b>에 강함
                    {' · '}
                    <b className="text-rose-500 dark:text-rose-400">{ATTR_REGION_KO[attrPredator(r)]}</b>에 약함
                  </span>
                </p>
              ))}
            </div>
          </>
        ) : (
          <p className="mt-2.5 text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-300">
            이 아바타에는 속성이 없습니다. 아바타를 새로 만들면 무기·방어구·장신구 세 줄의 속성이
            함께 각인됩니다.
          </p>
        )}

        <p className="mt-2.5 text-[11.5px] leading-relaxed text-zinc-500">
          상성은 {AVATAR_ATTR_REGIONS.map((r) => ATTR_REGION_KO[r]).join(' → ')} → 천사 순환으로,
          각 권역은 바로 다음 권역에만 강합니다.
        </p>

        <div className="mt-3.5 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setCalcOpen(true)}
            className="text-[11.5px] font-semibold text-zinc-400 underline underline-offset-2 active:opacity-70 dark:text-zinc-500"
          >
            계산 방법 자세히
          </button>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto flex-1 rounded-xl bg-amber-600 py-2.5 text-sm font-bold text-white active:opacity-90"
          >
            확인
          </button>
        </div>
      </ModalShell>
      {calcOpen ? <CalcModal onClose={() => setCalcOpen(false)} /> : null}
    </>
  );
}
