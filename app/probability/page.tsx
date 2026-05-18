import Link from 'next/link';
import type { Metadata } from 'next';

import {
  baseSuccessRateBp,
  SAFE_MAX_LEVEL,
  FODDER_REQUIRED_FROM_LEVEL,
  FODDER_PER_ATTEMPT,
  CUMULATIVE_REACH_ANCHORS_MS,
  MAX_TRANSCEND,
  transcendFodderForStep,
  transcendFodderCumulative,
  transcendBonusBp,
  enhanceBasePower,
  pieceCombatPower,
  CODEX_BONUS_COEFF,
  GEM_DROP_ON_OPEN_RATE_BP,
  GEM_DROP_MIN,
  GEM_DROP_MAX,
  DIAMOND_PER_DISENCHANT,
  RAID_CRIT_RATE_BP,
  RAID_CRIT_MULT,
  RAID_DAMAGE_VARIANCE,
  RAID_PHASE_HP_MULT,
  RAID_BASE_ATTACKS,
  raidExtraAttackCost,
  RAID_PHASE_DROP_DIAMOND_RATE_BP,
  GEM_TO_MS,
  SHARE_DAILY_REWARD_DIAMOND,
  REFERRAL_CONVERSION_DIAMOND,
  AD_DAILY_CAP,
} from '@/lib/game/balance';

export const metadata: Metadata = {
  title: '확률 공시 — 인생강화',
  description: '강화·초월·보급·레이드 확률 및 수치 공시 (게임산업법 §33).',
};

const pct = (bp: number) => {
  const v = bp / 100;
  return Number.isInteger(v) ? `${v}%` : `${v.toFixed(2)}%`;
};
const dur = (ms: number) => {
  const h = ms / 3_600_000;
  if (h >= 24) return `약 ${Math.round(h / 24)}일`;
  return `약 ${Math.round(h)}시간`;
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
          게임산업진흥에 관한 법률 §33에 따른 공시입니다. 본 페이지의 모든 수치는 게임 내
          판정 로직과 1:1로 일치하며, 변경 시 24시간 전 사전 공지합니다.
        </p>
      </header>

      <Sec n="1" title="강화">
        <P>
          강화는 시간이 흐를수록 성공 확률이 오릅니다. 실제 성공률 = 공시 성공률 ×
          (경과 시간 ÷ 필요 시간), 최대 대기 시 공시 성공률에 도달합니다. 모든 장비·슬롯
          동일 곡선이며 등급·베이스 차등이 없습니다.
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
          +0~+{SAFE_MAX_LEVEL}: 실패해도 단계 유지(안전 구간). +{SAFE_MAX_LEVEL + 1}부터:
          실패 시 1단계 하락(하한 +{SAFE_MAX_LEVEL}). <b>장비 파괴 없음</b>(개념 미도입). +
          {FODDER_REQUIRED_FROM_LEVEL}강 시도부터 매 시도 같은 종류 장비 {FODDER_PER_ATTEMPT}
          개를 제물로 소모합니다.
        </P>
        <P>
          최대 대기 기준 누적 도달 평균:
          {Object.entries(CUMULATIVE_REACH_ANCHORS_MS).map(([lv, ms]) => (
            <span key={lv}> +{lv} {dur(ms as number)} ·</span>
          ))}{' '}
          (단계별 실제 시간은 게임 내 표기).
        </P>
      </Sec>

      <Sec n="2" title="초월">
        <P>
          초월은 같은 종류 장비를 제물로 소모해 전투력 배수를 올립니다(최대 T
          {MAX_TRANSCEND}). 제물은 강화·초월 레벨과 무관합니다.
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
          기반 전투력 P = round(10 × (1+강화레벨)^1.5). 개별 장비 전투력 = P × (1 + 초월
          보너스). 총 전투력 = (착용 3장비 합) × (1 + 도감 강화합 ×{' '}
          {CODEX_BONUS_COEFF}).
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
          슬롯 보급 상자 내 각 아이템 당첨 확률 = 1 ÷ (해당 슬롯 활성 아이템 종 수)로
          균등합니다. <b>천장(보장) 없음.</b> 활성 종 수는 게임 내에 표기됩니다.
        </P>
        <P>
          개봉 시 {pct(GEM_DROP_ON_OPEN_RATE_BP)} 확률로 다이아 {GEM_DROP_MIN}~
          {GEM_DROP_MAX}개 추가 획득. 분해 시 강화·초월 무관 다이아{' '}
          {DIAMOND_PER_DISENCHANT}개 고정.
        </P>
      </Sec>

      <Sec n="5" title="레이드">
        <P>
          공격 데미지 = 총 전투력 기반, 분산 ±{Math.round(RAID_DAMAGE_VARIANCE * 100)}%(미스
          없음). 치명타 {pct(RAID_CRIT_RATE_BP)} 확률로 ×{RAID_CRIT_MULT}. 페이즈마다 보스
          HP ×{RAID_PHASE_HP_MULT}.
        </P>
        <P>
          참여자당 기본 공격 {RAID_BASE_ATTACKS}회. 추가 공격 n회차 비용 ={' '}
          {raidExtraAttackCost(1)}, {raidExtraAttackCost(2)}, {raidExtraAttackCost(3)} …
          다이아(50 + 10×(n−1)). 보상은 1회 이상 공격한 전원 동일 — 페이즈 돌파마다 1회
          추첨({pct(RAID_PHASE_DROP_DIAMOND_RATE_BP)} 다이아 / 나머지 슬롯 랜덤 보급 상자).
        </P>
      </Sec>

      <Sec n="6" title="재화 / 보상">
        <P>
          다이아 ≡ 보석(단일 프리미엄 재화). 강화 시간 단축 환산: 1 다이아 ={' '}
          {GEM_TO_MS / 60000}분(등록 시점 값 영구 적용). 공유 보상: 하루 1회 다이아{' '}
          {SHARE_DAILY_REWARD_DIAMOND}, 가입 전환 시 공유자 +{REFERRAL_CONVERSION_DIAMOND}.
          광고 보상: 하루 {AD_DAILY_CAP}회, 1회 = 슬롯 랜덤 보급 상자.
        </P>
      </Sec>

      <p className="mt-6 border-t border-zinc-100 pt-3 text-[10px] text-zinc-400 dark:border-zinc-900">
        본 공시는 현행 빌드 기준입니다. 보호·축복 등 일회용 안전망 아이템은 제공하지 않습니다
        (의도된 설계).
      </p>
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
