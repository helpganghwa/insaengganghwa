import type { WikiDocMeta } from '../registry';
import { DocLink, Fn, FnList, H2, LI, P, Tbl, UL } from '../ui';

export const meta: WikiDocMeta = {
  slug: 'ranking',
  cat: '경쟁',
  title: '랭킹',
  summary: '다섯 지표로 서버 안에서 순위를 겨룬다.',
  sections: [
    { id: 'metric', label: '지표' },
    { id: 'rank', label: '순위' },
    { id: 'update', label: '갱신' },
    { id: 'scope', label: '범위' },
  ],
};

export default function Doc() {
  return (
    <>
      <H2 id="metric">지표</H2>
      <UL>
        <LI>최고 강화 · 합산 강화 · 전투력 · 레이드 · 대난투 다섯 가지.</LI>
        <LI>강화 계열 세 지표는 장착 여부와 상관없이 보유한 장비 전체를 본다.</LI>
      </UL>
      <Tbl
        firstColNowrap
        head={['지표', '순위에 쓰는 값']}
        rows={[
          [
            '최고 강화',
            <>
              보유 장비 가운데 가장 높은 <DocLink slug="enhance">강화</DocLink> 수치 하나
            </>,
          ],
          ['합산 강화', '보유 장비의 강화 수치를 전부 더한 값'],
          [
            '전투력',
            <>
              보유 장비를 합산한{' '}
              <DocLink slug="combat-power" hash="total">
                총 전투력
              </DocLink>
            </>,
          ],
          [
            '레이드',
            <>
              <DocLink slug="raid" hash="phase">
                페이즈
              </DocLink>
              를 하나 이상 돌파한 레이드에 공격으로 참여한 횟수
              <Fn n={1} />
            </>,
          ],
          [
            '대난투',
            <>
              <DocLink slug="melee" hash="point">
                대난투 포인트
              </DocLink>
            </>,
          ],
        ]}
      />

      <H2 id="rank">순위</H2>
      <UL>
        <LI>목록은 1위부터 순서대로이며, 상위 세 명은 목록 위에 아바타와 함께 크게 표시된다.</LI>
        <LI>정지된 계정은 순위표에서 제외된다.</LI>
      </UL>

      <H2 id="update">갱신</H2>
      <UL>
        <LI>
          강화 결과를 받거나 <DocLink slug="supply" hash="open">상자를 열면</DocLink> 강화 계열 세
          지표의 값이 다시 계산된다.
        </LI>
        <LI>레이드는 정산될 때, 대난투는 결과가 발표될 때 반영된다.</LI>
        <LI>순위 목록은 바로 바뀌지 않고 일정 시간마다 갱신된다.</LI>
        <LI>대난투 포인트는 오래된 성적일수록 반영 비중이 줄어든다.</LI>
      </UL>

      <H2 id="scope">범위</H2>
      <UL>
        <LI>순위표는 서버마다 따로 집계된다.</LI>
        <LI>
          홈 화면 랭킹 카드에서도 지표별 상위 세 명을 볼 수 있다.
          <Fn n={2} />
        </LI>
      </UL>

      <FnList
        notes={[
          '공격을 한 번도 하지 않은 참여는 수치에 반영되지 않는다.',
          '카드를 좌우로 넘기면 지표가 바뀌고, 제목을 누르면 그 지표의 랭킹 화면으로 넘어간다.',
        ]}
      />
      <P>
        같이 보면 좋은 문서: <DocLink slug="combat-power">전투력</DocLink>,{' '}
        <DocLink slug="melee">대난투</DocLink>, <DocLink slug="raid">레이드</DocLink>.
      </P>
    </>
  );
}
