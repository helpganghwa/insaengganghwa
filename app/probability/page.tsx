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
  EXPEDITION_MAIN_ROLL_BP,
  EXPEDITION_BASE_AMOUNTS,
  EXPEDITION_CRIT_BP,
  EXPEDITION_CRIT_SUM_BP_MAX,
  EXPEDITION_CRIT_MULT,
  EXPEDITION_DURATIONS_H,
  EXPEDITION_DURATION_SCALE,
  EXPEDITION_XP_RANGE_BY_HOURS,
  EXPEDITION_LEVEL_MAX,
  EXPEDITION_CRIT_BP_PER_LEVEL,
  expeditionCritBp,
  EXPEDITION_SYNERGY_MATCH_MULT,
  EXPEDITION_SYNERGY_GENERAL_MULT,
  EXPEDITION_DIFFICULTY_DIST_BP,
  EXPEDITION_DIFFICULTY_LABEL,
  EXPEDITION_DIFFICULTY_HOURS,
  EXPEDITION_DIFFICULTIES,
  EXPEDITION_REGIONS,
  EXPEDITION_AS_MULT_COEF,
  EXPEDITION_AS_MULT_EXP,
  expeditionAsBonusBp,
} from '@/lib/game/balance';
import { getActiveCatalog } from '@/lib/game/catalog';

// 정적화 시도·기각(2026-08-06 감사): revalidate=600을 넣어도 루트 generateViewport가
// headers()(폴더블 Sec-CH-UA-Model 판별)를 읽어 **전 라우트가 구조적으로 동적**이라 무효
// (빌드 산출 ƒ 확인). 뷰포트 시스템은 검증된 설계라 유지 — 데이터는 getActiveCatalog 600s
// 캐시가 이미 DB 왕복을 막고 있어 함수 기동 비용만 남는다.
export const dynamic = 'force-dynamic';

const SLOT_KO: Record<'weapon' | 'armor' | 'accessory', string> = {
  weapon: '무기',
  armor: '방어구',
  accessory: '장신구',
};

export const metadata: Metadata = {
  title: '확률 공시',
  description: '강화·초월·보급 확률 및 수치 공시 (게임산업법 §33 — 확률형 한정).',
};

const pct = (bp: number) => {
  const v = bp / 100;
  return Number.isInteger(v) ? `${v}%` : `${v.toFixed(2)}%`;
};

