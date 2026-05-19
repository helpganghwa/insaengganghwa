import Link from 'next/link';
import type { Metadata } from 'next';

import {
  baseSuccessRateBp,
  SAFE_MAX_LEVEL,
  FODDER_REQUIRED_FROM_LEVEL,
  FODDER_PER_ATTEMPT,
  MAX_TRANSCEND,
  transcendFodderForStep,
  transcendFodderCumulative,
  transcendBonusBp,
  enhanceBasePower,
  pieceCombatPower,
  CODEX_BONUS_COEFF,
  DIAMOND_PER_DISENCHANT,
} from '@/lib/game/balance';

export const metadata: Metadata = {
  title: '확률 공시 — 인생강화',
  description: '강화·초월·보급 확률 및 수치 공시 (게임산업법 §33 — 확률형 한정).',
};

const pct = (bp: number) => {
  const v = bp / 100;
  return Number.isInteger(v) ? `${v}%` : `${v.toFixed(2)}%`;
};

const ENH_SAMPLES = [0, 9, 10, 15, 20, 30, 40, 51, 52, 60, 75, 90, 99, 100];
const CP_SAMPLES = [0, 10, 30, 51, 99];

/** 확률 공시 — 공개 페이지. lib/game/balance.ts(단일 진실 원천)에서 직접 산출. */
export default function ProbabilityPage() {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-[390px] bg-white px-4 py-5 text-zinc-900 dark:bg-black dark:text-zinc-50">
      <header className="mb-4">
        <Link href="/" className="text-xs text-zinc-500">
          ← 인생강화
        </Link>
        <h1 className="mt-1 text-lg font-bold">📜 확률 공시</h1>
        <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
          게임산업진흥에 관한 법률 §33에 따른 공시입니다. 본 페이지의 모든 수치는 게임 내 판정
          로직과 1:1로 일치하며, 변경 시 24시간 전 사전 공지합니다.
        </p>
      </header>

      <Sec n="1" title="강화">
        <P>
          강화는 시간이 흐를수록 성공 확률이 오릅니다. 실제 성공률 = 공시 성공률 × (경과 시간 ÷ 필요
          시간), 최대 대기 시 공시 성공률에 도달합니다.
        </P>
        <Table head={['강화 단계', '공시 성공률', '실패 결과']}>
          {ENH_SAMPLES.map((lv) => (
            <tr key={lv} className="border-t border-zinc-100 dark:border-zinc-900">
              <Td>+{lv}</Td>
              <Td>{pct(baseSuccessRateBp(lv))}</Td>
              <Td>{lv > SAFE_MAX_LEVEL ? '−1 하락' : '유지(안전)'}</Td>
            </tr>
          ))}
        </Table>
        <P>
          +0~+{SAFE_MAX_LEVEL}: 실패해도 단계 유지(안전 구간). +{SAFE_MAX_LEVEL + 1}부터: 실패 시
          1단계 하락(하한 +{SAFE_MAX_LEVEL}).+
          {FODDER_REQUIRED_FROM_LEVEL}강 시도부터 매 시도 같은 종류 장비 {FODDER_PER_ATTEMPT}
          개를 제물로 소모합니다.
        </P>
      </Sec>

      <Sec n="2" title="초월">
        <P>
          초월은 같은 종류 장비를 제물로 소모해 전투력 배수를 올립니다(최대 T{MAX_TRANSCEND}).
          제물은 강화·초월 레벨과 무관합니다.
        </P>
        <Table head={['초월', '필요 제물', '누적 제물', '전투력 보너스']}>
          {Array.from({ length: MAX_TRANSCEND }, (_, i) => i + 1).map((t) => (
            <tr key={t} className="border-t border-zinc-100 dark:border-zinc-900">
              <Td>T{t}</Td>
              <Td>{transcendFodderForStep(t)}</Td>
              <Td>{transcendFodderCumulative(t)}</Td>
              <Td>+{pct(transcendBonusBp(t))}</Td>
            </tr>
          ))}
        </Table>
      </Sec>

      <Sec n="3" title="전투력">
        <P>
          기반 전투력 P = round(10 × (1+강화레벨)^1.5). 개별 장비 전투력 = P × (1 + 초월 보너스). 총
          전투력 = (착용 3장비 합) × (1 + 도감 강화합 × {CODEX_BONUS_COEFF}).
        </P>
        <Table head={['강화', '기반 전투력', 'T10 적용']}>
          {CP_SAMPLES.map((lv) => (
            <tr key={lv} className="border-t border-zinc-100 dark:border-zinc-900">
              <Td>+{lv}</Td>
              <Td>{enhanceBasePower(lv).toLocaleString('ko-KR')}</Td>
              <Td>{pieceCombatPower(lv, MAX_TRANSCEND).toLocaleString('ko-KR')}</Td>
            </tr>
          ))}
        </Table>
      </Sec>

      <Sec n="4" title="보급 (보급 상자)">
        <P>
          슬롯 보급 상자 내 각 아이템 당첨 확률 = 1 ÷ (해당 슬롯 활성 아이템 종 수)로 균등합니다.{' '}
          활성 종류 수는 게임 내에 표기됩니다.
        </P>
        <P>
          분해 시 강화·초월 레벨과 무관하게 다이아 {DIAMOND_PER_DISENCHANT}개 고정 지급.
          (보급 개봉 자체에는 확률형 보상 없음 — 균등 당첨 외 추가 추첨 없음.)
        </P>
      </Sec>
    </main>
  );
}

function Sec({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <h2 className="mb-1.5 text-sm font-bold">
        §{n}. {title}
      </h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}
function P({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-300">{children}</p>;
}
function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <table className="w-full table-fixed text-[11px] tabular-nums">
      <thead>
        <tr className="text-left text-zinc-400">
          {head.map((h) => (
            <th key={h} className="pb-1 font-medium">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="py-1 text-zinc-700 dark:text-zinc-200">{children}</td>;
}
