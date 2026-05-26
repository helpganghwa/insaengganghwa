import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import Link from 'next/link';
import type { Metadata } from 'next';
import { existsSync, readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';

import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { profiles } from '@/lib/db/schema/profiles';
import {
  baseAttemptDurationMs,
  baseSuccessRateBp,
  downRateBp,
  enhanceDurationMs,
  CYCLE_LEN,
  CYCLE_TIME_BASE,
  CUMULATIVE_REACH_ANCHORS_MS,
  SAFE_MAX_LEVEL,
} from '@/lib/game/balance';
import { computeCycleZeroReach } from '@/lib/game/enhance/analytics';

export const metadata: Metadata = {
  title: '강화 밸런스 리뷰 (운영)',
  description: '강화 사이클·확률·시간 — 시뮬레이션 검증.',
};

const pct = (bp: number) => (bp / 100).toFixed(bp % 100 === 0 ? 0 : 1) + '%';

function fmtDuration(ms: number): string {
  if (ms < 0 || !Number.isFinite(ms)) return '—';
  if (ms < 60_000) return `${(ms / 1000).toFixed(0)}s`;
  if (ms < 3_600_000) return `${(ms / 60_000).toFixed(0)}m`;
  if (ms < 86_400_000) return `${(ms / 3_600_000).toFixed(1)}h`;
  return `${(ms / 86_400_000).toFixed(2)}d`;
}

type Sim = {
  generatedAt: string;
  /** 'analytic-expected-value' | 'monte-carlo' */
  mode?: string;
  trialsPerTarget: number;
  targets: number[];
  segments: Array<{
    target: number;
    trials: number;
    meanMs: number;
    p25Ms: number;
    p50Ms: number;
    p75Ms: number;
    p95Ms: number;
    meanAttempts: number;
  }>;
  cumulativeAnchors: Record<string, number>;
  perCycleMeanMs: number[];
};

function loadSimulation(): Sim | null {
  const path = resolvePath(process.cwd(), 'public/simulation/enhance.json');
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as Sim;
  } catch {
    return null;
  }
}

const LEVEL_SAMPLES_CYCLE_0 = [0, 5, 9, 10, 20, 30, 40, 51, 52, 60, 75, 90, 99];
const CUM_REACH_SAMPLES = [10, 20, 30, 40, 50, 51, 52, 60, 70, 75, 80, 90, 95, 99] as const;

