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

import { AttrSimModal } from './AttrSimModal';
import { synergyRows, SYNERGY_ROW_H } from './AttrSynergyChart';

// echarts는 무거워 팝업을 열 때만 로드(프로필 화면 초기 번들에서 제외).
const AttrSynergyChart = dynamic(
  () => import('./AttrSynergyChart').then((m) => m.AttrSynergyChart),
  { ssr: false, loading: () => <div style={{ height: 6 * SYNERGY_ROW_H }} /> },
);

/** 상성 순환 한 줄 — 왼쪽이 오른쪽을 이긴다. 내가 가진 권역은 채워서 강조. */
function CycleStrip({ mine }: { mine: Set<string> }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-1 gap-y-1">
      {AVATAR_ATTR_REGIONS.map((r) => (
        <span key={r} className="flex items-center gap-1">
          <span
            className="rounded-md px-1.5 py-[3px] text-[10.5px] font-extrabold"
            style={
              mine.has(r)
                ? { backgroundColor: ATTR_REGION_COLOR[r], color: '#18181b' }
                : { color: ATTR_REGION_COLOR[r], backgroundColor: 'rgba(255,255,255,0.06)' }
            }
          >
            {ATTR_REGION_KO[r]}
          </span>
          <span className="text-[9px] text-zinc-500">▸</span>
        </span>
      ))}
      <span className="text-[10.5px] font-bold text-zinc-500">천사</span>
    </div>
  );
}

