import type { WikiDocMeta } from '../registry';
import { DocLink, Ext, H2, LI, Note, P, UL } from '../ui';

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
      <P>
        보급 상자는 부위별로 나뉜다. 무기 상자에서는 무기만, 방어구 상자에서는 방어구만, 장신구
        상자에서는 장신구만 나온다.
      </P>
      <P>
        상자에 등급은 없다. 부위와 개수만 있고, 부위가 다른 상자끼리 바꾸거나 합치는 수단은 없다.
      </P>

      <H2 id="open">열기</H2>
      <P>
        보급소에서 부위별 상자를 연다. 1회 열기와 여러 회 열기가 있고, 한 번에 여는 것은 최대
        10회다. 한 번에 열어도 결과는 하나씩 연 것과 같다.
      </P>
      <P>여는 데 드는 비용은 없다. 가진 상자 개수가 그대로 여는 횟수다.</P>

      <H2 id="odds">확률</H2>
      <P>
        상자를 열면 그 부위의 활성 아이템 가운데 하나가 나온다. 아이템마다 확률이 같아서, 1을 활성
        종수로 나눈 값이다.
      </P>
      <P>
        활성 종수가 늘거나 줄면 확률도 같이 바뀐다. 지금 종수와 아이템 목록은{' '}
        <Ext href="/probability#supply">확률 공시</Ext>에서 본다.
      </P>
      <Note>
        천장은 없다. 여러 번 열어도 다음 결과가 유리해지지 않는다. 오래 안 나온 아이템에 붙는 보정도
        없다.
      </Note>

      <H2 id="result">결과</H2>
      <P>
        처음 나온 아이템은 그 자리에서 보유 장비가 되고 도감이 열린다. 강화 수치와 초월 단계는 0에서
        시작한다.
      </P>
      <P>
        이미 가진 아이템이면 장비가 늘지 않고 그 장비의 초월 진행도로 쌓인다. 필요한 개수를 채우면 곧바로{' '}
        <DocLink slug="transcend">초월</DocLink> 단계가 오른다.
      </P>

      <H2 id="sources">획득처</H2>
      <UL>
        <LI>일일 보급: 매일 한국 시간 자정에 우편함으로 온다. 수령해야 들어온다.</LI>
        <LI>출석: 날짜 칸 가운데 일부가 상자다.</LI>
        <LI>도전 과제: 달성 보상에 상자가 걸린 항목이 있다.</LI>
        <LI>상점: 기간별 무료 수령, 다이아로 사는 주머니, 유료 상품.</LI>
        <LI>
          <DocLink slug="raid">레이드</DocLink>: 페이즈를 하나 깰 때마다 참여자 전원이 받는다.
        </LI>
        <LI>대난투: 순위 보상에 들어 있다. 순위가 낮아도 상자는 들어온다.</LI>
        <LI>성장패스: 초월 패스의 단계 보상에 상자가 있다.</LI>
        <LI>친구 초대와 기록 달성 우편에도 상자가 실린다.</LI>
      </UL>
      <P>
        같이 보면 좋은 문서: <DocLink slug="transcend">초월</DocLink>,{' '}
        <DocLink slug="equipment">장비와 장착</DocLink>.
      </P>
    </>
  );
}
