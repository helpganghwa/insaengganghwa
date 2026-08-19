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
import { DocLink, H2, LI, Note, P, Tbl, UL, Warn } from '../ui';

export const meta: WikiDocMeta = {
  slug: 'enhance',
  cat: '성장',
  title: '강화',
  summary: '시간이 쌓일수록 오르는 확률과 성공·유지·하락 판정.',
  sections: [
    { id: 'flow', label: '한 번의 강화' },
    { id: 'wait', label: '기다린 만큼' },
    { id: 'result', label: '네 갈래 결과' },
    { id: 'down', label: '하락과 안전 구간' },
    { id: 'cycle', label: '주기' },
    { id: 'gem', label: '다이아로 시간 줄이기' },
    { id: 'swap', label: '취소와 교체' },
    { id: 'numbers', label: '구간별 수치' },
  ],
};

/** 표 표본 지점 — 안전 구간 경계는 상수에서, 나머지는 곡선이 꺾이는 자리를 골랐다. */
const SAMPLE_LEVELS = [0, 10, 30, SAFE_MAX_LEVEL, SAFE_MAX_LEVEL + 1, 75, CYCLE_LEN - 1];

const REACH_ANCHORS = Object.entries(CUMULATIVE_REACH_ANCHORS_MS) as [string, number][];