// 전 단계 공시(전수 감사 2026-08-21) — 표본 공시는 앵커 사이 보간 규칙을 유저가 산출할 수
// 없어 §33 취지에 미달한다. 순수 상수 렌더라 비용 0(사이클 반복 구간은 0~99 + 대표 사이클).
const ENH_SAMPLES = Array.from({ length: 201 }, (_, i) => i);
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
    // 폴백으로 숫자를 공시하지 않는다(전수 감사 2026-08-21) — 코드 배열은 DB active 집합과
    // 다를 수 있어(무기 교체 등) 틀린 확률(1/40 vs 실제 1/34)을 조용히 공시하게 된다.
    // 빈 상태로 두면 아래 렌더가 "일시적으로 표시할 수 없음"으로 안내한다.
  }
  // 각 아이템 당첨 확률 = 1/N → bp = 10000/N.
  const supplyProbBp = (n: number) => (n > 0 ? Math.round((10000 / n) * 100) / 100 : 0);

  return (
    <main className="pc-column-edge mx-auto min-h-dvh w-full max-w-[390px] bg-white px-4 py-5 text-zinc-900 dark:bg-black dark:text-zinc-50">
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
        {bySlot.weapon.length === 0 && (
          <P>
            아이템 목록을 일시적으로 표시할 수 없습니다. 잠시 후 새로고침해 주세요 — 실제 개봉
            판정은 이 페이지와 무관하게 정상 동작합니다.
          </P>
        )}
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
          보상은 페이즈를 하나 깰 때마다 <b>1회 이상 공격한</b> 참여자 전원에게 보급 상자 {RAID_PHASE_DROP_BOXES}개
          — 무기·방어구·장신구 중 무작위(각 1/3). 다이아는 드롭되지 않습니다.
        </P>
      </Sec>

      {/* 파견(v1) — EXPEDITION_* 상수와 1:1(§33). 판정 시점(오퍼 생성 롤·수령은 대성공만)과
          난이도 출현 분포까지 공시(적대 검수 2026-08-25 발견 1·2 반영). */}
      <Sec n="6" title="파견" id="expedition">
        <P>
          파견 보상은 <b>미션이 열리는 순간(생성·새로고침 시)</b> 아래 셋 중 하나로 확정 추첨되어
          카드에 그대로 표시됩니다 — 수령 시점의 추첨은 대성공 판정 하나뿐입니다. 아래 수량은
          기본값이며 난이도(시간)별 배율을 곱합니다(슬롯당 하루 1회, 
          {EXPEDITION_DURATIONS_H.map((h) => `${h}h ×${EXPEDITION_DURATION_SCALE[h]}`).join(' / ')}). 파견 경험치도
          미션이 열릴 때 시간별 구간에서 균등 추첨되어 카드에 확정 표기됩니다(
          {EXPEDITION_DURATIONS_H.map((h) => `${h}h ${EXPEDITION_XP_RANGE_BY_HOURS[h][0]}~${EXPEDITION_XP_RANGE_BY_HOURS[h][1]}`).join(' / ')}; 대성공은 경험치에 적용되지 않습니다).
        </P>
        <Table head={['본상', '확률', '기본 수량(배율 전)']}>
          <tr className="border-t border-zinc-100 dark:border-zinc-900">
            <Td>보급 상자만</Td>
            <Td>{pct(EXPEDITION_MAIN_ROLL_BP.boxOnly)}</Td>
            <Td>{EXPEDITION_BASE_AMOUNTS.boxOnly.boxMin}~{EXPEDITION_BASE_AMOUNTS.boxOnly.boxMax}개</Td>
          </tr>
          <tr className="border-t border-zinc-100 dark:border-zinc-900">
            <Td>다이아만</Td>
            <Td>{pct(EXPEDITION_MAIN_ROLL_BP.diamondOnly)}</Td>
            <Td>{EXPEDITION_BASE_AMOUNTS.diamondOnly.diaMin}~{EXPEDITION_BASE_AMOUNTS.diamondOnly.diaMax}</Td>
          </tr>
          <tr className="border-t border-zinc-100 dark:border-zinc-900">
            <Td>상자 + 다이아</Td>
            <Td>{pct(EXPEDITION_MAIN_ROLL_BP.both)}</Td>
            <Td>
              상자 {EXPEDITION_BASE_AMOUNTS.both.boxMin}~{EXPEDITION_BASE_AMOUNTS.both.boxMax}개 + 다이아{' '}
              {EXPEDITION_BASE_AMOUNTS.both.diaMin}~{EXPEDITION_BASE_AMOUNTS.both.diaMax}
            </Td>
          </tr>
        </Table>
        <P>
          수량은 표기 범위에서 고르게 정해집니다. 상자 종류(무기·방어구·장신구)는 파견지와 무관하게
          균등(각 1/3)입니다. 수령 시 <b>{pct(EXPEDITION_CRIT_BP)}</b> 확률로 <b>대성공</b>이 터져 수량이{' '}
          {EXPEDITION_CRIT_MULT}배가 됩니다. 대성공 확률은 파견 레벨당 +{EXPEDITION_CRIT_BP_PER_LEVEL / 100}%p, 계정
          합산 강화 1,000당 +1%p(최대 +{EXPEDITION_CRIT_SUM_BP_MAX / 100}%p) 올라 상한은{' '}
          {pct(expeditionCritBp(EXPEDITION_LEVEL_MAX, 100000))}입니다.
        </P>
        <P>
          미션의 지역은 {EXPEDITION_REGIONS.length}곳 중 균등 추첨되고, 난이도 출현 확률은 파견
          레벨 구간에 따라 다릅니다. 새로고침(무료 소진 후 유료)은 지역·난이도·보상을 전부 다시
          추첨합니다.
        </P>
        <Table head={['파견 레벨', ...EXPEDITION_DIFFICULTIES.map((d) => `${EXPEDITION_DIFFICULTY_LABEL[d]}(${EXPEDITION_DIFFICULTY_HOURS[d]}h)`)]}>
          {[...EXPEDITION_DIFFICULTY_DIST_BP]
            .sort((a, b) => a.minLevel - b.minLevel)
            .map((b, i, arr) => (
              <tr key={b.minLevel} className="border-t border-zinc-100 dark:border-zinc-900">
                <Td>
                  Lv.{b.minLevel}
                  {i + 1 < arr.length ? `~${arr[i + 1]!.minLevel - 1}` : '+'}
                </Td>
                {EXPEDITION_DIFFICULTIES.map((d) => (
                  <Td key={d}>{pct(b.dist[d])}</Td>
                ))}
              </tr>
            ))}
        </Table>
        <P>
          아바타 지역 시너지(파견지와 지역이 같은 장비의 강화 레벨 ×{EXPEDITION_SYNERGY_MATCH_MULT}, 일반 장비
          ×{EXPEDITION_SYNERGY_GENERAL_MULT}로 계산해 강화 합에 반영)와 아래 아바타 강화 합 배율은 <b>상자·다이아 수량에만</b>
          적용되며, 위 표의 확률 자체는 변하지 않습니다. 파견 레벨은 수량 배율에 관여하지 않습니다.
        </P>
        <P>
          <b>아바타 강화 합</b>: 보상 배율은 파견에 보낸 아바타의 &ldquo;강화 합&rdquo;(아바타를 만들 때 입힌
          장비 세 개의 현재 강화 레벨 합, AS)으로 정해집니다 — 1 + {EXPEDITION_AS_MULT_COEF} × (AS ÷ 1,000)^
          {EXPEDITION_AS_MULT_EXP}, 상한 없음(예: 300 → ×{(1 + expeditionAsBonusBp(300) / 10000).toFixed(2)},
          1,000 → ×{(1 + expeditionAsBonusBp(1000) / 10000).toFixed(2)}). 어떤 아바타든 보낼 수 있고 최소 조건이나
          불이익은 없습니다. 이 배율 역시 <b>수량에만</b> 적용됩니다.
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
