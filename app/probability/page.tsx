import type { Metadata } from 'next';

import {
  baseSuccessRateBp,
  downRateBp,
  MEGA_OF_SUCCESS_BP,
  SAFE_MAX_LEVEL,
  CYCLE_LEN,
  CYCLE_TIME_BASE,
  MAX_TRANSCEND,
  transcendFodderForStep,
  transcendFodderCumulative,
  transcendBonusBp,
  enhanceBasePower,
  pieceCombatPower,
  DIAMOND_PER_DISENCHANT,
  RAID_OPEN_COST_DIAMOND,
  RAID_MAX_PARTICIPANTS,
  RAID_MAX_CONCURRENT_PER_USER,
  RAID_DAILY_CAP,
  RAID_WINDOW_MS,
  RAID_BASE_ATTACKS,
  raidExtraAttackCost,
  RAID_PHASE1_HP_MIN,
  RAID_PHASE1_HP_MAX,
  RAID_PHASE_HP_MULT,
  raidPhaseHp,
  RAID_CRIT_RATE_BP,
  RAID_CRIT_MULT,
  RAID_DAMAGE_VARIANCE,
  RAID_DAMAGE_K,
  RAID_PHASE_DROP_BOXES,
  GEM_TO_MS,
} from '@/lib/game/balance';
import { INVITE_DIAMOND_PER_REFERRAL, INVITE_BOX_PER_REFERRAL } from '@/lib/game/referral/stats';

export const metadata: Metadata = {
  title: '확률 공시 — 인생강화',
  description: '강화·초월·보급 확률 및 수치 공시 (게임산업법 §33 — 확률형 한정).',
};

const pct = (bp: number) => {
  const v = bp / 100;
  return Number.isInteger(v) ? `${v}%` : `${v.toFixed(2)}%`;
};

const ENH_SAMPLES = [0, 9, 10, 15, 20, 30, 40, 51, 52, 60, 75, 90, 99, 100, 152, 199, 200];
const TRANSCEND_SAMPLES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 15, 20];
const CP_SAMPLES = [0, 10, 30, 51, 99];
const PHASE_SAMPLES = [1, 2, 3, 4, 5];
const EXTRA_ATTACK_SAMPLES = [1, 10, 11, 20, 21, 30, 31, 40];

