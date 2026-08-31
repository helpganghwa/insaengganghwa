import {
  NICKNAME_CHANGE_COST_DIAMOND,
  PROFILE_FIRST_GEN_DIAMOND,
  PROFILE_GENERATION_DIAMOND,
  PROFILE_MAX,
} from '@/lib/game/balance';

import type { WikiDocMeta } from '../registry';
import { fmtInt } from '../fmt';
import { DocLink, Fn, FnList, H2, LI, UL, Warn } from '../ui';

export const meta: WikiDocMeta = {
  slug: 'avatar',
  cat: '계정',
  title: '아바타와 프로필',
  summary: '아바타 만드는 법, 드는 다이아, 검토와 환불, 반환.',
  sections: [
    { id: 'create', label: '생성' },
    { id: 'cost', label: '비용' },
    { id: 'review', label: '검토' },
    { id: 'refund', label: '환불' },
    { id: 'return', label: '반환' },
    { id: 'manage', label: '대표 설정' },
    { id: 'nickname', label: '닉네임' },
  ],
};

export default function Doc() {
  return (
    <>
      <H2 id="create">생성</H2>
      <UL>
        <LI>
          아바타는 프로필의 아바타 관리에서 만들 수 있다.
          <Fn n={1} />
        </LI>
        <LI>
          요청할 때 <DocLink slug="equipment" hash="equip">장착</DocLink>한{' '}
          <DocLink slug="equipment" hash="slots">무기·방어구·장신구</DocLink> 3종이 아바타 외형에
          반영된다.
        </LI>
        <LI>
          표정과 종족, 머리 스타일 등은 무작위이며, 같은 장비로 다시 만들어도 결과는 매번 다르다.
        </LI>
        <LI>장비 3종을 모두 장착해야 생성할 수 있다.</LI>
        <LI>생성은 한 번에 한 건이며, 앞의 것이 끝나야 다음을 요청할 수 있다.</LI>
        <LI>아바타는 서버마다 따로 쌓인다.</LI>
      </UL>

      <H2 id="cost">비용</H2>
      <UL>
        <LI>
          생성은 다이아 {fmtInt(PROFILE_GENERATION_DIAMOND)}개. 첫 생성만{' '}
          {fmtInt(PROFILE_FIRST_GEN_DIAMOND)}개.
        </LI>
        <LI>다이아는 요청과 동시에 차감된다.</LI>
      </UL>

      <H2 id="review">검토</H2>
      <UL>
        <LI>생성이 끝나면 자동 검토를 거치고, 통과한 아바타는 목록에 추가된다.</LI>
        <LI>
          검토에 통과하지 못하면 검토 미통과 우편이 발송되며 생성에 사용된 다이아는 환불된다.
        </LI>
      </UL>

      <H2 id="refund">환불</H2>
      <UL>
        <LI>검토에서 떨어지면 전액 환불.</LI>
        <LI>아바타가 오래 나오지 않아 생성이 실패로 끝나면 전액 환불.</LI>
        <LI>환불은 우편으로 지급된다.</LI>
        <LI>
          성별이 바뀌거나 신체가 변형되는 등 아바타가 명백히 잘못 생성된 경우에는 설정의 고객센터로
          문의할 수 있다.
        </LI>
      </UL>
      <Warn>통과한 아바타는 환불되지 않는다. 마음에 들지 않으면 아래 반환을 이용한다.</Warn>

      <H2 id="return">반환</H2>
      <UL>
        <LI>아바타 관리에서 아바타를 선택하고 반환을 누르면 그 아바타는 즉시 회수되어 되돌릴 수 없다.</LI>
        <LI>
          운영자가 확인한 뒤 다이아를 우편으로 지급한다. 장비가 반영되지 않았거나 결과에 뚜렷한
          문제가 있었다면 생성에 쓴 다이아 전액, 그 밖의 경우(단순 변심 등)는 절반.
        </LI>
        <LI>기준 금액은 그 아바타를 만들 때 실제로 낸 다이아다. 첫 생성 할인가로 만든 아바타는 할인가 기준.</LI>
        <LI>기본 아바타, 마지막으로 남은 아바타, 신고 처리 중인 아바타는 반환할 수 없다.</LI>
      </UL>

      <H2 id="manage">대표 설정</H2>
      <UL>
        <LI>아바타는 서버마다 {fmtInt(PROFILE_MAX)}개까지 보유할 수 있다.</LI>
        <LI>아바타는 언제든 바꿀 수 있다.</LI>
        <LI>대표 아바타는 헤더 썸네일과 프로필, 공유 카드, 채팅 미니 프로필 등에 표시된다.</LI>
        <LI>
          기본 아바타는 반환할 수 없다.
          <Fn n={2} />
        </LI>
      </UL>

      <H2 id="nickname">닉네임</H2>
      <UL>
        <LI>
          첫 변경은 무료. 그다음부터 한 번에 {fmtInt(NICKNAME_CHANGE_COST_DIAMOND)} 다이아가
          필요하다.
        </LI>
        <LI>이름은 전 서버를 통틀어 중복 변경이 되지 않는다.</LI>
      </UL>

      <FnList
        notes={[
          '아바타 생성 슬롯이 다 차 있으면 대기 순서와 예상 시간이 표시된다.',
          '대표로 지정해 둔 아바타를 반환하면 남은 아바타 중 가장 최근 아바타가 대표가 된다.',
        ]}
      />
    </>
  );
}
