import {
  MAX_TRANSCEND,
  transcendBonusBp,
  transcendFodderCumulative,
  transcendFodderForStep,
} from '@/lib/game/balance';

import type { WikiDocMeta } from '../registry';
import { bpPct, fmtInt } from '../fmt';
import { DocLink, H2, LI, Note, P, Tbl, UL } from '../ui';

export const meta: WikiDocMeta = {
  slug: 'transcend',
  cat: '성장',
  title: '초월',
  summary: '같은 장비를 다시 얻으면 오르는 단계와 보너스.',
  sections: [
    { id: 'auto', label: '중복이 곧 단계' },
    { id: 'cost', label: '필요한 중복 수' },
    { id: 'bonus', label: '전투력 배수' },
    { id: 'cap', label: '끝이 없다' },
    { id: 'with-enhance', label: '강화와의 관계' },
    { id: 'look', label: '겉모습' },
  ],
};

/** 표 표본 — 초반 세 단계 + 중간 + 겉모습 사다리 상단 전후. */
const SAMPLE_STEPS = [1, 2, 3, 5, MAX_TRANSCEND, MAX_TRANSCEND + 1, MAX_TRANSCEND * 2];

/** 사다리 상단을 넘긴 뒤의 한 단계당 증가폭 — 곡선이 선형으로 바뀌는 지점에서 뽑는다. */
const BONUS_PER_STEP_ABOVE =
  transcendBonusBp(MAX_TRANSCEND + 1) - transcendBonusBp(MAX_TRANSCEND);

export default function Doc() {
  return (
    <>
      <H2 id="auto">중복이 곧 단계</H2>
      <P>
        초월에는 누르는 버튼이 없다. <DocLink slug="supply">보급 상자</DocLink>에서 이미 가진 장비가
        또 나오면 그 장비의 진행도가 하나 쌓이고, 필요한 수를 채우는 순간 단계가 오른다.
      </P>
      <P>
        상자를 여러 개 한꺼번에 열면 한 번에 두 단계 이상 오르기도 한다. 임계를 넘기고 남은 중복은
        버려지지 않고 다음 단계 몫으로 이월된다.
      </P>
      <P>
        다른 장비를 재료로 바치는 절차는 없다. 장비를 분해하거나 파는 기능 자체를 두지 않았으므로,
        초월에 들어가는 것은 오직 같은 장비의 중복뿐이다.
      </P>

      <H2 id="cost">필요한 중복 수</H2>
      <P>
        T단계로 올라가려면 그 장비의 중복이 T개 필요하다. 단계마다 하나씩 늘어나는 선형이라,
        누적으로 보면 삼각수 모양으로 불어난다.
      </P>
      <Tbl
        head={['단계', '이 단계에 필요', '처음부터 누적', '전투력 보너스']}
        rows={SAMPLE_STEPS.map((t) => [
          `T${fmtInt(t)}`,
          `${fmtInt(transcendFodderForStep(t))}개`,
          `${fmtInt(transcendFodderCumulative(t))}개`,
          `+${bpPct(transcendBonusBp(t))}`,
        ])}
      />

      <H2 id="bonus">전투력 배수</H2>
      <P>
        초월은 그 장비의 전투력에 배수로 붙는다. 강화로 쌓은 기반값에 곱하는 구조라, 강화가 높은
        장비일수록 같은 단계의 초월이 더 큰 수치로 돌아온다.
      </P>
      <P>
        T{fmtInt(MAX_TRANSCEND)}에서 +{bpPct(transcendBonusBp(MAX_TRANSCEND))}, 곧 그 장비의 전투력이
        두 배가 된다. 여기까지는 단계마다 증가폭이 조금씩 커지고, 그 위로는 한 단계마다{' '}
        {bpPct(BONUS_PER_STEP_ABOVE)}포인트씩 일정하게 붙는다.
      </P>

      <H2 id="cap">끝이 없다</H2>
      <P>
        초월 단계에 상한은 없다. 중복이 계속 들어오는 한 계속 오르고, 배수도 계속 커진다. 다만 한
        단계에 필요한 중복이 매번 늘어나므로 실제로 올라가는 속도는 점점 느려진다.
      </P>
      <Note>
        겉모습 등급은 어느 지점에서 더 변하지 않지만 수치는 거기서 멈추지 않는다. 등급 색이 같은
        장비끼리도 전투력 차이는 얼마든지 벌어진다.
      </Note>

      <H2 id="with-enhance">강화와의 관계</H2>
      <UL>
        <LI>초월이 올라도 강화 수치는 그대로다. 두 값은 서로를 밀어 올리거나 깎지 않는다.</LI>
        <LI>강화에서 하락이 떠도 초월 단계는 내려가지 않는다.</LI>
        <LI>강화를 걸어 둔 장비에도 중복은 그대로 들어간다. 진행 중인 시도는 끊기지 않는다.</LI>
      </UL>
      <P>
        개인 최고 초월은 현재 값과 별개로 기록에 남는다. 성장 패스 단계와 이정표 보상은 이 최고
        기록을 기준으로 판정한다.
      </P>

      <H2 id="look">겉모습</H2>
      <P>
        단계가 붙은 장비에는 칸 테두리가 생기고, 일정 단계마다 색이 바뀐다. 일반·희귀·영웅·전설·신화
        순으로 올라가며 신화에서 멈춘다.
      </P>
      <P>
        아이템 그림 자체는 초월로 달라지지 않는다. 초월은 테두리로만 드러나고, 숫자는 장비 상세에서
        확인한다.
      </P>
      <P>
        같이 볼 문서 — <DocLink slug="supply">보급</DocLink>,{' '}
        <DocLink slug="combat-power">전투력</DocLink>, <DocLink slug="enhance">강화</DocLink>.
      </P>
    </>
  );
}
