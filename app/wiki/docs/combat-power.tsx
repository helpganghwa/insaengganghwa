import { CYCLE_LEN, MAX_TRANSCEND, enhanceBasePower, pieceCombatPower } from '@/lib/game/balance';

import type { WikiDocMeta } from '../registry';
import { fmtInt } from '../fmt';
import { DocLink, Ext, Fn, FnList, H2, LI, P, Tbl, UL, Warn } from '../ui';

export const meta: WikiDocMeta = {
  slug: 'combat-power',
  cat: '성장',
  title: '전투력',
  summary: '강화 수치와 초월 단계로 정해지는 값, 그 합.',
  sections: [
    { id: 'piece', label: '계산' },
    { id: 'total', label: '총 전투력' },
    { id: 'where', label: '활용' },
    { id: 'rank', label: '랭킹' },
  ],
};

/** 표 표본 — 곡선의 시작·초반·중반·주기 끝. */
const SAMPLE_LEVELS = [0, 10, 50, CYCLE_LEN - 1];

/** 각주 계산 예시에 쓰는 지점 — 표에 있는 값이라 독자가 표에서 바로 확인할 수 있다. */
const EXAMPLE_LEVEL = 50;

export default function Doc() {
  return (
    <>
      <H2 id="piece">계산</H2>
      <UL>
        <LI>
          장비 하나의 전투력 = <DocLink slug="enhance">강화</DocLink> 수치로 정해지는 기반 전투력
          <Fn n={1} /> ×{' '}
          <DocLink slug="transcend" hash="bonus">
            초월
          </DocLink>{' '}
          보너스.
        </LI>
        <LI>
          <DocLink slug="equipment" hash="slots">
            부위
          </DocLink>
          와 상관없이 같은 수치면 같은 값.
        </LI>
        <LI>
          기반 전투력은 강화 수치가 오를수록 증가폭이 커진다.
          <Fn n={2} />
        </LI>
      </UL>
      <Tbl
        head={['강화', '기반 전투력', `T${fmtInt(MAX_TRANSCEND)} 적용`]}
        rows={SAMPLE_LEVELS.map((lv) => [
          `+${fmtInt(lv)}`,
          fmtInt(enhanceBasePower(lv)),
          fmtInt(pieceCombatPower(lv, MAX_TRANSCEND)),
        ])}
      />

      <H2 id="total">총 전투력</H2>
      <UL>
        <LI>보유한 장비의 개별 전투력을 전부 더한 값.</LI>
        <LI>
          보유 기준이라{' '}
          <DocLink slug="equipment" hash="equip">
            장착
          </DocLink>
          과 무관하다. 겉모습을 바꿔도 숫자는 그대로.
        </LI>
      </UL>
      <Warn>강화에서 하락이 뜨면 총 전투력도 그 자리에서 함께 내려간다.</Warn>

      <H2 id="where">활용</H2>
      <UL>
        <LI>
          <DocLink slug="raid">레이드</DocLink>: 한 번 공격의 데미지가 총 전투력에서 나온다.
        </LI>
        <LI>
          <DocLink slug="glossary" hash="compete">
            대난투
          </DocLink>
          : 시작 체력과 한 대의 위력이 모두 총 전투력에서 나온다.
        </LI>
        <LI>
          <DocLink slug="conquest">점령전</DocLink>: 참여자 전투력이 구역 판정에 들어간다.
        </LI>
        <LI>
          <DocLink slug="guild">길드</DocLink>: 길드원 목록과 길드 순위에 함께 잡힌다.
        </LI>
        <LI>공개 프로필과 자랑 카드에 총 전투력이 찍힌다.</LI>
        <LI>전투 콘텐츠가 전부 같은 값을 보니, 따로 준비할 것 없이 강화와 초월만 올리면 된다.</LI>
      </UL>

      <H2 id="rank">랭킹</H2>
      <UL>
        <LI>최고 강화: 보유 장비 가운데 가장 높은 강화 수치 하나.</LI>
        <LI>합산 강화: 보유 장비의 강화 수치를 전부 더한 값.</LI>
        <LI>전투력: 위에서 계산한 총 전투력.</LI>
        <LI>
          순위표는{' '}
          <DocLink slug="glossary" hash="account">
            서버
          </DocLink>
          마다 따로.
        </LI>
        <LI>
          최고 강화는 한 장비를 밀어 올리는 쪽이, 합산 강화는 장비 수를 늘리는 쪽이 빠르다.
        </LI>
      </UL>

      <FnList
        notes={[
          <>
            정확한 식과 계수는 <Ext href="/probability#combat">확률 공시</Ext>에 적혀 있다.
          </>,
          <>
            +{fmtInt(EXAMPLE_LEVEL)} 장비 하나가 {fmtInt(enhanceBasePower(EXAMPLE_LEVEL))}인데, +
            {fmtInt(EXAMPLE_LEVEL / 2)} 장비 둘은 합쳐도{' '}
            {fmtInt(2 * enhanceBasePower(EXAMPLE_LEVEL / 2))}이다. 여기에 T
            {fmtInt(MAX_TRANSCEND)}가 붙으면 두 배인{' '}
            {fmtInt(pieceCombatPower(EXAMPLE_LEVEL, MAX_TRANSCEND))}.
          </>,
        ]}
      />
      <P>
        같이 보면 좋은 문서: <DocLink slug="enhance">강화</DocLink>,{' '}
        <DocLink slug="transcend">초월</DocLink>, <DocLink slug="equipment">장비와 장착</DocLink>.
      </P>
    </>
  );
}