export default function Doc() {
  return (
    <>
      <H2 id="flow">한 번의 강화</H2>
      <P>
        장비를 골라 강화를 걸면 그 자리에서 시간이 흐른다. 거는 비용은 없다 — 다이아도 제물도
        들어가지 않는다. 대신 시작하는 순간 걸리는 시간과 성공률·하락률이 그 시도에 박히고, 나중에
        수치가 조정돼도 이미 걸어 둔 시도는 시작할 때의 값으로 판정한다.
      </P>
      <P>
        진행은 서버 시계로만 센다. 앱을 끄든 기기를 바꾸든 흐르는 시간은 같고, 기기 시각을 앞으로
        돌려도 결과는 달라지지 않는다.
      </P>
      <UL>
        <LI>장비 하나에 동시에 걸 수 있는 강화는 한 건이다.</LI>
        <LI>부위마다 자리가 둘이라, 부위 셋을 합쳐 여섯 건까지 동시에 굴린다.</LI>
        <LI>장착 여부는 상관없다. 창고에 둔 장비도 그대로 건다.</LI>
      </UL>
      <P>
        시간이 다 차도 결과가 저절로 나오지는 않는다. 강화 카드를 눌러 수령해야 그때 판정한다. 결과가
        나오면 서버가 같은 자리에 다음 단계를 곧바로 다시 걸어 둔다 — 올랐든 떨어졌든 마찬가지다.
      </P>

      <H2 id="wait">기다린 만큼</H2>
      <P>
        성공 확률은 0에서 출발해 지나간 시간에 비례해 오른다. 절반쯤 기다리고 수령하면 그 단계
        공시 확률의 절반으로 굴린다. 게이지가 가득 차면 공시 확률에 닿고 거기서 멈춘다.
      </P>
      <Note>
        다 찬 뒤로는 더 기다려도 확률이 오르지 않고, 그렇다고 깎이지도 않는다. 완료된 시도를 하루
        두든 한 달 두든 판정에 쓰는 값은 같다.
      </Note>
      <P>
        급하면 게이지가 차기 전에 눌러도 된다. 확률이 그만큼 낮아질 뿐 따로 붙는 벌칙은 없다. 완료
        알림은 즉시 받기와 묶어 받기 중에서 고른다.
      </P>

      <H2 id="result">네 갈래 결과</H2>
      <UL>
        <LI>성공 — 한 단계 오른다.</LI>
        <LI>
          대성공 — 두 단계 오른다. 성공 몫에서 {bpPct(MEGA_OF_SUCCESS_BP)}를 떼어 여기에 배정한다.
        </LI>
        <LI>유지 — 수치가 그대로 남는다.</LI>
        <LI>하락 — 한 단계 내려간다.</LI>
      </UL>
      <P>
        장비가 부서지거나 사라지는 결과는 없다. 화면에 뜨는 성공률은 성공과 대성공을 합한 값이라,
        표시된 확률이 곧 한 단계 이상 오를 확률이다.
      </P>

      <H2 id="down">하락과 안전 구간</H2>
      <P>
        하락 확률만은 기다린 시간을 보지 않는다. 게이지를 끝까지 채워도 그 단계에 정해진 값 그대로
        굴린다. 오래 기다려 줄어드는 쪽은 유지이고, 하락은 자리에 남는다.
      </P>
      <P>
        +{fmtInt(SAFE_MAX_LEVEL)}까지는 하락이 붙지 않는다. 여기서 실패하면 전부 유지로 끝난다.
        하락은 그 위 단계부터 생긴다.
      </P>
      <P>
        떨어질 때는 한 번에 한 단계다. 바닥은 그 주기의 +{fmtInt(SAFE_MAX_LEVEL)} 자리라, 아무리
        연달아 떨어져도 주기 경계를 넘어 앞 주기로 내려가지는 않는다.
      </P>
      <Warn>
        안전 구간을 넘어선 뒤로는 수령할 때마다 하락을 감수한다. 되돌릴 수단은 없다 — 실패를 막아
        주는 보호권·축복권 같은 소모품은 두지 않았다.
      </Warn>

      <H2 id="cycle">주기</H2>
      <P>
        강화 수치는 {fmtInt(CYCLE_LEN)}단계마다 한 주기를 이룬다. 확률은 주기 안에서의 위치만
        보므로 +{fmtInt(CYCLE_LEN + SAFE_MAX_LEVEL)}은 +{fmtInt(SAFE_MAX_LEVEL)}과 같은
        성공률·하락률을 쓴다. 안전 구간도 주기마다 새로 생긴다.
      </P>
      <P>
        달라지는 것은 시간이다. 주기가 하나 오를 때마다 한 번 시도에 드는 시간이{' '}
        {fmtInt(CYCLE_TIME_BASE)}배가 된다. 첫 주기 끝자락에서{' '}
        {fmtMs(enhanceDurationMs(CYCLE_LEN - 1))}이던 시도가 다음 주기 같은 자리에서는{' '}
        {fmtMs(enhanceDurationMs(2 * CYCLE_LEN - 1))}이 된다.
      </P>
      <P>주기 수에는 상한이 없다. 위로 갈수록 확률표는 되풀이되고 시간만 불어난다.</P>

      <H2 id="gem">다이아로 시간 줄이기</H2>
      <P>
        진행 중인 시도에 다이아를 넣으면 남은 시간이 줄어든다. 하나가 {fmtMs(GEM_TO_MS)}을 지운다.
        시간이 줄어드는 것이지 확률이 오르는 것은 아니다 — 남은 시간을 다 지우면 공시 확률에 닿는다.
      </P>
      <P>
        남은 시간보다 많이 넣어도 필요한 만큼만 빠져나간다. 이미 다 찬 시도에는 한 개도 차감되지
        않는다. 환산 비율은 시도를 시작한 시점 값으로 고정되어, 나중에 비율이 바뀌어도 진행 중인
        시도에는 소급되지 않는다.
      </P>
      <P>
        자동 강화는 이 단축을 반복하는 기능이다. 남은 시간을 다이아로 전부 지우고 판정한 뒤 다음
        단계를 거는 과정을, 정해 둔 예산과 목표 수치·횟수에 닿을 때까지 되풀이한다. 화면을 열어 둔
        동안만 돌고, 예산이 모자라면 그 자리에서 멈춘다.
      </P>

      <H2 id="swap">취소와 교체</H2>
      <P>
        취소하면 그 시도는 없던 일이 되고 자리가 즉시 빈다. 쌓인 시간은 돌려받지 못하며, 강화가
        무료라 환불할 자원도 없다. 다이아로 줄여 둔 시간도 함께 사라진다.
      </P>
      <P>
        자리가 둘 다 찼는데 다른 장비를 걸고 싶을 때는 교체를 쓴다. 진행 중인 하나를 접고 그 자리에
        새 장비를 올리기까지 한 번에 처리하므로, 자리가 잠깐 비었다가 어긋나는 일이 없다.
      </P>

      <H2 id="numbers">구간별 수치</H2>
      <Tbl
        head={['강화', '한 번 시도', '최대 성공', '하락']}
        rows={SAMPLE_LEVELS.map((lv) => [
          `+${fmtInt(lv)}`,
          fmtMs(enhanceDurationMs(lv)),
          bpPct(baseSuccessRateBp(lv)),
          bpPct(downRateBp(lv)),
        ])}
      />
      <Note>
        각 줄은 그 수치에서 다음 단계로 갈 때의 값이다. 첫 주기 기준이며, 주기가 오르면 시간만 배로
        늘고 확률 두 칸은 그대로다.
      </Note>
      <P>끝까지 기다려 수령하는 방식으로 각 지점에 닿기까지 걸리는 평균 시간은 다음과 같다.</P>
      <Tbl
        head={['도달 수치', '누적 시간']}
        rows={REACH_ANCHORS.map(([lv, ms]) => [`+${lv}`, fmtMs(ms)])}
      />
      <P>
        같이 볼 문서 — <DocLink slug="transcend">초월</DocLink>,{' '}
        <DocLink slug="combat-power">전투력</DocLink>,{' '}
        <DocLink slug="equipment">장비와 장착</DocLink>.
      </P>
    </>
  );
}
