import {
  CYCLE_LEN,
  CYCLE_TIME_BASE,
  GEM_TO_MS,
  MEGA_OF_SUCCESS_BP,
  SAFE_MAX_LEVEL,
  baseSuccessRateBp,
  downRateBp,
  enhanceDurationMs,
} from '@/lib/game/balance';

import type { WikiDocMeta } from '../registry';
import { bpPct, fmtInt, fmtMs } from '../fmt';
import { DocLink, Fn, FnList, H2, LI, Note, P, Tbl, UL, Warn } from '../ui';

export const meta: WikiDocMeta = {
  slug: 'enhance',
  cat: '성장',
  title: '강화',
  summary: '기다린 시간에 비례하는 확률, 성공·유지·하락 판정.',
  sections: [
    { id: 'flow', label: '진행' },
    { id: 'result', label: '결과 판정' },
    { id: 'cycle', label: '주기' },
    { id: 'gem', label: '다이아 단축' },
    { id: 'numbers', label: '수치' },
  ],
};

/** 표 표본 지점 — 안전 구간 경계는 상수에서, 나머지는 곡선이 꺾이는 자리를 골랐다. */
const SAMPLE_LEVELS = [0, 10, 30, SAFE_MAX_LEVEL, SAFE_MAX_LEVEL + 1, 75, CYCLE_LEN - 1];

export default function Doc() {
  return (
    <>
      <H2 id="flow">진행</H2>
      <UL>
        <LI>강화는 무료. 시작해 두고 기다렸다가 카드를 누르면 결과가 나온다.</LI>
        <LI>
          확률은 기다린 시간에 비례. 절반 기다리면 공시 확률
          <Fn n={1} />의 절반, 다 차면 그대로.
        </LI>
        <LI>일찍 강화해도 확률만 낮을 뿐 손해는 없다.</LI>
        <LI>
          강화 칸은 <DocLink slug="equipment" hash="slots">부위</DocLink>당 2개, 총 6개.{' '}
          <DocLink slug="equipment" hash="equip">장착</DocLink> 안 한 장비도 강화 가능.
        </LI>
        <LI>결과가 나오면 다음 단계 강화가 바로 이어진다.</LI>
      </UL>

      <H2 id="result">결과 판정</H2>
      <UL>
        <LI>결과는 성공 · 유지 · 하락.</LI>
        <LI>
          성공의 {bpPct(MEGA_OF_SUCCESS_BP)}는 대성공
          <Fn n={2} />으로 두 단계 상승. 화면의 성공률은 대성공까지 합친 값.
        </LI>
        <LI>+{fmtInt(SAFE_MAX_LEVEL)}까지는 안전 구간. 실패해도 유지.</LI>
        <LI>
          그 위부터 단계별 하락 확률이 붙는다. 하락은 기다린 시간과 무관하게 고정.
          <Fn n={3} />
        </LI>
        <LI>그래서 안전 구간을 넘긴 뒤에는 게이지를 다 채우고 강화하는 것이 좋다.</LI>
        <LI>
          떨어져도 한 번에 한 단계, 그 주기의 +{fmtInt(SAFE_MAX_LEVEL)} 아래로는 안 내려간다.
        </LI>
      </UL>

      <H2 id="cycle">주기</H2>
      <UL>
        <LI>+{fmtInt(CYCLE_LEN)}마다 한 주기. 확률표는 주기마다 반복된다.</LI>
        <LI>
          시간은 주기마다 {fmtInt(CYCLE_TIME_BASE)}배. +{fmtInt(CYCLE_LEN - 1)}에서{' '}
          {fmtMs(enhanceDurationMs(CYCLE_LEN - 1))} 걸리던 자리가 다음 주기엔{' '}
          {fmtMs(enhanceDurationMs(2 * CYCLE_LEN - 1))}.
        </LI>
      </UL>

      <H2 id="gem">다이아 단축</H2>
      <UL>
        <LI>
          <DocLink slug="glossary" hash="goods">다이아</DocLink> 1개 = 남은 시간 {fmtMs(GEM_TO_MS)}{' '}
          단축. 필요한 만큼만 차감.
        </LI>
        <LI>전부 줄이면 최대 확률로 바로 강화할 수 있다.</LI>
        <LI>
          자동 강화는 단축 → 강화 → 재등록을 정해 둔 예산까지 반복.
          <Fn n={4} />
        </LI>
      </UL>
      <Warn>취소하면 기다린 시간과 넣은 다이아를 날린다.</Warn>

      <H2 id="numbers">수치</H2>
      <Tbl
        head={['강화', '한 번 시도', '최대 성공', '하락']}
        rows={SAMPLE_LEVELS.map((lv) => [
          `+${fmtInt(lv)}`,
          fmtMs(enhanceDurationMs(lv)),
          bpPct(baseSuccessRateBp(lv)),
          bpPct(downRateBp(lv)),
        ])}
      />
      <Note>첫 주기 기준. 주기가 오르면 시간만 배로 늘고 확률은 그대로다.</Note>

      <FnList
        notes={[
          <>
            게임 안 <a href="/probability" className="underline">확률 공시</a>에 단계별로 적힌 값.
          </>,
          '확률 공시에는 메가로 적힌다.',
          '오래 기다리면 유지가 성공으로 바뀔 뿐, 하락 확률은 그대로다.',
          '화면을 열어 둔 동안만 돈다.',
        ]}
      />
      <P>
        같이 보면 좋은 문서: <DocLink slug="transcend">초월</DocLink>,{' '}
        <DocLink slug="combat-power">전투력</DocLink>.
      </P>
    </>
  );
}
