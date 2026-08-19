import {
  CUMULATIVE_REACH_ANCHORS_MS,
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
import { DocLink, H2, Note, P, Tbl, Warn } from '../ui';

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

const REACH_ANCHORS = Object.entries(CUMULATIVE_REACH_ANCHORS_MS) as [string, number][];

export default function Doc() {
  return (
    <>
      <H2 id="flow">진행</H2>
      <P>
        강화는 거는 데 돈이 들지 않는다. 장비를 올려두면 시간이 흐르고, 수령 버튼을 누르는 순간
        판정이 난다. 자동으로 완료되지는 않는다.
      </P>
      <P>
        확률은 기다린 시간에 비례한다. 절반만 기다리고 누르면 공시 확률의 절반. 게이지가 다 차면
        공시 확률 그대로이고, 그 뒤로는 며칠을 묵혀도 같은 값이다. 급하면 일찍 눌러도 된다. 확률만
        낮아지고 벌칙은 없다.
      </P>
      <P>
        자리는 부위당 2개, 세 부위 합쳐 6개. 창고에 있는 장비도 걸 수 있다. 수령하면 다음 단계가
        같은 자리에 자동으로 다시 걸린다.
      </P>
      <Note>
        시간은 서버가 잰다. 기기 시계를 돌려도 소용없다. 걸리는 시간과 확률도 시작할 때 값으로
        고정되어, 도중에 밸런스가 바뀌어도 진행 중인 시도는 그대로 간다.
      </Note>

      <H2 id="result">결과 판정</H2>
      <P>
        결과는 성공, 유지, 하락 셋 중 하나다. 성공하면 한 단계 오르고, 성공의{' '}
        {bpPct(MEGA_OF_SUCCESS_BP)}는 대성공이 되어 두 단계 오른다. 화면에 뜨는 성공률은 대성공까지
        합친 값이다.
      </P>
      <P>
        +{fmtInt(SAFE_MAX_LEVEL)}까지는 하락이 없다. 실패해도 유지다. 그 위부터는 단계마다 정해진
        하락 확률이 있는데, 이 확률은 기다린 시간과 무관하게 고정이다. 오래 기다리면 유지가 성공으로
        바뀌는 것이지 하락이 줄어드는 게 아니다.
      </P>
      <P>
        떨어져도 한 번에 한 단계씩이고, 그 주기의 +{fmtInt(SAFE_MAX_LEVEL)} 밑으로는 내려가지
        않는다. 장비가 부서지는 일은 없다.
      </P>
      <Warn>하락을 막아 주는 보호권 같은 아이템은 없다. 안전 구간 위에서는 수령마다 하락을 감수한다.</Warn>

      <H2 id="cycle">주기</H2>
      <P>
        +{fmtInt(CYCLE_LEN)}마다 한 주기다. 확률표는 주기마다 똑같이 반복된다. +
        {fmtInt(CYCLE_LEN + SAFE_MAX_LEVEL)}의 성공률은 +{fmtInt(SAFE_MAX_LEVEL)}과 같다. 대신
        시간이 주기마다 {fmtInt(CYCLE_TIME_BASE)}배로 뛴다. 첫 주기에서{' '}
        {fmtMs(enhanceDurationMs(CYCLE_LEN - 1))} 걸리던 자리가 다음 주기에서는{' '}
        {fmtMs(enhanceDurationMs(2 * CYCLE_LEN - 1))}. 주기 수에 상한은 없다.
      </P>

      <H2 id="gem">다이아 단축</H2>
      <P>
        다이아 1개가 남은 시간 {fmtMs(GEM_TO_MS)}을 지운다. 확률을 사는 게 아니라 시간을 사는
        것이다. 필요한 만큼만 차감되고, 환산 비율은 시작 시점 값으로 고정된다.
      </P>
      <P>
        자동 강화를 켜면 단축과 수령, 재등록을 정해 둔 예산이 닿을 때까지 반복한다. 화면을 열어 둔
        동안만 돈다.
      </P>
      <Warn>취소하면 쌓인 시간과 넣은 다이아를 돌려받지 못한다.</Warn>

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
      <P>끝까지 기다려 수령할 때 각 지점까지 걸리는 시간.</P>
      <Tbl
        head={['도달', '누적 시간']}
        rows={REACH_ANCHORS.map(([lv, ms]) => [`+${lv}`, fmtMs(ms)])}
      />
      <P>
        같이 보면 좋은 문서: <DocLink slug="transcend">초월</DocLink>,{' '}
        <DocLink slug="combat-power">전투력</DocLink>.
      </P>
    </>
  );
}
