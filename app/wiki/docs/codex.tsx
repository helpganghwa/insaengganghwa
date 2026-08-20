import type { WikiDocMeta } from '../registry';
import { DocLink, Fn, FnList, H2, LI, UL } from '../ui';

export const meta: WikiDocMeta = {
  slug: 'codex',
  cat: '성장',
  title: '도감과 해방',
  summary: '모은 장비와 아이템별 이야기, 아이템마다 매겨지는 강화 순위와 해방.',
  sections: [
    { id: 'list', label: '목록' },
    { id: 'record', label: '최고 강화' },
    { id: 'rank', label: '강화 순위' },
    { id: 'liberate', label: '해방' },
  ],
};

export default function Doc() {
  return (
    <>
      <H2 id="list">목록</H2>
      <UL>
        <LI>도감은 획득한 장비와 획득하지 못한 장비를 볼 수 있다.</LI>
        <LI>
          상자에서{' '}
          <DocLink slug="supply" hash="result">
            처음 획득
          </DocLink>
          한 장비가 도감에 등록된다.
        </LI>
        <LI>등록되지 않은 칸은 실루엣과 미획득으로 표시된다.</LI>
      </UL>

      <H2 id="record">최고 강화</H2>
      <UL>
        <LI>
          등록된 칸마다 그 장비에서 도달했던 가장 높은 <DocLink slug="enhance">강화</DocLink> 수치를
          볼 수 있다.
        </LI>
        <LI>이 수치는 한 번 오르면 강화가 하락해도 유지된다.</LI>
      </UL>

      <H2 id="rank">강화 순위</H2>
      <UL>
        <LI>
          상세 아래에는 그 아이템을 강화한 순위가 상위 열 명까지 노출된다.
          <Fn n={1} />
        </LI>
        <LI>
          기준은 그 아이템에서 도달한 최고 강화 수치이며, 수치가 같으면 먼저 도달한 쪽이 높은 순위를
          가진다.
        </LI>
        <LI>순위는 서버마다 따로 계산된다.</LI>
      </UL>

      <H2 id="liberate">해방</H2>
      <UL>
        <LI>아이템별 강화 순위에서 3위 안에 들면 그 아이템이 해방된다.</LI>
        <LI>
          해방한 아이템에는 등수 색 후광이 생기며 전용 애니메이션이 재생된다. 1위는 금, 2위는 은,
          3위는 동.
        </LI>
        <LI>후광 효과는 도감과 인벤토리, 길드원 목록, 프로필, 자랑하기 미리보기에서 적용된다.</LI>
        <LI>프로필에는 해방 아이템 칸이 따로 생기고 보유 종수가 적힌다.</LI>
        <LI>누군가 더 높이 강화해 순위 밖으로 밀리면 해방도 함께 풀린다.</LI>
      </UL>

      <FnList notes={['정지된 계정은 순위에서 빠진다.']} />
    </>
  );
}
