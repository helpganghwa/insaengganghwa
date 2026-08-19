import type { WikiDocMeta } from '../registry';
import { DocLink, H2, LI, Note, P, UL } from '../ui';

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
    { id: 'retired', label: '편성 제외' },
  ],
};

export default function Doc() {
  return (
    <>
      <H2 id="slots">부위</H2>
      <P>
        부위는 무기·방어구·장신구 셋이다. 보급 상자도 이 구분을 그대로 따라가고, 부위가 늘거나 줄지
        않는다.
      </P>
      <P>
        같은 부위 안에서 아이템끼리 성능 차이는 없다. 등급이나 부가 능력치가 없어서 아이템을 가르는
        것은 그림과 이름, 도감에 붙은 이야기고, 세기는 강화 수치와 초월 단계에서만 갈린다.
      </P>

      <H2 id="record">보유 방식</H2>
      <P>
        보유 장비는 종류마다 한 칸이다. 같은 장비를 다시 뽑아도 칸이 늘지 않고, 두 번째부터는 그 칸의{' '}
        <DocLink slug="transcend">초월</DocLink> 진행도로 들어간다.
      </P>
      <P>
        같은 장비를 수치별로 여러 개 모아 둘 수는 없다. 한 칸에 적힌 강화 수치와 초월 단계가 그 장비의
        전부다.
      </P>
      <Note>
        장비를 없애는 수단은 없다. 분해나 판매가 없고 다른 장비를 재료로 쓰는 절차도 없어서, 한 번 얻은
        칸은 계정에 계속 남는다.
      </Note>

      <H2 id="equip">장착과 교체</H2>
      <P>
        부위마다 하나씩 장착한다. 같은 부위에 다른 장비를 올리면 먼저 있던 것이 자동으로 내려오고,
        내려온 장비는 그대로 인벤토리에 남는다. 장착을 풀어 부위를 비워 둘 수도 있다.
      </P>
      <P>
        장착이 정하는 것은 겉모습이다. 프로필과 아바타, 공유 카드에 나오는 세트가 지금 장착한 셋이다.
      </P>

      <H2 id="keep">미장착 장비</H2>
      <P>장착하지 않은 장비도 그대로 쓰인다.</P>
      <UL>
        <LI>
          <DocLink slug="combat-power">전투력</DocLink>은 보유 기준으로 합산한다. 장착하지 않은 장비도
          총합에 들어간다.
        </LI>
        <LI>강화는 장착 여부와 상관없이 아무 장비에나 건다.</LI>
        <LI>상자에서 중복으로 나오면 장착하지 않은 장비도 초월이 오른다.</LI>
      </UL>
      <P>
        장착을 바꿔도 전투력은 변하지 않는다. 마음에 드는 조합을 걸어 두고 강화는 다른 장비로 돌려도
        손해가 없다.
      </P>

      <H2 id="retired">편성 제외</H2>
      <P>
        편성에서 빠진 아이템은 그 뒤로 보급 상자에서 나오지 않고, 확률 공시의 목록에서도 빠진다.
      </P>
      <P>
        이미 가진 칸은 그대로 남는다. 강화도 걸리고 전투력에도 계속 들어가지만, 중복이 더 들어올 길이
        없어서 그 장비의 초월은 그 자리에서 멈춘다.
      </P>
      <P>
        같이 보면 좋은 문서: <DocLink slug="supply">보급</DocLink>,{' '}
        <DocLink slug="combat-power">전투력</DocLink>, <DocLink slug="avatar">아바타</DocLink>.
      </P>
    </>
  );
}
