import type { WikiDocMeta } from '../registry';
import { DocLink, Ext, Fn, FnList, H2, LI, P, UL } from '../ui';

export const meta: WikiDocMeta = {
  slug: 'equipment',
  cat: '성장',
  title: '장비와 장착',
  summary: '세 부위, 장착 규칙, 보유 장비의 쓰임.',
  sections: [
    { id: 'slots', label: '부위' },
    { id: 'record', label: '보유 방식' },
    { id: 'equip', label: '장착과 교체' },
    { id: 'keep', label: '미장착 장비' },
    { id: 'retired', label: '상자 제외' },
  ],
};

export default function Doc() {
  return (
    <>
      <H2 id="slots">부위</H2>
      <UL>
        <LI>
          부위는 무기·방어구·장신구 셋.{' '}
          <DocLink slug="supply" hash="boxes">
            보급 상자
          </DocLink>
          도 이 구분을 그대로 따라간다.
        </LI>
        <LI>
          세기를 가르는 것은 <DocLink slug="enhance">강화</DocLink> 수치와{' '}
          <DocLink slug="transcend">초월</DocLink> 단계뿐. 같은 수치면 어느 아이템이든 같다.
          <Fn n={1} />
        </LI>
      </UL>

      <H2 id="record">보유 방식</H2>
      <UL>
        <LI>보유 장비는 종류마다 하나.</LI>
        <LI>
          같은 장비가 또 나오면 개수가 늘지 않고 그 장비의{' '}
          <DocLink slug="glossary" hash="growth">
            중복
          </DocLink>
          으로 들어간다.
        </LI>
      </UL>

      <H2 id="equip">장착과 교체</H2>
      <UL>
        <LI>부위마다 하나씩 장착한다.</LI>
        <LI>
          같은 부위에 다른 장비를 걸면 먼저 있던 것은 인벤토리로 돌아간다.
          <Fn n={2} />
        </LI>
        <LI>
          장착이 정하는 것은 겉모습. 프로필과 <DocLink slug="avatar">아바타</DocLink>, 자랑 카드
          <Fn n={3} />에 나오는 세트가 지금 장착한 셋이다.
        </LI>
        <LI>세기가 걸린 선택이 아니니 장착은 취향대로 고르면 된다.</LI>
      </UL>

      <H2 id="keep">미장착 장비</H2>
      <UL>
        <LI>
          <DocLink slug="combat-power" hash="total">
            전투력
          </DocLink>
          은 보유 기준으로 합산한다. 장착하지 않은 장비도 총합에 들어간다.
        </LI>
        <LI>강화는 장착 여부와 상관없이 아무 장비에나 건다.</LI>
        <LI>상자에서 중복으로 나오면 장착하지 않은 장비도 초월이 오른다.</LI>
        <LI>그래서 강화 칸은 장착을 따지지 말고 여섯 칸을 채워 돌리는 쪽이 총합에 낫다.</LI>
      </UL>

      <H2 id="retired">상자 제외</H2>
      <UL>
        <LI>
          상자에서 빠진 아이템은 그 뒤로 보급에서 나오지 않는다.
          <Fn n={4} />
        </LI>
        <LI>중복이 더 들어올 길이 없어서 그 장비의 초월은 그 자리에서 멈춘다.</LI>
      </UL>

      <FnList
        notes={[
          '아이템을 가르는 것은 그림과 이름, 도감에 붙은 이야기다.',
          '해제만 하고 부위를 비워 둘 수도 있다.',
          '장비 세 칸과 총 전투력을 담아 밖으로 내보내는 공유 이미지.',
          <>
            <Ext href="/probability#supply">확률 공시</Ext>의 활성 아이템 목록에서도 빠진다.
          </>,
        ]}
      />
      <P>
        같이 보면 좋은 문서: <DocLink slug="supply">보급</DocLink>,{' '}
        <DocLink slug="combat-power">전투력</DocLink>, <DocLink slug="avatar">아바타</DocLink>.
      </P>
    </>
  );
}