/** 확률 공시 — 공개 페이지. lib/game/balance.ts(단일 진실 원천)에서 직접 산출. */
export default function ProbabilityPage() {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-[390px] bg-white px-4 py-5 text-zinc-900 dark:bg-black dark:text-zinc-50">
      <header className="mb-4">
        <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
          게임산업진흥에 관한 법률 §33에 따른 공시입니다. 본 페이지의 모든 수치는 게임 내 판정
          로직과 1:1로 일치하며, 변경 시 24시간 전 사전 공지합니다.
        </p>
      </header>

      <Sec n="1" title="강화">
        <P>
          강화는 매 시도마다 네 결과로 분기됩니다 — <b>성공</b>(+1 단계) / <b>메가</b>(+2 단계) /{' '}
          <b>유지</b>(단계 변동 없음) / <b>하락</b>(−1 단계). 실제 성공률 = 공시 성공률 × (경과 시간
          ÷ 필요 시간)으로 시간에 비례해 오르며, 최대 대기 시 공시 성공률에 도달합니다. 공시
          성공률 안에서 <b>{pct(MEGA_OF_SUCCESS_BP)}는 메가</b>(+2)로 분리됩니다(예: 공시 70%
          중 메가 3.50% / 일반 성공 66.50%). <b>하락 확률은 시간에 무관하게 단계별로 고정</b>
          입니다(일찍 시도해도 하락 확률 동일, 잃은 성공 확률은 유지로 이동).
        </P>
        <P>
          강화는 {CYCLE_LEN}단위 <b>사이클</b>로 진행되며, 각 사이클마다 시도 시간이{' '}
          {CYCLE_TIME_BASE}배씩 늘어납니다(1배·2배·4배…). 확률 곡선은 사이클마다 동일하게
          반복됩니다(예: +100 = +0, +152 = +52의 확률).
        </P>
        <Table head={['단계', '성공(+1)', '메가(+2)', '하락(고정)', '유지(최대)']}>
          {ENH_SAMPLES.map((lv) => {
            const base = baseSuccessRateBp(lv);
            const mega = Math.floor((base * MEGA_OF_SUCCESS_BP) / 10000);
            const success = base - mega;
            const down = downRateBp(lv);
            const hold = 10000 - base - down;
            return (
              <tr key={lv} className="border-t border-zinc-100 dark:border-zinc-900">
                <Td>+{lv}</Td>
                <Td>{pct(success)}</Td>
                <Td>{pct(mega)}</Td>
                <Td>{pct(down)}</Td>
                <Td>{pct(hold)}</Td>
              </tr>
            );
          })}
        </Table>
        <P>
          사이클 내 +0~+{SAFE_MAX_LEVEL}(예: +0~+{SAFE_MAX_LEVEL}, +100~+{100 + SAFE_MAX_LEVEL}):
          하락 0%. +{SAFE_MAX_LEVEL + 1}부터: 하락 확률 발생, 1단계 하락(사이클 내 +
          {SAFE_MAX_LEVEL} 하한 — 사이클 경계 가로지름 없음).
        </P>
      </Sec>

      <Sec n="2" title="초월">
        <P>
          초월은 같은 종류 장비를 제물로 소모해 전투력 배수를 올립니다. <b>상한 없이 무한
          진행</b>되며, T단계 달성에 제물 <b>T개</b>가 필요합니다(선형). 제물은 강화·초월 레벨과
          무관합니다. 전투력 보너스는 T{MAX_TRANSCEND}에서 +100%이고, T{MAX_TRANSCEND + 1}부터
          레벨당 +10%p씩 증가합니다.
        </P>
        <Table head={['초월', '필요 제물', '누적 제물', '전투력 보너스']}>
          {TRANSCEND_SAMPLES.map((t) => (
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
          전투력 = 보유한 모든 카탈로그 아이템(중복 제외)의 개별 전투력 합 — 착용 여부 무관.
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
          (보급 열기 자체에는 확률형 보상 없음 — 균등 당첨 외 추가 추첨 없음.)
        </P>
      </Sec>

      <Sec n="5" title="레이드">
        <P>
          개설 비용 {RAID_OPEN_COST_DIAMOND.toLocaleString('ko-KR')}다이아 / 인원 최대{' '}
          {RAID_MAX_PARTICIPANTS}명(호스트 포함) / 동시 진행 1인 최대{' '}
          {RAID_MAX_CONCURRENT_PER_USER}건 / 1일 {RAID_DAILY_CAP}건 / 공격창{' '}
          {Math.round(RAID_WINDOW_MS / 3_600_000)}시간 / 참여자당 기본 {RAID_BASE_ATTACKS}회 공격.
        </P>
        <P>
          페이즈 1 HP는 [{RAID_PHASE1_HP_MIN.toLocaleString('ko-KR')},{' '}
          {RAID_PHASE1_HP_MAX.toLocaleString('ko-KR')}] 균등 추첨. 이후 페이즈 HP = 페이즈 1 ×{' '}
          {RAID_PHASE_HP_MULT}^(n−1).
        </P>
        <Table head={['페이즈', 'HP (최소)', 'HP (최대)']}>
          {PHASE_SAMPLES.map((n) => (
            <tr key={n} className="border-t border-zinc-100 dark:border-zinc-900">
              <Td>P{n}</Td>
              <Td>{raidPhaseHp(RAID_PHASE1_HP_MIN, n).toLocaleString('ko-KR')}</Td>
              <Td>{raidPhaseHp(RAID_PHASE1_HP_MAX, n).toLocaleString('ko-KR')}</Td>
            </tr>
          ))}
        </Table>
        <P>
          데미지 = round(총전투력 × {RAID_DAMAGE_K} × 분산계수 × 크리배수). 분산계수는 [
          {1 - RAID_DAMAGE_VARIANCE}, {1 + RAID_DAMAGE_VARIANCE}] 균등(±
          {Math.round(RAID_DAMAGE_VARIANCE * 100)}%). 크리티컬 {pct(RAID_CRIT_RATE_BP)} 확률로 ×
          {RAID_CRIT_MULT}. 미스 없음 · 데미지 캡 없음.
        </P>
        <Table head={['n번째 추가 공격', '비용(다이아)']}>
          {EXTRA_ATTACK_SAMPLES.map((n) => (
            <tr key={n} className="border-t border-zinc-100 dark:border-zinc-900">
              <Td>{n}번째</Td>
              <Td>{raidExtraAttackCost(n).toLocaleString('ko-KR')}</Td>
            </tr>
          ))}
        </Table>
        <P>
          추가 공격 비용 = 50 × ⌈n/10⌉ 다이아 (10번 단위 계단). 보상: 페이즈 돌파마다 참여 전원에게
          보급 상자 {RAID_PHASE_DROP_BOXES}개 — 슬롯 무작위(무기/방어구/장신구 각 1/3 균등). 다이아 드롭 없음.
        </P>
      </Sec>

      <Sec n="6" title="경제·기타">
        <P>
          강화 시간 단축: 다이아 1개당 {Math.round(GEM_TO_MS / 60_000)}분 단축(등록 시점 환산률
          영구 고정 — 진행 중 작업에 소급 적용 없음).
        </P>
        <P>
          친구 초대: 공유 링크로 신규 가입 전환 시 공유자에게 💎{INVITE_DIAMOND_PER_REFERRAL} +
          보급상자 {INVITE_BOX_PER_REFERRAL}개(무기·방어구·장신구 각 1개) 지급.
        </P>
      </Sec>

      <p className="mt-6 text-[10px] leading-relaxed text-zinc-400 dark:text-zinc-500">
        본 공시의 모든 수치는 <code>lib/game/balance.ts</code>(단일 진실 원천)에서 직접 산출되어
        게임 내 판정 로직과 1:1 일치합니다. 사양 변경 시 24시간 이전 사전 공지.
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
