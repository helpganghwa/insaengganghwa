import { TITLE_DEFS } from '@/lib/game/titles/defs';

import type { WikiDocMeta } from '../registry';
import { fmtInt } from '../fmt';
import { DocLink, Fn, FnList, H2, LI, P, Tbl, UL } from '../ui';

export const meta: WikiDocMeta = {
  slug: 'titles',
  cat: '계정',
  title: '칭호',
  summary: '칭호 얻는 법, 활성과 비활성, 대표로 다는 법.',
  sections: [
    { id: 'what', label: '개요' },
    { id: 'state', label: '상태' },
    { id: 'discover', label: '발견' },
    { id: 'kinds', label: '종류' },
    { id: 'rep', label: '대표 칭호' },
    { id: 'meta', label: '히든' },
  ],
};

const TOTAL = TITLE_DEFS.length;
const CONDITIONAL = TITLE_DEFS.filter((d) => d.kind === 'conditional').length;

export default function Doc() {
  return (
    <>
      <H2 id="what">개요</H2>
      <UL>
        <LI>
          칭호는 닉네임 옆에 붙는 한 줄짜리 표식. 다 합쳐 {fmtInt(TOTAL)}종이다.
          <Fn n={1} />
        </LI>
        <LI>
          드러나는 것은 무엇을 해 왔는지뿐. <DocLink slug="combat-power">전투력</DocLink>과 확률은
          그대로다.
        </LI>
        <LI>사거나 만들 수는 없고, 조건을 채우면 붙는다.</LI>
        <LI>
          칭호는 <DocLink slug="glossary" hash="account">서버</DocLink>마다 따로 모은다. 한 서버에서
          발견한 칭호는 그 서버 캐릭터에만 달린다.
        </LI>
      </UL>

      <H2 id="state">상태</H2>
      <UL>
        <LI>목록의 칭호는 미발견 · 발견 · 활성 셋 중 하나.</LI>
        <LI>이름은 처음부터 다 보이고, 얻는 조건은 발견한 뒤에 열린다.</LI>
      </UL>
      <Tbl
        head={['상태', '뜻', '목록에서']}
        rows={[
          ['미발견', '한 번도 조건을 채운 적이 없다', '이름만 회색, 조건은 ???'],
          ['발견', '조건을 채운 적이 있다', '이름과 발견일, 조건 공개'],
          ['활성', '지금 대표로 걸 수 있다', '장착 버튼이 열린다'],
        ]}
      />

      <H2 id="discover">발견</H2>
      <UL>
        <LI>한 번 발견하면 기록이 남는다.</LI>
        <LI>방금 조건을 채웠다면 칭호 화면을 연다. 들어가는 순간 발견으로 바뀐다.</LI>
        <LI>위쪽 게이지는 발견한 수를 목록에 있는 수로 나눈 값이다.</LI>
        <LI>
          조건부형은 조건에서 벗어나면 비활성이 된다. 조건을 채운 날 칭호 화면을 한 번 열어 발견까지
          받아 두는 것이 좋다.
        </LI>
      </UL>

      <H2 id="kinds">종류</H2>
      <UL>
        <LI>
          조건부형이 {fmtInt(CONDITIONAL)}종, 나머지는 영구형.
          <Fn n={2} />
        </LI>
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
        <LI>대표는 한 번에 하나.</LI>
        <LI>목록에서 활성 칭호를 골라 장착하고, 해제도 같은 자리에서 한다.</LI>
        <LI>
          대표로 건 칭호는 헤더와 <DocLink slug="avatar" hash="manage">프로필</DocLink>, 채팅, 자랑
          카드에 같이 나온다.
          <Fn n={3} />
        </LI>
      </UL>

      <H2 id="meta">히든</H2>
      <UL>
        <LI>칭호 중에는 히든이 섞여 있다. 이름은 다른 칭호와 똑같이 보인다.</LI>
        <LI>
          칭호를 많이 모으는 것 자체가 조건인 칭호도 있다.
          <Fn n={4} />
        </LI>
      </UL>

      <FnList
        notes={[
          <>
            아직 열리지 않은 칭호는 목록에 없다. 그래서 화면의 분모는 {fmtInt(TOTAL)}종보다 작다.
          </>,
          <>
            {fmtInt(TOTAL)}종에서 조건부형을 뺀 {fmtInt(TOTAL - CONDITIONAL)}종이 영구형이다.
            목록에서 조건·영구 필터로 갈라 본다.
          </>,
          '조건부 칭호를 걸어 둔 채 조건을 잃으면 표시만 사라지고, 되찾는 순간 다시 붙는다.',
          '전체 발견 수를 세는 것과 히든만 세는 것이 따로 있다.',
        ]}
      />
      <P>
        같이 보면 좋은 문서: <DocLink slug="avatar">아바타와 프로필</DocLink>,{' '}
        <DocLink slug="conquest">점령전</DocLink>, <DocLink slug="enhance">강화</DocLink>.
      </P>
    </>
  );
}
