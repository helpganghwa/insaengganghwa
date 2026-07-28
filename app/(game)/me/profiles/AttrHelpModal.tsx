// 클라이언트 전용 — 'use client'는 붙이지 않는다(ProfileSelector가 클라 경계라 그 그래프에 포함되며,
// 지시어를 달면 entry 취급되어 함수 prop(onClose) 직렬화 경고가 난다).
import { useState } from 'react';

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
  type AttrRegion,
  type AvatarAttr,
} from '@/lib/game/balance';

/** 원형 상성도 — 6권역 육각 배치 + 순환 화살표. 내 수치는 노드 크기·채도로 시각화. */
function CycleDiagram({ attrs }: { attrs: AvatarAttr[] }) {
  const vec = Object.fromEntries(runeVectorDesc(attrs)) as Partial<Record<AttrRegion, number>>;
  const CX = 150;
  const CY = 132;
  const R = 96;
  const pos = (r: AttrRegion): [number, number] => {
    const a = -Math.PI / 2 + AVATAR_ATTR_REGIONS.indexOf(r) * (Math.PI / 3);
    return [CX + R * Math.cos(a), CY + R * Math.sin(a)];
  };
  // 내가 가진 권역이 사냥하는 방향(강함)은 초록, 나를 사냥하는 방향(약점)은 붉게.
  const mine = new Set(AVATAR_ATTR_REGIONS.filter((r) => (vec[r] ?? 0) > 0));
  const preyOf = new Set([...mine].map((r) => attrPrey(r)));
  const predOf = new Set([...mine].map((r) => attrPredator(r)));

  return (
    <svg viewBox="0 0 300 264" className="w-full" role="img" aria-label="속성 상성 순환도">
      <defs>
        <marker id="ah-n" viewBox="0 0 6 6" refX="5.4" refY="3" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M0 0L6 3L0 6z" fill="#3f3f49" />
        </marker>
        <marker id="ah-s" viewBox="0 0 6 6" refX="5.4" refY="3" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M0 0L6 3L0 6z" fill="#34d399" />
        </marker>
      </defs>
      {AVATAR_ATTR_REGIONS.map((r) => {
        const [x1, y1] = pos(r);
        const [x2, y2] = pos(attrPrey(r));
        const mx = (x1 + x2) / 2 + (CX - (x1 + x2) / 2) * 0.2;
        const my = (y1 + y2) / 2 + (CY - (y1 + y2) / 2) * 0.2;
        const strong = mine.has(r); // 내 권역에서 나가는 화살표 = 내가 강한 방향
        return (
          <path
            key={r}
            d={`M${x1} ${y1} Q${mx} ${my} ${x2} ${y2}`}
            fill="none"
            stroke={strong ? '#34d399' : '#3f3f49'}
            strokeWidth={strong ? 2 : 1.1}
            markerEnd={`url(#${strong ? 'ah-s' : 'ah-n'})`}
          />
        );
      })}
      {AVATAR_ATTR_REGIONS.map((r) => {
        const [x, y] = pos(r);
        const v = vec[r] ?? 0;
        const c = ATTR_REGION_COLOR[r];
        const rad = v > 0 ? 15 + Math.min(1, v / 100) * 9 : 12;
        const isPrey = preyOf.has(r) && v === 0; // 내가 때리는 상대 권역
        const isPred = predOf.has(r) && v === 0; // 나를 때리는 상대 권역
        return (
          <g key={r}>
            {v > 0 ? <circle cx={x} cy={y} r={rad + 7} fill={c} opacity={0.18} /> : null}
            <circle
              cx={x}
              cy={y}
              r={rad}
              fill={v > 0 ? c : '#16161c'}
              stroke={isPred ? '#fb7185' : isPrey ? '#34d399' : c}
              strokeWidth={v > 0 ? 1.5 : isPrey || isPred ? 2 : 1}
              opacity={v > 0 ? 1 : 0.85}
            />
            <text
              x={x}
              y={y + 4}
              textAnchor="middle"
              fontSize={v > 0 ? 12 : 10}
              fontWeight={900}
              fill={v > 0 ? '#111116' : c}
            >
              {v > 0 ? `${v}%` : ATTR_REGION_KO[r]}
            </text>
            {v > 0 ? (
              <text x={x} y={y - rad - 7} textAnchor="middle" fontSize={10} fontWeight={800} fill={c}>
                {ATTR_REGION_KO[r]}
              </text>
            ) : null}
          </g>
        );
      })}
      <text x={CX} y={CY - 4} textAnchor="middle" fontSize={10} fontWeight={800} fill="#6e6e7c">
        화살표 방향으로
      </text>
      <text x={CX} y={CY + 10} textAnchor="middle" fontSize={10} fontWeight={800} fill="#6e6e7c">
        강합니다
      </text>
      <text x={CX} y={252} textAnchor="middle" fontSize={10} fontWeight={700} fill="#4a4a56">
        <tspan fill="#34d399">초록 테두리</tspan> 내가 강한 권역 ·{' '}
        <tspan fill="#fb7185">붉은 테두리</tspan> 나를 이기는 권역
      </text>
    </svg>
  );
}

