import { CYCLE_LEN, MAX_TRANSCEND, enhanceBasePower, pieceCombatPower } from '@/lib/game/balance';

import type { WikiDocMeta } from '../registry';
import { fmtInt } from '../fmt';
import { DocLink, Ext, Fn, FnList, H2, LI, Tbl, UL } from '../ui';

export const meta: WikiDocMeta = {
  slug: 'combat-power',
  cat: '성장',
  title: '전투력',
  summary: '강화 수치와 초월 단계로 정해지는 값, 그 합.',
  sections: [
    { id: 'piece', label: '계산' },
    { id: 'total', label: '총 전투력' },
    { id: 'where', label: '적용' },
    { id: 'rank', label: '랭킹' },
  ],
};

/** 표 표본 — 곡선의 시작·초반·중반·주기 끝. */
const SAMPLE_LEVELS = [0, 10, 50, CYCLE_LEN - 1];

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
        <LI>기반 전투력은 강화 수치가 오를수록 증가폭이 커진다.</LI>
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
          과 무관.
        </LI>
      </UL>

      <H2 id="where">적용</H2>
      <UL>
        <LI>
          <DocLink slug="raid">레이드</DocLink>: 한 번 공격의 데미지가 총 전투력 기반으로 정해진다.
        </LI>
        <LI>대난투: 체력과 공격력이 총 전투력 기반으로 정해진다.</LI>
        <LI>
          <DocLink slug="conquest">점령전</DocLink>: 참여자 전투력이 구역 총 전투력에 반영된다.
        </LI>
        <LI>
          <DocLink slug="guild">길드</DocLink>: 길드원 목록과 길드 전투력 순위에 함께 표시된다.
        </LI>
        <LI>공개 프로필과 공유 카드에 총 전투력이 표시된다.</LI>
      </UL>

      <H2 id="rank">랭킹</H2>
      <UL>
        <LI>
          랭킹 지표는 최고 강화 · 합산 강화 · 전투력 · 레이드 · 대난투 다섯 가지. 지표별 기준은{' '}
          <DocLink slug="ranking" hash="metric">랭킹</DocLink> 문서에 있다.
        </LI>
        <LI>
          순위표는{' '}
          서버마다 따로.
        </LI>
        <LI>
          최고 강화는 한 장비에 집중하는 쪽이, 합산 강화는 여러 장비를 고르게 강화하는 쪽이
          유리하다.
        </LI>
      </UL>

      <FnList
        notes={[
          <>
            정확한 식과 계수는 <Ext href="/probability#combat">확률 공시</Ext>에 적혀 있다.
          </>,
        ]}
      />
    </>
  );
}
