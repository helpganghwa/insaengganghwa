import type { WikiDocMeta } from '../registry';
import { DocLink, Ext, Fn, FnList, H2, LI, UL } from '../ui';

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
        <LI>부위는 무기·방어구·장신구 세 부위.</LI>
        <LI>
          전투력을 정하는 것은 <DocLink slug="enhance">강화</DocLink> 수치와{' '}
          <DocLink slug="transcend">초월</DocLink> 단계뿐이며, 같은 수치면 어느 아이템이든 같다.
          <Fn n={1} />
        </LI>
      </UL>

      <H2 id="record">보유 방식</H2>
      <UL>
        <LI>보유 장비는 종류마다 하나.</LI>
        <LI>같은 장비를 다시 획득하면 개수가 늘지 않고 그 장비의 중복으로 쌓이며 초월 수치가 오른다.</LI>
      </UL>

      <H2 id="equip">장착과 교체</H2>
      <UL>
        <LI>부위마다 하나씩 장착한다.</LI>
        <LI>
          같은 부위에 다른 장비를 장착하면 기존 장비는 장착이 해제된다.
          <Fn n={2} />
        </LI>
        <LI>
          장착이 정하는 것은 단순 겉모습이며, 프로필과 <DocLink slug="avatar">아바타</DocLink>,
          공유 카드에 세트로 표시된다.
        </LI>
      </UL>

      <H2 id="keep">미장착 장비</H2>
      <UL>
        <LI>
          <DocLink slug="combat-power" hash="total">
            전투력
          </DocLink>
          은 보유 기준으로 합산하며, 장착하지 않은 장비도 총합에 들어간다.
        </LI>
        <LI>장착하지 않은 장비도 강화할 수 있다.</LI>
        <LI>상자에서 중복을 획득하면 장착하지 않은 장비도 초월이 오른다.</LI>
      </UL>

      <H2 id="retired">상자 제외</H2>
      <UL>
        <LI>
          상자에서 빠진 아이템은 보급에서 나오지 않는다.
          <Fn n={3} />
        </LI>
      </UL>

      <FnList
        notes={[
          '아이템마다 다른 것은 이미지와 이름, 이야기다.',
          '해제만 하고 부위를 비워 둘 수도 있다.',
          <>
            <Ext href="/probability#supply">확률 공시</Ext>의 활성 아이템 목록에서도 빠진다.
          </>,
        ]}
      />
    </>
  );
}
