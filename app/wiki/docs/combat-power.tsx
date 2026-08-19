import {
  CYCLE_LEN,
  MAX_TRANSCEND,
  enhanceBasePower,
  pieceCombatPower,
} from '@/lib/game/balance';

import type { WikiDocMeta } from '../registry';
import { fmtInt } from '../fmt';
import { DocLink, Ext, H2, LI, P, Tbl, UL, Warn } from '../ui';

export const meta: WikiDocMeta = {
  slug: 'combat-power',
  cat: '성장',
  title: '전투력',
  summary: '전투력이 매겨지는 방식과 올리는 길.',
  sections: [
    { id: 'piece', label: '장비 하나의 전투력' },
    { id: 'total', label: '총 전투력' },
    { id: 'where', label: '쓰이는 곳' },
    { id: 'rank', label: '랭킹 세 지표' },
  ],
};

/** 표 표본 — 곡선의 시작·초반·중반·주기 끝. */
const SAMPLE_LEVELS = [0, 10, 50, CYCLE_LEN - 1];

export default function Doc() {
  return (
    <>
      <H2 id="piece">장비 하나의 전투력</H2>
      <P>
        장비 하나의 전투력은 강화 수치에서 뽑은 기반값에 초월 배수를 곱해 정한다. 아이템 종류에 따른
        가중치는 없다. 무기든 장신구든 같은 수치면 같은 값이 나온다.
      </P>
      <P>
        기반값은 강화 수치가 오를수록 증가폭이 커진다. 초반 한 단계와 후반 한 단계의 무게가 달라서,
        높은 수치의 장비 하나가 낮은 수치 여럿을 앞지른다.
      </P>
      <Tbl
        head={['강화', '기반 전투력', `T${fmtInt(MAX_TRANSCEND)} 적용`]}
        rows={SAMPLE_LEVELS.map((lv) => [
          `+${fmtInt(lv)}`,
          fmtInt(enhanceBasePower(lv)),
          fmtInt(pieceCombatPower(lv, MAX_TRANSCEND)),
        ])}
      />
      <P>
        정확한 식과 계수는 <Ext href="/probability#combat">확률 공시</Ext>에 적혀 있다.
      </P>

      <H2 id="total">총 전투력</H2>
      <P>
        총 전투력은 보유한 장비의 개별 전투력을 전부 더한 값이다. 착용은 계산에 들어가지 않으므로
        겉모습을 바꿔도 숫자는 그대로다.
      </P>
      <P>
        한 장비를 깊게 키우는 쪽과 새 장비를 넓게 모으는 쪽이 같은 총합으로 들어온다. 보급 상자에서
        처음 보는 아이템이 나오면 그 순간 총합이 늘고, 중복이 나와 초월이 오르면 그 장비 몫이
        배수로 커진다.
      </P>
      <Warn>
        총 전투력은 지금 상태를 그대로 따라간다. 강화에서 하락이 뜨면 그 자리에서 함께 내려가고,
        최고 기록으로 붙잡아 두지 않는다.
      </Warn>

      <H2 id="where">쓰이는 곳</H2>
      <UL>
        <LI>
          <DocLink slug="raid">레이드</DocLink> — 한 번 공격의 데미지가 총 전투력에서 나온다.
        </LI>
        <LI>대난투 — 시작 체력과 한 대의 위력이 모두 총 전투력에서 계산된다.</LI>
        <LI>
          <DocLink slug="conquest">점령전</DocLink> — 참여자 전투력이 구역 판정에 들어간다.
        </LI>
        <LI>
          <DocLink slug="guild">길드</DocLink> — 길드원 목록과 길드 순위에 전투력이 함께 잡힌다.
        </LI>
        <LI>공개 프로필과 공유 카드에 총 전투력이 찍힌다.</LI>
      </UL>

      <H2 id="rank">랭킹 세 지표</H2>
      <UL>
        <LI>최고 강화 — 보유 장비 가운데 가장 높은 강화 수치 하나.</LI>
        <LI>합산 강화 — 보유 장비의 강화 수치를 전부 더한 값.</LI>
        <LI>전투력 — 위에서 계산한 총 전투력.</LI>
      </UL>
      <P>
        셋 다 현재 보유 상태로 매기고, 강화가 떨어지면 순위도 따라 내려간다. 순위는 서버마다 따로
        집계하므로 다른 서버의 기록과 섞이지 않는다.
      </P>
      <P>
        같이 볼 문서 — <DocLink slug="enhance">강화</DocLink>,{' '}
        <DocLink slug="transcend">초월</DocLink>, <DocLink slug="equipment">장비와 장착</DocLink>.
      </P>
    </>
  );
}
