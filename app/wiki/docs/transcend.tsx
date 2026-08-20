import {
  MAX_TRANSCEND,
  transcendBonusBp,
  transcendFodderCumulative,
  transcendFodderForStep,
} from '@/lib/game/balance';

import type { WikiDocMeta } from '../registry';
import { bpPct, fmtInt } from '../fmt';
import { DocLink, Fn, FnList, H2, LI, P, Tbl, UL } from '../ui';

export const meta: WikiDocMeta = {
  slug: 'transcend',
  cat: '성장',
  title: '초월',
  summary: '중복 장비를 획득하면 오르는 단계와 전투력 배수.',
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
const BONUS_PER_STEP_ABOVE = transcendBonusBp(MAX_TRANSCEND + 1) - transcendBonusBp(MAX_TRANSCEND);

export default function Doc() {
  return (
    <>
      <H2 id="auto">개요</H2>
      <UL>
        <LI>초월은 같은 장비를 중복 획득하면 오른다.</LI>
        <LI>
          <DocLink slug="supply" hash="boxes">
            보급 상자
          </DocLink>
          에서 이미 가진 장비를 획득하면 진행도가 하나 쌓인다.
        </LI>
        <LI>
          필요한 개수를 채우는 순간 즉시 단계가 오른다.
          <Fn n={1} />
        </LI>
      </UL>

      <H2 id="cost">필요 개수</H2>
      <UL>
        <LI>
          T단계로 올라가려면 그 장비의{' '}
          중복이 T개이며, 단계마다 하나씩 늘어난다.
        </LI>
      </UL>
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
      <UL>
        <LI>
          초월은 그 장비의{' '}
          <DocLink slug="combat-power" hash="piece">
            전투력
          </DocLink>
          에 배수로 적용된다.
        </LI>
        <LI>
          <DocLink slug="enhance">강화</DocLink>가 높은 장비일수록 같은 단계에서 더 크게 오른다.
        </LI>
        <LI>
          T{fmtInt(MAX_TRANSCEND)} 보너스는 +{bpPct(transcendBonusBp(MAX_TRANSCEND))}로, 그 장비의
          전투력이 두 배가 된다.
          <Fn n={2} />
        </LI>
      </UL>

      <H2 id="cap">상한</H2>
      <UL>
        <LI>
          단계에 상한은 없으며, 중복으로 획득하는 만큼 계속 오른다.
          <Fn n={3} />
        </LI>
      </UL>

      <H2 id="with-enhance">강화와의 관계</H2>
      <UL>
        <LI>강화 수치와 초월 단계는 곱으로 적용된다.</LI>
        <LI>강화에서 하락해도 초월 단계는 그대로다.</LI>
      </UL>

      <H2 id="look">겉모습</H2>
      <UL>
        <LI>
          초월 장비에는 테두리가 생기고, 일정 단계마다 색이 바뀐다.
          <Fn n={4} />
        </LI>
      </UL>

      <FnList
        notes={[
          '한꺼번에 열면 두 단계 이상 오르기도 한다. 채우고 남은 중복은 다음 단계 몫으로 넘어간다.',
          <>
            T{fmtInt(MAX_TRANSCEND)}까지는 단계마다 증가폭이 조금씩 커지고, T
            {fmtInt(MAX_TRANSCEND)} 이후로는 한 단계에 {bpPct(BONUS_PER_STEP_ABOVE)}씩 증가한다.
          </>,
          '한 단계에 필요한 개수가 매번 늘어나 올라가는 속도는 점점 느려진다.',
          '색은 10단계 단위로 바뀌고, 마지막 색에서 멈춘다. 같은 색 안에서도 +1~+5와 +6~+10 구간은 테두리 장식이 다르다.',
        ]}
      />
      <P>
        같이 보면 좋은 문서: <DocLink slug="supply">보급</DocLink>,{' '}
        <DocLink slug="combat-power">전투력</DocLink>, <DocLink slug="enhance">강화</DocLink>.
      </P>
    </>
  );
}
