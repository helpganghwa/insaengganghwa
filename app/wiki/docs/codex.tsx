import type { WikiDocMeta } from '../registry';
import { DocLink, Fn, FnList, H2, LI, Note, P, UL } from '../ui';

export const meta: WikiDocMeta = {
  slug: 'codex',
  cat: '성장',
  title: '도감과 해방',
  summary: '모은 장비와 아이템별 이야기, 아이템마다 매겨지는 강화 순위와 해방.',
  sections: [
    { id: 'list', label: '목록' },
    { id: 'record', label: '최고 강화' },
    { id: 'item', label: '아이템 상세' },
    { id: 'rank', label: '강화 순위' },
    { id: 'liberate', label: '해방' },
  ],
};

export default function Doc() {
  return (
    <>
      <H2 id="list">목록</H2>
      <UL>
        <LI>도감은 프로필에서 들어가며, 모은 장비와 아직 못 모은 장비가 한 화면에 놓인다.</LI>
        <LI>
          상자에서{' '}
          <DocLink slug="supply" hash="result">
            처음 획득
          </DocLink>
          한 장비가 도감에 등록된다.
        </LI>
        <LI>등록되지 않은 칸은 실루엣과 미획득으로 표시된다.</LI>
        <LI>
          <DocLink slug="equipment" hash="slots">
            부위
          </DocLink>
          별로 걸러 보거나 아직 못 모은 것만 모아 볼 수 있다.
          <Fn n={1} />
        </LI>
        <LI>정렬은 강화순과 이름순 둘.</LI>
        <LI>프로필의 도감 칸에는 모은 수와 전체 수가 함께 적힌다.</LI>
      </UL>

      <H2 id="record">최고 강화</H2>
      <UL>
        <LI>
          등록된 칸마다 그 장비에서 도달했던 가장 높은 <DocLink slug="enhance">강화</DocLink> 수치가
          붙는다.
        </LI>
        <LI>
          이 수치는 한 번 오르면 강화가 하락해도 그대로 남는다.
          <Fn n={2} />
        </LI>
        <LI>기본 정렬인 강화순은 이 수치가 높은 장비를 위로 올린다.</LI>
      </UL>

      <H2 id="item">아이템 상세</H2>
      <UL>
        <LI>등록된 칸을 누르면 그 아이템의 상세로 넘어간다.</LI>
        <LI>상세에는 이름과 부위, 큰 이미지, 그 아이템의 이야기가 실린다.</LI>
        <LI>아이템마다 다른 것은 이미지와 이름, 이야기다.</LI>
      </UL>

      <H2 id="rank">강화 순위</H2>
      <UL>
        <LI>
          상세 아래에는 그 아이템을 강화한 순위가 상위 열 명까지 뜬다.
          <Fn n={3} />
        </LI>
        <LI>
          기준은 그 아이템에서 도달한 최고 강화 수치이며, 수치가 같으면 먼저 도달한 쪽이 앞선다.
          <Fn n={4} />
        </LI>
        <LI>강화로 수치가 오르면 그 자리에서 순위에 반영된다.</LI>
        <LI>줄을 누르면 그 사람의 프로필로 넘어가고, 내 줄은 색으로 구분된다.</LI>
        <LI>순위는 서버마다 따로 매긴다.</LI>
        <LI>
          서버 전체를 한 줄로 세우는 순위는 <DocLink slug="ranking">랭킹</DocLink>에 따로 있다.
        </LI>
      </UL>
      <Note>사람이 덜 몰린 아이템일수록 낮은 강화 수치로도 순위에 오른다.</Note>

      <H2 id="liberate">해방</H2>
      <UL>
        <LI>아이템별 강화 순위에서 금·은·동을 차지하면 그 아이템이 해방된다.</LI>
        <LI>해방한 아이템에는 등수 색 후광이 돈다. 1위는 금, 2위는 은, 3위는 동.</LI>
        <LI>
          후광은 도감과 인벤토리, 길드원 목록, 프로필, 자랑하기 미리보기에서 같이 따라다닌다.
        </LI>
        <LI>프로필에는 해방 아이템 칸이 따로 생기고 보유 종수가 적힌다.</LI>
        <LI>누군가 더 높이 강화해 순위 밖으로 밀리면 해방도 함께 풀린다.</LI>
        <LI>
          해방한 아이템 수를 조건으로 하는 <DocLink slug="titles">칭호</DocLink>가 있다.
        </LI>
      </UL>

      <FnList
        notes={[
          '못 모은 것만 보는 갈래는 남은 장비가 있을 때만 나온다.',
          '지금 장비에 붙어 있는 강화 수치는 인벤토리에서 본다.',
          '정지된 계정은 순위에서 빠진다.',
          '같은 수치로는 앞 순위를 밀어내지 못한다.',
        ]}
      />
      <P>
        같이 보면 좋은 문서: <DocLink slug="supply">보급</DocLink>,{' '}
        <DocLink slug="enhance">강화</DocLink>, <DocLink slug="titles">칭호</DocLink>.
      </P>
    </>
  );
}
