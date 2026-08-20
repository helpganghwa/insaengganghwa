import type { WikiDocMeta } from '../registry';
import { DocLink, Ext, Fn, FnList, H2, LI, P, UL } from '../ui';

export const meta: WikiDocMeta = {
  slug: 'supply',
  cat: '성장',
  title: '보급',
  summary: '부위별 상자에서 장비가 나오는 확률과 상자를 얻는 곳.',
  sections: [
    { id: 'boxes', label: '상자 종류' },
    { id: 'open', label: '열기' },
    { id: 'odds', label: '확률' },
    { id: 'result', label: '결과' },
    { id: 'sources', label: '획득처' },
  ],
};

export default function Doc() {
  return (
    <>
      <H2 id="boxes">상자 종류</H2>
      <UL>
        <LI>
          보급 상자는{' '}
          <DocLink slug="equipment" hash="slots">
            부위
          </DocLink>
          별로 나뉜다. 무기·방어구·장신구 셋.
        </LI>
        <LI>무기 상자에서는 무기만 나오며, 나머지 둘도 마찬가지다.</LI>
      </UL>

      <H2 id="open">열기</H2>
      <UL>
        <LI>
          보급소에서 부위별로 연다. 상자 1개가 1회.
          <Fn n={1} />
        </LI>
      </UL>

      <H2 id="odds">확률</H2>
      <UL>
        <LI>
          상자를 열면 그 부위의{' '}
          활성 아이템{' '}
          가운데 하나를 획득한다.
        </LI>
        <LI>
          아이템마다 확률이 같다. 1을 활성 종수로 나눈 값.
          <Fn n={2} />
        </LI>
        <LI>
          지금 종수와 아이템 목록은 <Ext href="/probability#supply">확률 공시</Ext>에서 확인한다.
        </LI>
        <LI>종수가 적은 부위일수록 같은 아이템이 자주 중복되어 초월이 빨리 오른다.</LI>
      </UL>

      <H2 id="result">결과</H2>
      <UL>
        <LI>
          처음 획득한 아이템은 그 자리에서 보유 장비가 되고 도감
          <Fn n={3} />에 등록된다.
        </LI>
        <LI>
          <DocLink slug="enhance">강화</DocLink> 수치와{' '}
          <DocLink slug="transcend">초월</DocLink> 단계는 0에서 시작.
        </LI>
        <LI>이미 가진 아이템이면 장비가 늘지 않고 그 장비의 초월 진행도로 쌓인다.</LI>
      </UL>

      <H2 id="sources">획득처</H2>
      <UL>
        <LI>일일 보급: 매일 한국 시간 자정에 우편함으로 지급되며, 수령해야 들어온다.</LI>
        <LI>출석: 날짜 칸 가운데 일부가 상자.</LI>
        <LI>도전 과제: 달성 보상으로 상자가 지급되는 항목이 있다.</LI>
        <LI>
          상점: 기간별 무료 수령,{' '}
          다이아로 사는 주머니, 유료 상품.
        </LI>
        <LI>
          <DocLink slug="raid">레이드</DocLink>: 페이즈를 넘길 때마다 참여자 전원에게 지급된다.
        </LI>
        <LI>
          대난투: 순위 보상.
        </LI>
        <LI>성장패스: 초월 패스의 단계 보상.</LI>
        <LI>친구 초대와 기록 달성 우편.</LI>
      </UL>

      <FnList
        notes={[
          '1회 열기와 여러 회 열기가 있다. 한 번에 여는 것은 최대 10회.',
          '활성 종수가 늘거나 줄면 확률도 같이 바뀐다. 여러 번 열어도 다음 결과가 유리해지지는 않는다.',
          '지금까지 나온 아이템과 거기 붙은 이야기를 모아 보는 곳.',
        ]}
      />
      <P>
        같이 보면 좋은 문서: <DocLink slug="transcend">초월</DocLink>,{' '}
        <DocLink slug="equipment">장비와 장착</DocLink>.
      </P>
    </>
  );
}
