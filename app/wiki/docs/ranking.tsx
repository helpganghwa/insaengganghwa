import type { WikiDocMeta } from '../registry';
import { DocLink, Fn, FnList, H2, LI, Note, P, Tbl, UL } from '../ui';

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
        <LI>탭은 최고 강화 · 합산 강화 · 전투력 · 레이드 · 대난투 다섯 가지.</LI>
        <LI>탭 이름 옆 ⓘ를 누르면 그 지표의 산정 기준이 나온다.</LI>
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
      <Note>
        최고 강화는 한 장비에 몰아주는 쪽이, 합산 강화는 여러 장비를 고르게 올리는 쪽이 유리하다.
      </Note>

      <H2 id="rank">순위</H2>
      <UL>
        <LI>목록은 1위부터 순서대로이며, 상위 세 명은 목록 위에 아바타와 함께 크게 표시된다.</LI>
        <LI>값이 같으면 순위도 같고, 다음 순위는 그 인원만큼 건너뛴다.</LI>
        <LI>목록에 오르는 인원은 상위 일부다. 그 밖이면 화면 아래에 내 순위 줄이 따로 붙는다.</LI>
        <LI>내 순위와 값은 화면 오른쪽 위에 늘 표시되고, 기록이 없으면 기록 없음으로 나온다.</LI>
        <LI>정지된 계정은 순위표에서 빠진다.</LI>
      </UL>

      <H2 id="update">갱신</H2>
      <UL>
        <LI>
          강화 결과를 받거나 <DocLink slug="supply" hash="open">상자를 열면</DocLink> 강화 계열 세
          지표의 내 값이 다시 계산된다.
        </LI>
        <LI>레이드는 정산될 때, 대난투는 결과가 발표될 때 반영된다.</LI>
        <LI>순위 목록은 바로 바뀌지 않고 잠시 뒤 갱신된다.</LI>
        <LI>
          대난투 포인트는 오래된 성적일수록 반영 비중이 줄어, 대난투에 나가지 않는 동안에는 값이
          내려간다.
        </LI>
      </UL>

      <H2 id="scope">범위</H2>
      <UL>
        <LI>순위표는 서버마다 따로 집계된다.</LI>
        <LI>시즌 구분 없이 계속 이어진다.</LI>
        <LI>
          홈 화면 랭킹 카드에서도 지표별 상위 세 명을 볼 수 있다.
          <Fn n={2} />
        </LI>
        <LI>
          길드끼리 겨루는 길드 랭킹은 <DocLink slug="guild">길드</DocLink> 화면에 따로 있다.
        </LI>
      </UL>

      <FnList
        notes={[
          '공격을 한 번도 하지 않은 참여는 세지 않는다.',
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