/** 계산 방법(2차) — 단계별 설명. 공시 §6과 1:1. */
function CalcModal({ onClose }: { onClose: () => void }) {
  return (
    <ModalShell
      onClose={onClose}
      label="속성 계산 방법"
      className="max-h-[86dvh] w-full max-w-[320px] overflow-y-auto rounded-2xl bg-white p-4 dark:bg-zinc-950"
    >
      <h2 className="text-[15px] font-bold">속성은 이렇게 작동해요</h2>

      <Step n={1} title="아바타마다 속성이 각인됩니다">
        아바타를 만들면 <b>무기·방어구·장신구 세 줄</b>이 함께 새겨집니다. 각 줄은 여섯 권역 중
        하나를 뽑고 <b>0~{AVATAR_ATTR_ROLL_MAX}%</b> 수치를 가집니다. 같은 권역이 겹치면 합산돼서
        한 권역이 최대 {AVATAR_ATTR_TOTAL_MAX}%까지 올라갑니다. 한 번 각인되면 바뀌지 않아요.
      </Step>

      <Step n={2} title="권역끼리는 먹고 먹히는 순환입니다">
        각 권역은 <b>바로 다음 권역 하나에만</b> 강합니다. 두 칸 건너뛴 권역과는 아무 관계가 없어요.
      </Step>

      <Step n={3} title="상대가 내 먹잇감을 가진 만큼만 세집니다">
        내 권역이 아무리 높아도, <b>상대가 그 먹잇감 권역을 안 가졌다면 보정은 0</b>입니다. 상대가
        많이 가질수록 내 잠재력이 그만큼 발동합니다.
        <span className="mt-2 block rounded-lg bg-zinc-100 px-3 py-2 font-mono text-[11.5px] font-bold leading-relaxed dark:bg-zinc-900">
          내 권역 수치 × (상대 먹잇감 수치 ÷ {AVATAR_ATTR_TOTAL_MAX})
        </span>
        <span className="mt-1.5 block text-[11.5px] text-zinc-500">
          권역마다 계산해 모두 더합니다 · 최대 +{AVATAR_ATTR_TOTAL_MAX}%
        </span>
      </Step>

      <Step n={4} title="예를 들면">
        내 <b>화산 40%</b>, 상대 <b>신전 75%</b> → 화산은 신전을 이기므로
        <br />
        <span className="font-mono">40 × (75 ÷ {AVATAR_ATTR_TOTAL_MAX}) = </span>
        <b className="text-emerald-600 dark:text-emerald-400">+20%</b> 공격
        <br />
        같은 상대라도 신전이 <b>0%</b>면 보정도 <b>0%</b>입니다.
      </Step>

      <Step n={5} title="어디에 적용되나요">
        <span className="block">· 점령전 · 대난투 — 그대로 적용</span>
        <span className="block">· 레이드 — 절반만 적용(보스도 권역을 가집니다)</span>
        <span className="block">· 공격력만 오르고 체력은 변하지 않습니다</span>
        <span className="block">· 나와 상대가 각자 자기 보정을 받습니다</span>
        <span className="block">· 전투에는 <b>대표 아바타</b>의 속성이 적용됩니다</span>
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

/** 1차 팝업 — 상성 차트 + 순환 + 요약 · 시뮬레이션/계산 방법으로 연결. */
export function AttrHelpModal({ onClose, attrs }: { onClose: () => void; attrs: AvatarAttr[] }) {
  const [calcOpen, setCalcOpen] = useState(false);
  const [simOpen, setSimOpen] = useState(false);
  const vec = runeVectorDesc(attrs);
  const rows = synergyRows(attrs);
  const mine = new Set(vec.map(([r]) => r as string));

  return (
    <>
      <ModalShell
        onClose={onClose}
        label="속성 상성"
        className="max-h-[86dvh] w-full max-w-[320px] overflow-y-auto rounded-2xl bg-white p-4 dark:bg-zinc-950"
      >
        <div className="flex items-baseline gap-2">
          <h2 className="flex-1 text-[15px] font-bold">내 속성</h2>
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
            <p className="mt-2.5 text-[12px] leading-relaxed text-zinc-600 dark:text-zinc-300">
              상대가 어떤 권역을 가졌느냐에 따라 <b>공격력 보정</b>이 붙습니다. 아래는 상대가 그
              권역만 <b>100%</b> 가졌다고 가정했을 때의 보정입니다.
            </p>

            <div className="relative mt-2.5">
              <AttrSynergyChart rows={rows} />
              <div className="pointer-events-none absolute inset-0 flex flex-col justify-around">
                {rows.map((r) => (
                  <span key={r.region} className="text-center">
                    <span className="bg-white px-1.5 text-[10px] font-extrabold text-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">
                      {ATTR_REGION_KO[r.region]}
                    </span>
                  </span>
                ))}
              </div>
            </div>
            <div className="mt-1 flex justify-center gap-4 text-[10.5px] text-zinc-500">
              <span>
                <i className="mr-1 inline-block h-[3px] w-[9px] rounded-sm bg-rose-500 align-middle" />
                내가 받는 피해 ↑
              </span>
              <span>
                <i className="mr-1 inline-block h-[3px] w-[9px] rounded-sm bg-emerald-500 align-middle" />
                내 공격 ↑
              </span>
            </div>

            <div className="mt-3 flex flex-col gap-1 rounded-xl bg-zinc-100 px-3 py-2.5 dark:bg-zinc-900">
              {vec.map(([r, v]) => (
                <p key={r} className="text-[12px]">
                  <b style={{ color: ATTR_REGION_COLOR[r] }}>
                    {ATTR_REGION_KO[r]} {v}%
                  </b>{' '}
                  <span className="text-zinc-500">
                    → <b className="text-emerald-600 dark:text-emerald-400">{ATTR_REGION_KO[attrPrey(r)]}</b>
                    에 강함 ·{' '}
                    <b className="text-rose-500 dark:text-rose-400">{ATTR_REGION_KO[attrPredator(r)]}</b>
                    에 약함
                  </span>
                </p>
              ))}
            </div>
          </>
        ) : (
          <p className="mt-2.5 text-[12.5px] leading-relaxed text-zinc-600 dark:text-zinc-300">
            이 아바타에는 속성이 없습니다. 아바타를 새로 만들면 무기·방어구·장신구 세 줄의 속성이
            함께 각인됩니다.
          </p>
        )}

        <h3 className="mt-4 text-[10px] font-black uppercase tracking-[0.08em] text-zinc-400">
          상성 순환
        </h3>
        <p className="mt-1.5 text-[11.5px] text-zinc-500">왼쪽 권역이 바로 오른쪽 권역을 이깁니다.</p>
        <div className="mt-2">
          <CycleStrip mine={mine} />
        </div>

        <button
          type="button"
          onClick={() => setSimOpen(true)}
          className="mt-4 w-full rounded-xl bg-amber-600 py-2.5 text-sm font-bold text-white active:opacity-90"
        >
          상대 속성 넣고 계산해보기
        </button>
        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setCalcOpen(true)}
            className="text-[11.5px] font-semibold text-zinc-400 underline underline-offset-2 active:opacity-70 dark:text-zinc-500"
          >
            속성 시스템 설명
          </button>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded-xl bg-zinc-100 px-6 py-2 text-[13px] font-bold text-zinc-600 active:opacity-70 dark:bg-zinc-800 dark:text-zinc-300"
          >
            닫기
          </button>
        </div>
      </ModalShell>
      {calcOpen ? <CalcModal onClose={() => setCalcOpen(false)} /> : null}
      {simOpen ? <AttrSimModal onClose={() => setSimOpen(false)} attrs={attrs} /> : null}
    </>
  );
}
