import {
  NICKNAME_CHANGE_COST_DIAMOND,
  PROFILE_FIRST_GEN_DIAMOND,
  PROFILE_GENERATION_DIAMOND,
  PROFILE_GEN_SLOT_MINUTES,
  PROFILE_MAX,
} from '@/lib/game/balance';

import type { WikiDocMeta } from '../registry';
import { fmtInt, fmtMs } from '../fmt';
import { DocLink, Fn, FnList, H2, LI, P, UL, Warn } from '../ui';

export const meta: WikiDocMeta = {
  slug: 'avatar',
  cat: '계정',
  title: '아바타와 프로필',
  summary: '아바타 만드는 법, 드는 다이아, 검토와 환불.',
  sections: [
    { id: 'create', label: '생성' },
    { id: 'cost', label: '비용' },
    { id: 'review', label: '검토' },
    { id: 'refund', label: '환불' },
    { id: 'manage', label: '대표 설정' },
    { id: 'nickname', label: '닉네임' },
  ],
};

export default function Doc() {
  return (
    <>
      <H2 id="create">생성</H2>
      <UL>
        <LI>아바타는 프로필의 아바타 관리에서 만든다. 고르는 것은 성별 하나.</LI>
        <LI>
          생김새에는 요청할 때 <DocLink slug="equipment" hash="equip">장착</DocLink>한{' '}
          <DocLink slug="equipment" hash="slots">무기·방어구·장신구</DocLink> 3종이 반영된다.
        </LI>
        <LI>표정과 종족, 머리 길이는 무작위. 같은 장비로 다시 만들어도 결과는 매번 다르다.</LI>
        <LI>장비 3종을 모두 장착해야 생성할 수 있다.</LI>
        <LI>생성은 한 번에 한 건. 앞의 것이 끝나야 다음을 넣는다.</LI>
        <LI>완성되면 알림과 우편함으로 온다.</LI>
        <LI>
          아바타는 <DocLink slug="glossary" hash="account">서버</DocLink>마다 따로 쌓인다. 다른
          서버에서 만든 아바타는 이 서버에서 못 쓴다.
        </LI>
      </UL>

      <H2 id="cost">비용</H2>
      <UL>
        <LI>
          생성은 <DocLink slug="glossary" hash="goods">다이아</DocLink>{' '}
          {fmtInt(PROFILE_GENERATION_DIAMOND)}개. 한 번도 성공한 적이 없으면 첫 생성만{' '}
          {fmtInt(PROFILE_FIRST_GEN_DIAMOND)}개.
          <Fn n={1} />
        </LI>
        <LI>할인은 서버마다 한 번뿐이다. 쓰고 싶은 장비를 다 갖춘 뒤에 쓰는 것이 좋다.</LI>
        <LI>다이아는 요청과 동시에 빠진다.</LI>
        <LI>
          아바타는 10분 안팎이면 나온다. 슬롯은 {fmtMs(PROFILE_GEN_SLOT_MINUTES * 60_000)}에 하나씩
          빈다.
          <Fn n={2} />
        </LI>
      </UL>

      <H2 id="review">검토</H2>
      <UL>
        <LI>생성이 끝나면 자동 검토를 거친다.</LI>
        <LI>통과한 아바타만 목록에 들어온다.</LI>
        <LI>떨어지면 검토 미통과 우편이 온다.</LI>
      </UL>

      <H2 id="refund">환불</H2>
      <UL>
        <LI>검토에서 떨어지면 전액 환불.</LI>
        <LI>생성 도중 오류가 나면 전액 환불.</LI>
        <LI>아바타가 오래 나오지 않아 생성이 실패로 끝나면 전액 환불.</LI>
        <LI>환불은 우편으로 온다. 받은 다이아로 곧바로 다시 만들면 된다.</LI>
      </UL>
      <Warn>
        통과한 아바타는 환불되지 않는다. 마음에 안 들면 비용을 다시 내고 새로 만들어야 하고, 지워도
        다이아는 돌아오지 않는다.
      </Warn>

      <H2 id="manage">대표 설정</H2>
      <UL>
        <LI>아바타는 서버마다 {fmtInt(PROFILE_MAX)}개까지 갖는다.</LI>
        <LI>목록에서 하나를 골라 적용하면 대표가 된다. 언제든 바꾼다.</LI>
        <LI>대표는 헤더 썸네일과 프로필, 자랑 카드, 채팅 미니 프로필에 뜬다.</LI>
        <LI>
          마지막 한 개와 기본 아바타는 삭제할 수 없다.
          <Fn n={3} />
        </LI>
      </UL>

      <H2 id="nickname">닉네임</H2>
      <UL>
        <LI>
          첫 변경은 무료. 그다음부터 한 번에 {fmtInt(NICKNAME_CHANGE_COST_DIAMOND)} 다이아.
          <Fn n={4} />
        </LI>
        <LI>이름은 전 서버를 통틀어 하나뿐이라, 다른 사람이 쓰는 이름으로는 바꿀 수 없다.</LI>
      </UL>

      <FnList
        notes={[
          <>
            할인폭은 {fmtInt(PROFILE_GENERATION_DIAMOND - PROFILE_FIRST_GEN_DIAMOND)} 다이아. 할인은
            성공했을 때 사라지고, 검토에서 떨어진 시도는 다음도 할인가다. 만든 아바타를 지워도 할인은
            돌아오지 않는다.
          </>,
          '슬롯이 다 차 있으면 대기 순서와 예상 시간이 뜬다. 붐빌 때는 더 걸린다.',
          '대표로 걸어 둔 아바타를 지우면 남은 것 중 가장 최근 아바타가 대표가 된다.',
          '무료 한 번은 캐릭터마다 따로 센다. 새 서버에서는 다시 한 번 무료다.',
        ]}
      />
      <P>
        같이 보면 좋은 문서: <DocLink slug="equipment">장비와 장착</DocLink>,{' '}
        <DocLink slug="titles">칭호</DocLink>, <DocLink slug="moderation">신고와 제재</DocLink>.
      </P>
    </>
  );
}