/** 계산 방법 상세 — 공시 §6과 1:1(수식·예시·적용 범위). */
function CalcModal({ onClose }: { onClose: () => void }) {
  return (
    <ModalShell
      onClose={onClose}
      label="속성 계산 방법"
      align="bottom"
      className="w-full max-w-[358px] rounded-2xl border border-white/10 bg-zinc-950 p-4 text-zinc-100 shadow-xl"
    >
      <h2 className="text-[14px] font-black tracking-tight">계산 방법</h2>

      <h3 className="mt-3 text-[10px] font-black uppercase tracking-[0.09em] text-zinc-500">각인</h3>
      <p className="mt-1.5 text-[11.5px] leading-relaxed text-zinc-400">
        아바타를 만들 때 무기·방어구·장신구 세 줄이 각인됩니다. 각 줄은 여섯 권역 중 하나와
        0~{AVATAR_ATTR_ROLL_MAX}% 수치를 가지며, 같은 권역끼리 합산됩니다(권역당 최대{' '}
        {AVATAR_ATTR_TOTAL_MAX}%). 한 번 각인된 속성은 바뀌지 않습니다.
      </p>

      <h3 className="mt-3.5 text-[10px] font-black uppercase tracking-[0.09em] text-zinc-500">수식</h3>
      <p className="mt-1.5 rounded-lg bg-white/[0.05] px-3 py-2.5 text-[11.5px] leading-relaxed text-zinc-300">
        공격 보정 = 내 권역 수치 ×{' '}
        <span className="whitespace-nowrap">(상대가 가진 내 먹잇감 권역 수치 ÷ {AVATAR_ATTR_TOTAL_MAX})</span>
        <span className="mt-1 block text-zinc-500">
          권역마다 계산해 모두 더합니다. 최대 +{AVATAR_ATTR_TOTAL_MAX}%.
        </span>
      </p>
      <p className="mt-2 text-[11.5px] leading-relaxed text-zinc-500">
        예) 내 <b className="text-zinc-300">화산 40%</b>, 상대 <b className="text-zinc-300">신전 75%</b> →
        40 × (75 ÷ {AVATAR_ATTR_TOTAL_MAX}) = <b className="text-zinc-300">+20%</b> 공격.
        상대가 내 먹잇감 권역을 갖고 있지 않으면 보정은 0입니다.
      </p>

      <h3 className="mt-3.5 text-[10px] font-black uppercase tracking-[0.09em] text-zinc-500">
        적용 범위
      </h3>
      <ul className="mt-1.5 space-y-1 text-[11.5px] text-zinc-400">
        <li>· 점령전 · 대난투 — 그대로 적용</li>
        <li>· 레이드 — 절반만 적용</li>
        <li>· 공격력에만 적용되며 체력은 변하지 않습니다</li>
        <li>· 양쪽 모두 각자의 보정을 받습니다</li>
      </ul>

      <button
        type="button"
        onClick={onClose}
        className="mt-4 h-10 w-full rounded-xl bg-white text-[12px] font-black text-zinc-950 transition active:scale-[0.98]"
      >
        닫기
      </button>
    </ModalShell>
  );
}

/** 1차 팝업 — 원형 상성도 + 내 권역 강/약 요약. 계산식은 하단 텍스트 버튼 → 2차 팝업. */
export function AttrHelpModal({ onClose, attrs }: { onClose: () => void; attrs: AvatarAttr[] }) {
  const [calcOpen, setCalcOpen] = useState(false);
  const vec = runeVectorDesc(attrs);
  return (
    <>
      <ModalShell
        onClose={onClose}
        label="속성 상성"
        align="bottom"
        className="w-full max-w-[358px] rounded-2xl border border-white/10 bg-zinc-950 px-4 pb-4 pt-3.5 text-zinc-100 shadow-xl"
      >
        <div className="flex items-baseline gap-2">
          <h2 className="flex-1 text-[14px] font-black tracking-tight">속성 상성</h2>
          <span className="text-[10.5px] text-zinc-500">
            {vec.length > 0 ? `${vec.map(([r, v]) => `${ATTR_REGION_KO[r]} ${v}%`).join(' · ')}` : '속성 없음'}
          </span>
        </div>

        <CycleDiagram attrs={attrs} />

        {vec.length > 0 ? (
          <div className="flex flex-col gap-1 rounded-xl bg-white/[0.04] px-3 py-2.5">
            {vec.map(([r, v]) => (
              <div key={r} className="flex items-center gap-2 text-[11.5px]">
                <span className="w-[62px] font-extrabold" style={{ color: ATTR_REGION_COLOR[r] }}>
                  {ATTR_REGION_KO[r]} {v}%
                </span>
                <span className="text-zinc-500">
                  <b className="text-emerald-400">{ATTR_REGION_KO[attrPrey(r)]}</b>에 강함 ·{' '}
                  <b className="text-rose-400">{ATTR_REGION_KO[attrPredator(r)]}</b>에 약함
                </span>
              </div>
            ))}
          </div>
        ) : null}

        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCalcOpen(true)}
            className="text-[11px] font-semibold text-zinc-500 underline underline-offset-2 transition active:opacity-70"
          >
            계산 방법 자세히
          </button>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto h-9 rounded-lg bg-white px-5 text-[12px] font-black text-zinc-950 transition active:scale-[0.98]"
          >
            확인
          </button>
        </div>
      </ModalShell>
      {calcOpen ? <CalcModal onClose={() => setCalcOpen(false)} /> : null}
    </>
  );
}