export default async function BalanceReviewPage() {
  const userId = await getSessionUserId();
  if (!userId) notFound();
  const [p] = await db
    .select({ isAdmin: profiles.isAdmin })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);
  if (!p?.isAdmin) notFound();

  const sim = loadSimulation();
  const cycle0 = computeCycleZeroReach();

  return (
    <main className="mx-auto min-h-dvh w-full max-w-[720px] bg-white px-4 py-6 text-zinc-900 dark:bg-black dark:text-zinc-50">
      <header className="mb-5">
        <Link href="/" className="text-xs text-zinc-500">
          ← 홈
        </Link>
        <h1 className="mt-1 text-xl font-bold">⚖️ 강화 밸런스 리뷰</h1>
        <p className="mt-2 text-[12px] leading-relaxed text-zinc-500">
          운영자 전용. <code>lib/game/balance.ts</code>(단일 진실 원천)에서 직접 산출.
          공시(<Link href="/probability" className="underline">/probability</Link>)와 1:1.
        </p>
      </header>

      <section className="mb-6 rounded-lg border border-zinc-200 p-4 text-[12px] leading-relaxed dark:border-zinc-800">
        <h2 className="mb-2 text-sm font-bold">모델 요약</h2>
        <ul className="list-disc space-y-1 pl-5 text-zinc-600 dark:text-zinc-300">
          <li>
            사이클 = {CYCLE_LEN}단위. 사이클 내 ℓ(=L mod {CYCLE_LEN}) 기준으로 확률·기본 시간이
            정의되며, 사이클마다 시도 시간이 <b>{CYCLE_TIME_BASE}배</b>씩 증가(1배·2배·4배…).
            확률 곡선은 사이클마다 리셋 — +{CYCLE_LEN} = +0과 동일 공시값.
          </li>
          <li>
            3분기 outcome: <b>성공</b>(시간 비례 0→base) / <b>유지</b>(잔여) /{' '}
            <b>하락</b>(시간 무관 고정). 합 = 100%. 파괴 없음.
          </li>
          <li>
            안전 구간 ℓ 0~{SAFE_MAX_LEVEL} = 하락 0%. ℓ {SAFE_MAX_LEVEL + 1}~99 = 하락 발생, −1만
            떨어지며 <b>사이클 내 +{SAFE_MAX_LEVEL}</b>가 하한(사이클 경계 가로지름 없음).
          </li>
        </ul>
      </section>

      <Section title="1. 사이클 0 — 단계별 확률·시간·누적 도달 (full-wait)">
        <P>
          공시값(=full-wait)은 시간을 끝까지 기다렸을 때 도달하는 최대 성공률.
          early attempt 시 effective_success = base × elapsed/total로 선형 감소,
          잃은 만큼 <b>유지</b>로 이동(하락은 그대로).
        </P>
        <P>
          d(L) = 단일 시도 시간. <b>+0→+L 누적</b> = 평균 도달 시간(평균 재시도·하락 회복 포함, full-wait 가정).
        </P>
        <ProbabilityTable cycle={0} levels={LEVEL_SAMPLES_CYCLE_0} cycle0={cycle0} />
      </Section>

      <Section title="2. 단계별 누적 도달 시간 — 사이클 비교">
        <P>
          사이클마다 확률 곡선은 동일, 시도 시간만 ×{CYCLE_TIME_BASE}배 → 누적 도달도 정확히
          ×{CYCLE_TIME_BASE}배. 예: cycle0 +0→+99 ≈ {fmtDuration(cycle0.remainingMs[0]!)} →
          cycle1 +100→+199 ≈ {fmtDuration(cycle0.remainingMs[0]! * CYCLE_TIME_BASE)}.
        </P>
        <table className="w-full table-fixed text-[11px] tabular-nums">
          <thead>
            <tr className="text-left text-zinc-400">
              <th className="pb-1 font-medium">ℓ</th>
              <th className="pb-1 font-medium">cycle0 +0→+ℓ</th>
              <th className="pb-1 font-medium">cycle1 +100→+(100+ℓ)</th>
              <th className="pb-1 font-medium">cycle2 +200→+(200+ℓ)</th>
            </tr>
          </thead>
          <tbody>
            {CUM_REACH_SAMPLES.map((ℓ) => {
              const cReach0 = cycle0.remainingMs[0]! - cycle0.remainingMs[ℓ]!;
              return (
                <tr key={ℓ} className="border-t border-zinc-100 dark:border-zinc-900">
                  <Td>+{ℓ}</Td>
                  <Td>{fmtDuration(cReach0)}</Td>
                  <Td>{fmtDuration(cReach0 * CYCLE_TIME_BASE)}</Td>
                  <Td>{fmtDuration(cReach0 * CYCLE_TIME_BASE ** 2)}</Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>

      <Section title="3. 사이클 비교 — 단일 시도 시간">
        <P>
          확률 곡선은 사이클마다 리셋. <b>시도 시간만</b> {CYCLE_TIME_BASE}배씩 증가.
        </P>
        <table className="w-full table-fixed text-[11px] tabular-nums">
          <thead>
            <tr className="text-left text-zinc-400">
              <th className="pb-1 font-medium">ℓ</th>
              <th className="pb-1 font-medium">기본 d₀(ℓ)</th>
              <th className="pb-1 font-medium">사이클1 ×2</th>
              <th className="pb-1 font-medium">사이클2 ×4</th>
              <th className="pb-1 font-medium">사이클3 ×8</th>
            </tr>
          </thead>
          <tbody>
            {[0, 10, 30, 51, 60, 75, 90, 99].map((lv) => (
              <tr key={lv} className="border-t border-zinc-100 dark:border-zinc-900">
                <Td>+{lv}</Td>
                <Td>{fmtDuration(baseAttemptDurationMs(lv))}</Td>
                <Td>{fmtDuration(enhanceDurationMs(lv + CYCLE_LEN))}</Td>
                <Td>{fmtDuration(enhanceDurationMs(lv + 2 * CYCLE_LEN))}</Td>
                <Td>{fmtDuration(enhanceDurationMs(lv + 3 * CYCLE_LEN))}</Td>
              </tr>
            ))}
          </tbody>
        </table>
        <P className="mt-2 text-zinc-500">
          예: +152 = ℓ52 × 사이클1 → 시도 시간 {fmtDuration(enhanceDurationMs(152))}, 성공률{' '}
          {pct(baseSuccessRateBp(152))}, 하락 {pct(downRateBp(152))}, 유지{' '}
          {pct(10000 - baseSuccessRateBp(152) - downRateBp(152))} (full-wait).
        </P>
      </Section>

      <Section title="4. 사이클별 누적 도달 (스냅샷)">
        {sim ? (
          <>
            <P className="text-zinc-500">
              생성: {new Date(sim.generatedAt).toLocaleString('ko-KR')} ·{' '}
              {sim.mode === 'analytic-expected-value'
                ? '해석적 expected first-passage time'
                : `Monte Carlo trials=${sim.trialsPerTarget}회/타깃`}
            </P>
            <table className="w-full table-fixed text-[11px] tabular-nums">
              <thead>
                <tr className="text-left text-zinc-400">
                  <th className="pb-1 font-medium">도달</th>
                  <th className="pb-1 font-medium">평균</th>
                  {sim.mode !== 'analytic-expected-value' ? (
                    <>
                      <th className="pb-1 font-medium">p50</th>
                      <th className="pb-1 font-medium">p75</th>
                      <th className="pb-1 font-medium">p95</th>
                    </>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {sim.segments.map((s) => (
                  <tr key={s.target} className="border-t border-zinc-100 dark:border-zinc-900">
                    <Td>+{s.target}</Td>
                    <Td>{fmtDuration(s.meanMs)}</Td>
                    {sim.mode !== 'analytic-expected-value' ? (
                      <>
                        <Td>{fmtDuration(s.p50Ms)}</Td>
                        <Td>{fmtDuration(s.p75Ms)}</Td>
                        <Td>{fmtDuration(s.p95Ms)}</Td>
                      </>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
            <P className="mt-3">
              <b>앵커 확인</b> — 코드 목표:{' '}
              +30 = {fmtDuration(CUMULATIVE_REACH_ANCHORS_MS[30])}, +50 ={' '}
              {fmtDuration(CUMULATIVE_REACH_ANCHORS_MS[50])}, +99 ={' '}
              {fmtDuration(CUMULATIVE_REACH_ANCHORS_MS[99])} (≈ 2주).
              <br />
              시뮬 평균: +30 = {fmtDuration(sim.cumulativeAnchors['30'] ?? 0)}, +50 ={' '}
              {fmtDuration(sim.cumulativeAnchors['50'] ?? 0)}, +99 ={' '}
              {fmtDuration(sim.cumulativeAnchors['99'] ?? 0)}.
            </P>
            {sim.perCycleMeanMs.length > 1 ? (
              <P>
                <b>사이클별 평균 소요</b>:{' '}
                {sim.perCycleMeanMs.map((ms, i) => (
                  <span key={i}>
                    cycle{i} = {fmtDuration(ms)}
                    {i < sim.perCycleMeanMs.length - 1 ? ' / ' : ''}
                  </span>
                ))}
                <br />
                2배 가설 검증: cycle1/cycle0 ={' '}
                {sim.perCycleMeanMs[0] && sim.perCycleMeanMs[1]
                  ? (sim.perCycleMeanMs[1] / sim.perCycleMeanMs[0]).toFixed(2)
                  : '—'}
                ×, cycle2/cycle1 ={' '}
                {sim.perCycleMeanMs[1] && sim.perCycleMeanMs[2]
                  ? (sim.perCycleMeanMs[2] / sim.perCycleMeanMs[1]).toFixed(2)
                  : '—'}
                × (이론값 = 2.00×)
              </P>
            ) : null}
          </>
        ) : (
          <P className="text-amber-500">
            시뮬레이션 결과 파일 없음 — <code>bun run scripts/simulate-enhance.ts</code> 실행 후
            새로고침.
          </P>
        )}
      </Section>

      <p className="mt-8 text-[10px] leading-relaxed text-zinc-400 dark:text-zinc-500">
        본 페이지는 운영자 검증용. 사양 변경 시 BALANCE.md + balance.ts + 본 페이지가 자동으로 동기화됨
        (단일 소스). 누적 도달 시간 재생성:
        <code> bun run scripts/analyze-enhance.ts</code> (해석적, &lt;1s) /
        <code> bun run scripts/simulate-enhance.ts</code> (Monte Carlo, 분산 확인용).
      </p>
    </main>
  );
}

function ProbabilityTable({
  cycle,
  levels,
  cycle0,
}: {
  cycle: number;
  levels: number[];
  cycle0: ReturnType<typeof computeCycleZeroReach>;
}) {
  const offset = cycle * CYCLE_LEN;
  const totalT099 = cycle0.remainingMs[0]!;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] text-[11px] tabular-nums">
        <thead>
          <tr className="text-left text-zinc-400">
            <th className="pb-1 font-medium">L</th>
            <th className="pb-1 font-medium">성공 (max)</th>
            <th className="pb-1 font-medium">유지 (max-t)</th>
            <th className="pb-1 font-medium">하락 (고정)</th>
            <th className="pb-1 font-medium">d(L)</th>
            <th className="pb-1 font-medium">+0→+L 누적</th>
          </tr>
        </thead>
        <tbody>
          {levels.map((cl) => {
            const L = cl + offset;
            const base = baseSuccessRateBp(L);
            const down = downRateBp(L);
            const hold = 10000 - base - down;
            const cumMs = (totalT099 - cycle0.remainingMs[cl]!) * Math.pow(2, cycle);
            return (
              <tr key={L} className="border-t border-zinc-100 dark:border-zinc-900">
                <Td>+{L}</Td>
                <Td className="text-emerald-600 dark:text-emerald-400">{pct(base)}</Td>
                <Td className="text-zinc-500">{pct(hold)}</Td>
                <Td className={down > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-400'}>
                  {pct(down)}
                </Td>
                <Td>{fmtDuration(enhanceDurationMs(L))}</Td>
                <Td className="font-semibold">{fmtDuration(cumMs)}</Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-sm font-bold">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}
function P({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={`text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-300 ${className ?? ''}`}>
      {children}
    </p>
  );
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`py-1 text-zinc-700 dark:text-zinc-200 ${className ?? ''}`}>{children}</td>;
}

