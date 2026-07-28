// 클라이언트 전용 — 'use client'는 붙이지 않는다(ProfileSelector가 클라 경계라 그 그래프에 포함되며,
// 지시어를 달면 entry 취급되어 함수 prop(onClose) 직렬화 경고가 난다).
import { useState } from 'react';
import dynamic from 'next/dynamic';

import { ModalShell } from '@/components/ModalShell';
import { runeVectorDesc } from '@/components/RuneName';
import {
  ATTR_REGION_COLOR,
  ATTR_REGION_KO,
  type AvatarAttr,
} from '@/lib/game/balance';

import { AttrGuideButton, AttrGuideModal } from './AttrGuideModal';
import { synergyRows, SYNERGY_ROW_H } from './AttrSynergyChart';

// echarts는 무거워 팝업을 열 때만 로드(프로필 화면 초기 번들에서 제외).
const AttrSynergyChart = dynamic(
  () => import('./AttrSynergyChart').then((m) => m.AttrSynergyChart),
  { ssr: false, loading: () => <div style={{ height: 6 * SYNERGY_ROW_H }} /> },
);

/** 1차 팝업 — 상성 차트 + 순환 + 요약 · 대결/계산 방법으로 연결. owner=내 속성 / else 남의 속성. */
export function AttrPopup({
  onClose,
  attrs,
  owner,
  ownerNickname,
}: {
  onClose: () => void;
  attrs: AvatarAttr[];
  owner: boolean;
  ownerNickname: string;
}) {
  const [calcOpen, setCalcOpen] = useState(false);
  const vec = runeVectorDesc(attrs);
  const rows = synergyRows(attrs);

  return (
    <>
      <ModalShell
        onClose={onClose}
        label="속성 상성"
        className="max-h-[86dvh] w-full max-w-[320px] overflow-y-auto rounded-2xl bg-white p-4 dark:bg-zinc-950"
      >
        <div className="flex items-center gap-1.5">
          <h2 className="min-w-0 truncate text-[15px] font-bold">
            {owner ? '내 속성' : `${ownerNickname} 속성`}
          </h2>
          <AttrGuideButton onClick={() => setCalcOpen(true)} />
          <span className="flex-1" />
          <span className="shrink-0 text-[11.5px] font-bold">
            {vec.length > 0 ? (
              vec.map(([r, v], i) => (
                <span key={r} style={{ color: ATTR_REGION_COLOR[r] }}>
                  {i > 0 ? ' · ' : ''}
                  {ATTR_REGION_KO[r]} {v}%
                </span>
              ))
            ) : (
              <span className="text-zinc-500">속성 없음</span>
            )}
          </span>
        </div>

        {vec.length > 0 ? (
          <>
            <p className="mt-2 text-[11.5px] text-zinc-500">상대의 속성이 해당 지역 100%일 때 기준</p>
            <div className="mt-1.5">
              <AttrSynergyChart rows={rows} />
            </div>
            <div className="mt-1 flex justify-center gap-4 text-[10.5px] text-zinc-500">
              <span>
                <i className="mr-1 inline-block h-[3px] w-[9px] rounded-sm bg-emerald-500 align-middle" />
                ← 내 공격 ↑
              </span>
              <span>
                <i className="mr-1 inline-block h-[3px] w-[9px] rounded-sm bg-rose-500 align-middle" />
                받는 피해 ↑ →
              </span>
            </div>

          </>
        ) : (
          <p className="mt-2.5 text-[12.5px] leading-relaxed text-zinc-600 dark:text-zinc-300">
            이 아바타에는 속성이 없습니다. 아바타를 새로 만들면 무기·방어구·장신구 세 줄의 속성이
            함께 각인됩니다.
          </p>
        )}


        <button
          type="button"
          onClick={onClose}
          className="mt-3.5 w-full rounded-xl bg-zinc-100 py-2.5 text-sm font-bold text-zinc-600 active:opacity-70 dark:bg-zinc-800 dark:text-zinc-300"
        >
          닫기
        </button>
      </ModalShell>
      {calcOpen ? <AttrGuideModal onClose={() => setCalcOpen(false)} /> : null}
    </>
  );
}
