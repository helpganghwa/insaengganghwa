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
        보급소에서 부위를 골라 연다. 하나씩 열어도 되고 가진 만큼 한 번에 열어도 된다. 한 번에 열어도
        결과는 하나씩 뽑은 것과 같다.
      </P>
      <P>여는 데 드는 비용은 없다. 상자 자체가 재화다.</P>

      <H2 id="odds">확률</H2>
      <P>
        상자를 열면 그 부위에 편성된 아이템 가운데 하나가 나온다. 아이템마다 확률이 같아서, 1을 편성
        종수로 나눈 값이다.
      </P>
      <P>
        편성 종수는 늘거나 줄기 때문에 확률은 고정된 숫자 대신 규칙으로 공시한다. 지금 시점의 분모와
        아이템 목록은 <Ext href="/probability#supply">확률 공시</Ext>에서 본다.
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
        이미 가진 아이템이면 칸이 늘지 않고 그 장비의 초월 진행도로 쌓인다. 필요한 개수를 채우면 곧바로{' '}
        <DocLink slug="transcend">초월</DocLink> 단계가 오른다.
      </P>

      <H2 id="sources">획득처</H2>
      <UL>
        <LI>일일 보급: 매일 한국 시간 자정에 우편함으로 온다. 수령해야 들어온다.</LI>
        <LI>출석: 캘린더 칸 가운데 일부가 상자다.</LI>
        <LI>도전과제: 달성 보상에 상자가 걸린 항목이 있다.</LI>
        <LI>상점: 기간별 무료 수령, 다이아로 사는 묶음, 현금 패키지.</LI>
        <LI>
          <DocLink slug="raid">레이드</DocLink>: 페이즈를 하나 깰 때마다 참여자 전원이 받는다.
        </LI>
        <LI>대난투: 순위 보상에 들어 있다. 순위가 낮아도 참가분은 나온다.</LI>
        <LI>성장 패스: 초월 트랙의 단계 보상이 상자다.</LI>
        <LI>친구 초대와 이정표 우편에도 상자가 실린다.</LI>
      </UL>
      <P>
        같이 보면 좋은 문서: <DocLink slug="transcend">초월</DocLink>,{' '}
        <DocLink slug="equipment">장비와 장착</DocLink>.
      </P>
    </>
  );
}
