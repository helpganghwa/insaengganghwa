import type { Metadata } from 'next';

import { BackBar } from '@/components/BackNav';

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
} from '@/lib/game/balance';
import { getActiveCatalog } from '@/lib/game/catalog';
import { CATALOG_ITEMS } from '@/lib/game/equipment/catalog';

export const dynamic = 'force-dynamic';

const SLOT_KO: Record<'weapon' | 'armor' | 'accessory', string> = {
  weapon: '무기',
  armor: '방어구',
  accessory: '장신구',
};

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

/** 확률 공시 — 공개 페이지. 수치는 lib/game/balance.ts, 보급 목록은 실제 추첨 풀(catalog_items active)에서 산출. */
export default async function ProbabilityPage() {
  // 보급 균등 추첨 풀 — 실제 판정과 동일(슬롯별 active 카탈로그, 각 1/N). DB 실패 시 코드 카탈로그 폴백.
  const bySlot: Record<'weapon' | 'armor' | 'accessory', string[]> = {
    weapon: [],
    armor: [],
    accessory: [],
  };
  try {
    // §11.5 — 공개 페이지가 매 요청 DB를 치지 않도록 공용 카탈로그 캐시(10분) 재사용.
    // 판정 풀(open.ts)과 동일 소스(active=true)라 공시-판정 일치 유지.
    const active = await getActiveCatalog();
    for (const c of active) bySlot[c.slot as 'weapon' | 'armor' | 'accessory'].push(c.name);
    for (const k of Object.keys(bySlot) as (keyof typeof bySlot)[])
      bySlot[k].sort((a, b) => a.localeCompare(b, 'ko'));
  } catch {
    for (const c of CATALOG_ITEMS) bySlot[c.slot].push(c.nameKo);
    for (const k of Object.keys(bySlot) as (keyof typeof bySlot)[])
      bySlot[k].sort((a, b) => a.localeCompare(b, 'ko'));
  }
  // 각 아이템 당첨 확률 = 1/N → bp = 10000/N.
  const supplyProbBp = (n: number) => (n > 0 ? Math.round((10000 / n) * 100) / 100 : 0);

  return (
    <main className="mx-auto min-h-dvh w-full max-w-[390px] bg-white px-4 py-5 text-zinc-900 dark:bg-black dark:text-zinc-50">
      <BackBar title="확률 공시" />
      <header className="mb-4">
        <h1 className="text-lg font-extrabold">확률 공시</h1>
      </header>

      <Sec n="1" title="강화" id="enhance">
        <P>
          강화는 한 번 시도할 때마다 네 가지 결과 중 하나가 나옵니다 — <b>성공</b>(한 단계 ↑) ·{' '}
          <b>메가</b>(두 단계 ↑) · <b>유지</b>(그대로) · <b>하락</b>(한 단계 ↓). 오래 기다릴수록
          성공 확률이 점점 올라가, 필요 시간을 꽉 채우면 아래 표의 공시 성공률에 도달합니다(실제
          성공률 = 공시 성공률 × 기다린 시간 ÷ 필요 시간). 성공분 중 일부(
          {pct(MEGA_OF_SUCCESS_BP)})는 한 번에 두 단계 오르는 <b>메가</b>로 나옵니다 — 예를 들어
          공시 70%면 메가 3.50% · 일반 성공 66.50%. <b>하락 확률은 기다린 시간과 상관없이 단계마다
          고정</b>이라, 일찍 시도해도 하락 확률은 같고 줄어든 성공분만큼 ‘유지’로 갑니다.
        </P>
        <P>
          강화는 {CYCLE_LEN}단계를 한 <b>주기</b>로 반복합니다. 주기가 올라갈 때마다 한 번 시도에
          드는 시간이 {CYCLE_TIME_BASE}배로 늘어나고(1배 → 2배 → 4배…), 확률 곡선은 주기마다 똑같이
          반복됩니다(예: +100의 확률 = +0의 확률, +152 = +52).
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
          한 주기의 앞부분 +0~+{SAFE_MAX_LEVEL}(예: +0~+{SAFE_MAX_LEVEL}, +100~+
          {100 + SAFE_MAX_LEVEL})은 <b>하락이 없습니다(0%)</b>. +{SAFE_MAX_LEVEL + 1}부터 하락이
          생기며, 하락하더라도 그 주기의 +{SAFE_MAX_LEVEL}까지만 내려갑니다(주기 경계를 넘어 떨어지지
          않음).
        </P>
      </Sec>

      <Sec n="2" title="초월" id="transcend">
        <P>
          초월은 <b>같은 아이템을 보급 상자로 또 얻으면 자동으로</b> 올라갑니다. T단계까지 가려면 그
          아이템 중복이 <b>T개</b> 필요하고(T1=1개, T2=2개…), <b>상한 없이 끝없이</b> 올릴 수
          있습니다. 전투력 보너스는 T{MAX_TRANSCEND}에서 +100%이고, 그 위로는 한 단계마다 +10%p씩
          더 붙습니다.
        </P>
        <Table head={['초월', '필요 중복', '누적 중복', '전투력 보너스']}>
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

      <Sec n="3" title="전투력" id="combat">
        <P>
          강화 레벨이 오를수록 전투력이 점점 빠르게 늘어납니다. 아이템 하나의 전투력은 기반 전투력에
          초월 보너스를 곱한 값이고, <b>총 전투력은 가진 모든 아이템(중복 제외) 전투력의 합</b>
          입니다 — <b>착용하지 않아도</b> 보유만 하면 합산됩니다.
        </P>
        <p className="text-[10px] leading-relaxed text-zinc-400">
          정확한 식: 기반 전투력 = round(10 × (1+강화레벨)^1.5), 아이템 전투력 = 기반 × (1 + 초월
          보너스).
        </p>
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

      <Sec n="4" title="보급 (보급 상자)" id="supply">
        <P>
          보급 상자를 열면 그 슬롯의 활성 아이템 중 <b>하나가 똑같은 확률로</b> 나옵니다(각 아이템
          당첨 확률 = 1 ÷ 슬롯 활성 아이템 수). 아래는 슬롯별 전체 아이템과 당첨 확률입니다.
        </P>
        <P>
          아직 없는 아이템이면 새로 <b>획득(도감 해금)</b>되고, 이미 있는 아이템이면 그 아이템의{' '}
          <b>초월 진행도</b>로 쌓입니다. 상자 열기에는 이 균등 추첨 외에 숨은 추가 확률이 없습니다.
        </P>
        {(['weapon', 'armor', 'accessory'] as const).map((s) => {
          const items = bySlot[s];
          const p = pct(supplyProbBp(items.length));
          return (
            <div key={s}>
              <h3 className="mb-1 mt-2 text-[12px] font-bold">
                {SLOT_KO[s]} — {items.length}종 · 각 {p}
              </h3>
              <ul className="tabular-nums text-[11px]">
                {items.map((name) => (
                  <li
                    key={name}
                    className="flex items-baseline justify-between gap-2 border-t border-zinc-100 py-0.5 dark:border-zinc-900"
                  >
                    <span className="min-w-0 flex-1 break-keep text-zinc-700 dark:text-zinc-200">
                      {name}
                    </span>
                    <span className="shrink-0 text-zinc-500">{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </Sec>

      <Sec n="5" title="레이드" id="raid">
        <P>
          소환 비용 {RAID_OPEN_COST_DIAMOND.toLocaleString('ko-KR')}다이아 / 인원 최대{' '}
          {RAID_MAX_PARTICIPANTS}명(호스트 포함) / 동시 진행 1인 최대{' '}
          {RAID_MAX_CONCURRENT_PER_USER}건 / 1일 {RAID_DAILY_CAP}건 / 공격창{' '}
          {Math.round(RAID_WINDOW_MS / 3_600_000)}시간 / 참여자당 기본 {RAID_BASE_ATTACKS}회 공격.
        </P>
        <P>
          페이즈 1의 보스 체력은 {RAID_PHASE1_HP_MIN.toLocaleString('ko-KR')} ~{' '}
          {RAID_PHASE1_HP_MAX.toLocaleString('ko-KR')} 사이에서 고르게 정해지고, 페이즈가 올라갈
          때마다 체력이 {RAID_PHASE_HP_MULT}배씩 커집니다.
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
          한 번 공격의 데미지 = 총 전투력 × {RAID_DAMAGE_K} × 분산 × 크리. <b>분산</b>은 매 공격마다 ±
          {Math.round(RAID_DAMAGE_VARIANCE * 100)}% 범위에서 고르게 정해지고,{' '}
          <b>{pct(RAID_CRIT_RATE_BP)}</b> 확률로 <b>크리티컬({RAID_CRIT_MULT}배)</b>이 터집니다.
          빗나감(미스)이나 데미지 상한은 없습니다.
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
          추가 공격 비용은 10번마다 한 칸씩 오릅니다({raidExtraAttackCost(1)} × ⌈횟수÷10⌉ 다이아).
          보상은 페이즈를 하나 깰 때마다 참여자 <b>전원</b>에게 보급 상자 {RAID_PHASE_DROP_BOXES}개
          — 무기·방어구·장신구 중 무작위(각 1/3). 다이아는 드롭되지 않습니다.
        </P>
      </Sec>

    </main>
  );
}

function Sec({
  n,
  title,
  id,
  children,
}: {
  n: string;
  title: string;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mb-5 scroll-mt-4">
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
