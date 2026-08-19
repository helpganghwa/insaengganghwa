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
  summary: '같은 장비가 또 나오면 오르는 단계와 전투력 배수.',
  sections: [
    { id: 'auto', label: '개요' },
    { id: 'cost', label: '필요 개수' },
    { id: 'bonus', label: '전투력 배수' },
    { id: 'cap', label: '상한' },
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
      <H2 id="auto">개요</H2>
      <P>
        초월은 같은 장비를 또 얻으면 오른다. <DocLink slug="supply">보급 상자</DocLink>에서 이미
        가진 장비가 나오면 진행도가 하나 쌓이고, 필요한 개수를 채우는 순간 단계가 오른다.
      </P>
      <P>
        누르는 버튼은 없다. 상자를 한꺼번에 열면 두 단계 이상 오르기도 하고, 채우고 남은 중복은 다음
        단계 몫으로 넘어간다.
      </P>
      <P>다른 장비를 재료로 넣을 수는 없다. 초월에 들어가는 것은 같은 장비의 중복뿐이다.</P>

      <H2 id="cost">필요 개수</H2>
      <P>T단계로 올라가려면 그 장비의 중복이 T개 필요하다. 단계마다 하나씩 늘어난다.</P>
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
        초월은 그 장비의 전투력에 배수로 붙는다. 강화가 높은 장비일수록 같은 단계에서 더 크게 오른다.
      </P>
      <P>
        T{fmtInt(MAX_TRANSCEND)} 보너스는 +{bpPct(transcendBonusBp(MAX_TRANSCEND))}, 그 장비의
        전투력이 두 배다. 거기까지는 단계마다 증가폭이 조금씩 커지고, 그 위로는 한 단계에{' '}
        {bpPct(BONUS_PER_STEP_ABOVE)}포인트씩 붙는다.
      </P>

      <H2 id="cap">상한</H2>
      <P>
        초월 단계에 상한은 없다. 중복이 들어오는 만큼 계속 오른다. 다만 한 단계에 필요한 개수가 매번
        늘어나서 올라가는 속도는 점점 느려진다.
      </P>
      <Note>
        테두리 색은 어느 지점에서 멈추지만 수치는 계속 오른다. 테두리가 같아도 전투력 차이는 얼마든지
        벌어진다.
      </Note>

      <H2 id="with-enhance">강화와의 관계</H2>
      <UL>
        <LI>초월이 올라도 강화 수치는 그대로다.</LI>
        <LI>강화에서 하락이 떠도 초월 단계는 내려가지 않는다.</LI>
        <LI>강화를 걸어 둔 장비에도 중복은 그대로 들어간다.</LI>
      </UL>
      <P>
        개인 최고 초월은 따로 남는다. 성장패스 단계와 기록 달성 우편은 이 최고 기록을 따라간다.
      </P>

      <H2 id="look">겉모습</H2>
      <P>
        단계가 붙은 장비에는 테두리가 생기고, 일정 단계마다 색이 바뀐다. 색은 어느 지점부터 더
        바뀌지 않고 그대로 간다.
      </P>
      <P>아이템 그림은 초월로 달라지지 않는다. 숫자는 장비 상세에서 본다.</P>
      <P>
        같이 보면 좋은 문서: <DocLink slug="supply">보급</DocLink>,{' '}
        <DocLink slug="combat-power">전투력</DocLink>, <DocLink slug="enhance">강화</DocLink>.
      </P>
    </>
  );
}
