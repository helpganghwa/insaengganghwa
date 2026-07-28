// 클라이언트 전용 — 'use client' 미부착(ProfileSelector 클라 그래프에 포함).
import { useMemo, useState } from 'react';

import { ModalShell } from '@/components/ModalShell';
import {
  ATTR_REGION_COLOR,
  ATTR_REGION_KO,
  AVATAR_ATTR_REGIONS,
  AVATAR_ATTR_ROLL_MAX,
  AVATAR_ATTR_TOTAL_MAX,
  attrAdvantagePct,
  attrDisplayVector,
  attrPrey,
  type AttrRegion,
  type AvatarAttr,
} from '@/lib/game/balance';

const SLOTS = [
  { key: 'weapon', label: '무기' },
  { key: 'armor', label: '방어구' },
  { key: 'accessory', label: '장신구' },
] as const;

type Line = { region: AttrRegion; pct: number };

/**
 * 상성 시뮬레이터 — 상대 속성을 실제 각인 구조(3줄 × 권역 × 0~50)대로 입력해
 * 양쪽 공격 보정을 즉시 계산. 수식은 balance.attrAdvantagePct 그대로라 실제 전투와 1:1.
 */
export function AttrSimModal({ onClose, attrs }: { onClose: () => void; attrs: AvatarAttr[] }) {
  const [lines, setLines] = useState<Line[]>([
    { region: 'kingdom', pct: 30 },
    { region: 'temple', pct: 20 },
    { region: 'orc', pct: 0 },
  ]);

  const mineVec = useMemo(() => attrDisplayVector(attrs), [attrs]);
  const oppVec = useMemo(() => {
    const v: Partial<Record<AttrRegion, number>> = {};
    for (const l of lines) if (l.pct > 0) v[l.region] = (v[l.region] ?? 0) + l.pct;
    return v;
  }, [lines]);

  const myAdv = attrAdvantagePct(mineVec, oppVec);
  const oppAdv = attrAdvantagePct(oppVec, mineVec);
  const diff = myAdv - oppAdv;

  // 기여 내역 — 어떤 짝이 몇 %를 만들었는지(이해를 돕는 핵심).
  const parts = AVATAR_ATTR_REGIONS.flatMap((r) => {
    const my = mineVec[r] ?? 0;
    const op = oppVec[attrPrey(r)] ?? 0;
    if (my <= 0 || op <= 0) return [];
    return [{ r, prey: attrPrey(r), my, op, gain: (my * op) / AVATAR_ATTR_TOTAL_MAX }];
  });

  const setLine = (i: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)));

  const oppEntries = Object.entries(oppVec)
    .filter(([, v]) => (v ?? 0) > 0)
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0)) as [AttrRegion, number][];

  return (
    <ModalShell
      onClose={onClose}
      label="상성 시뮬레이션"
      className="max-h-[86dvh] w-full max-w-[320px] overflow-y-auto rounded-2xl bg-white p-4 dark:bg-zinc-950"
    >
      <h2 className="text-[15px] font-bold">상성 시뮬레이션</h2>
      <p className="mt-1.5 text-[12px] leading-relaxed text-zinc-500">
        상대 아바타의 속성을 넣어보면 실제 전투에서 적용될 보정을 미리 볼 수 있어요.
      </p>

      {/* 결과 — 항상 상단에 고정 노출 */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-emerald-500/10 px-3 py-2.5 text-center">
          <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">내 공격</p>
          <p className="font-mono text-[19px] font-black tabular-nums text-emerald-600 dark:text-emerald-400">
            +{myAdv.toFixed(1)}%
          </p>
        </div>
        <div className="rounded-xl bg-rose-500/10 px-3 py-2.5 text-center">
          <p className="text-[10px] font-bold text-rose-500 dark:text-rose-400">상대 공격</p>
          <p className="font-mono text-[19px] font-black tabular-nums text-rose-500 dark:text-rose-400">
            +{oppAdv.toFixed(1)}%
          </p>
        </div>
      </div>
      <p className="mt-1.5 text-center text-[11.5px] font-bold">
        {Math.abs(diff) < 0.05 ? (
          <span className="text-zinc-500">서로 대등합니다</span>
        ) : diff > 0 ? (
          <span className="text-emerald-600 dark:text-emerald-400">
            내가 {diff.toFixed(1)}%p 유리
          </span>
        ) : (
          <span className="text-rose-500 dark:text-rose-400">
            내가 {Math.abs(diff).toFixed(1)}%p 불리
          </span>
        )}
      </p>

      {/* 상대 속성 입력 — 실제 각인 구조 그대로 3줄 */}
      <h3 className="mt-4 text-[10px] font-black uppercase tracking-[0.08em] text-zinc-400">
        상대 속성
      </h3>
      <div className="mt-2 flex flex-col gap-2.5">
        {SLOTS.map((s, i) => {
          const line = lines[i]!;
          return (
            <div key={s.key}>
              <div className="flex items-center gap-1.5">
                <span className="w-9 shrink-0 text-[11px] font-bold text-zinc-500">{s.label}</span>
                <div className="flex flex-1 gap-[3px]">
                  {AVATAR_ATTR_REGIONS.map((r) => {
                    const on = line.region === r;
                    return (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setLine(i, { region: r })}
                        className={`flex-1 rounded-md py-1 text-[9.5px] font-extrabold transition ${
                          on ? 'text-zinc-950' : 'text-zinc-400 dark:text-zinc-500'
                        }`}
                        style={{
                          backgroundColor: on ? ATTR_REGION_COLOR[r] : 'rgba(255,255,255,0.06)',
                        }}
                      >
                        {ATTR_REGION_KO[r]}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="mt-1 flex items-center gap-2 pl-[42px]">
                <input
                  type="range"
                  min={0}
                  max={AVATAR_ATTR_ROLL_MAX}
                  value={line.pct}
                  onChange={(e) => setLine(i, { pct: Number(e.target.value) })}
                  aria-label={`${s.label} 수치`}
                  className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-zinc-200 accent-zinc-900 dark:bg-zinc-800 dark:accent-white"
                  style={{ accentColor: ATTR_REGION_COLOR[line.region] }}
                />
                <span className="w-9 shrink-0 text-right font-mono text-[11.5px] font-black tabular-nums">
                  {line.pct}%
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex items-center gap-2">
        <span className="flex-1 text-[10.5px] text-zinc-500">
          상대 합계{' '}
          <b className="font-mono tabular-nums">
            {oppEntries.reduce((s, [, v]) => s + v, 0)}%
          </b>
          {oppEntries.length > 0 ? (
            <>
              {' · '}
              {oppEntries.map(([r, v]) => (
                <span key={r} style={{ color: ATTR_REGION_COLOR[r] }}>
                  {ATTR_REGION_KO[r]} {v}%{' '}
                </span>
              ))}
            </>
          ) : null}
        </span>
        <button
          type="button"
          onClick={() => setLines(lines.map((l) => ({ ...l, pct: 0 })))}
          className="shrink-0 text-[10.5px] font-semibold text-zinc-400 underline underline-offset-2 active:opacity-70"
        >
          초기화
        </button>
      </div>

      {/* 계산 과정 — 왜 그 숫자가 나왔는지 */}
      <h3 className="mt-4 text-[10px] font-black uppercase tracking-[0.08em] text-zinc-400">
        내 공격 보정이 나온 과정
      </h3>
      {parts.length > 0 ? (
        <div className="mt-2 flex flex-col gap-1.5 rounded-xl bg-zinc-100 px-3 py-2.5 dark:bg-zinc-900">
          {parts.map((p) => (
            <p key={p.r} className="font-mono text-[11px] tabular-nums leading-relaxed">
              <span style={{ color: ATTR_REGION_COLOR[p.r] }}>
                내 {ATTR_REGION_KO[p.r]} {p.my}
              </span>
              <span className="text-zinc-400"> × </span>
              <span style={{ color: ATTR_REGION_COLOR[p.prey] }}>
                상대 {ATTR_REGION_KO[p.prey]} {p.op}
              </span>
              <span className="text-zinc-400"> ÷ {AVATAR_ATTR_TOTAL_MAX} = </span>
              <b className="text-emerald-600 dark:text-emerald-400">+{p.gain.toFixed(1)}%</b>
            </p>
          ))}
          <p className="mt-0.5 border-t border-zinc-200 pt-1.5 font-mono text-[11.5px] font-black tabular-nums dark:border-zinc-800">
            합계 <span className="text-emerald-600 dark:text-emerald-400">+{myAdv.toFixed(1)}%</span>
          </p>
        </div>
      ) : (
        <p className="mt-2 rounded-xl bg-zinc-100 px-3 py-2.5 text-[11.5px] leading-relaxed text-zinc-500 dark:bg-zinc-900">
          상대가 <b>내가 강한 권역</b>을 갖고 있지 않아 보정이 0입니다. 상대 권역을 내 권역의 먹잇감
          쪽으로 바꿔보세요.
        </p>
      )}

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
