import { TITLE_DISCOVERY_DIAMOND, TITLE_MILESTONE_STEP } from '@/lib/game/balance';
import { TITLE_DEFS } from '@/lib/game/titles/defs';
import { PENDING_CODES } from '@/lib/game/titles/pending';

import type { WikiDocMeta } from '../registry';
import { fmtInt } from '../fmt';
import { DocLink, H2, LI, Tbl, UL } from '../ui';

export const meta: WikiDocMeta = {
  slug: 'titles',
  cat: '계정',
  title: '칭호',
  summary: '칭호 얻는 법, 활성과 비활성, 대표 지정.',
  sections: [
    { id: 'what', label: '개요' },
    { id: 'state', label: '상태' },
    { id: 'kinds', label: '종류' },
    { id: 'rep', label: '대표 칭호' },
    { id: 'reward', label: '발견 보상' },
  ],
};

// 노출 기준 총수 — 판정 준비 중(PENDING)이라 목록에 안 보이는 칭호는 분모에서 뺀다(감사 L7:
// 목록과 세는 수가 어긋나면 유저가 "빠진 칭호"를 찾아 헤맨다). 헌정 등 보유자 한정 노출은 +α.
const VISIBLE = TITLE_DEFS.filter((d) => !PENDING_CODES.has(d.code));
const TOTAL = VISIBLE.length;
const CONDITIONAL = VISIBLE.filter((d) => d.kind === 'conditional').length;

export default function Doc() {
  return (
    <>
      <H2 id="what">개요</H2>
      <UL>
        <LI>칭호는 닉네임 옆에 붙는 한 줄짜리 표식이며, 현재 다 합쳐 {fmtInt(TOTAL)}종이다.</LI>
        <LI>
          <DocLink slug="combat-power">전투력</DocLink>과 확률에는 영향이 없다.
        </LI>
        <LI>사거나 만들 수 없고, 조건을 만족하면 자동으로 획득된다.</LI>
        <LI>칭호는 서버마다 따로 적용된다.</LI>
      </UL>

      <H2 id="state">상태</H2>
      <UL>
        <LI>목록의 칭호는 미발견 · 발견 · 활성 셋 중 하나.</LI>
        <LI>획득 조건은 발견한 뒤에 공개된다.</LI>
      </UL>
      <Tbl
        head={['상태', '뜻', '목록에서']}
        rows={[
          ['미발견', '한 번도 조건을 채운 적이 없다', '이름만 회색, 조건은 ???'],
          ['발견', '조건을 채운 적이 있다', '이름과 발견일, 조건 공개'],
          ['활성', '지금 대표로 지정할 수 있다', '장착 버튼이 표시된다'],
        ]}
      />

      <H2 id="kinds">종류</H2>
      <UL>
        <LI>조건부형이 {fmtInt(CONDITIONAL)}종, 나머지는 영구형이다.</LI>
      </UL>
      <Tbl
        head={['갈래', '활성', '조건에서 벗어나면']}
        rows={[
          ['영구형', '발견한 순간부터 계속', '해당 없음'],
          ['조건부형', '지금 조건을 채우는 동안만', '비활성. 발견 기록은 남는다'],
        ]}
      />

      <H2 id="rep">대표 칭호</H2>
      <UL>
        <LI>대표 칭호는 한 개만 지정 가능하다.</LI>
        <LI>
          대표로 지정한 칭호는 헤더와 <DocLink slug="avatar" hash="manage">프로필</DocLink>, 채팅,
          공유 카드에 표시된다.
        </LI>
      </UL>


      <H2 id="reward">발견 보상</H2>
      <UL>
        <LI>
          칭호를 하나 발견할 때마다 {fmtInt(TITLE_DISCOVERY_DIAMOND)} 다이아가 받을 보상으로 쌓인다. 칭호
          화면 위쪽의 받을 보상에서 한 번에 받는다.
        </LI>
        <LI>
          발견한 칭호가 {fmtInt(TITLE_MILESTONE_STEP)}개, {fmtInt(TITLE_MILESTONE_STEP * 2)}개,{' '}
          {fmtInt(TITLE_MILESTONE_STEP * 3)}개…에 이를 때마다 그 개수만큼 보급 상자를 받는다. 같은 자리에서
          함께 받으며, 다음 단계까지 남은 개수는 칭호 화면의 게이지로 확인할 수 있다.
        </LI>
        <LI>이미 발견한 칭호의 보상도 그대로 쌓여 있으니, 칭호 화면에 들어가 받으면 된다.</LI>
      </UL>
    </>
  );
}
