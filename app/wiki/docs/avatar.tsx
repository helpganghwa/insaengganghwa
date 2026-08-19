import {
  NICKNAME_CHANGE_COST_DIAMOND,
  PROFILE_FIRST_GEN_DIAMOND,
  PROFILE_GENERATION_DIAMOND,
  PROFILE_GEN_SLOT_MINUTES,
  PROFILE_MAX,
} from '@/lib/game/balance';

import type { WikiDocMeta } from '../registry';
import { fmtInt, fmtMs } from '../fmt';
import { DocLink, H2, LI, Note, P, UL, Warn } from '../ui';

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
      <P>
        아바타는 프로필의 아바타 관리에서 만든다. 고르는 것은 성별 하나고, 생김새에는 요청할 때
        장착한 무기·방어구·장신구 3종이 반영된다.
      </P>
      <P>
        표정과 종족, 머리 길이는 무작위로 나온다. 같은 장비로 다시 만들어도 결과는 매번 달라진다.
      </P>
      <UL>
        <LI>장비 3종을 모두 장착해야 생성할 수 있다.</LI>
        <LI>생성은 한 번에 한 건이다. 앞의 것이 끝나야 다음을 넣는다.</LI>
        <LI>아바타는 서버마다 따로 쌓인다. 다른 서버에서 만든 아바타는 이 서버에서 못 쓴다.</LI>
      </UL>
      <Note>요청을 넣고 화면을 벗어나도 진행된다. 끝나면 알림과 우편함으로 알려준다.</Note>

      <H2 id="cost">비용</H2>
      <P>
        생성에는 {fmtInt(PROFILE_GENERATION_DIAMOND)} 다이아가 든다. 아직 한 번도 성공한 적이 없으면
        첫 생성만 {fmtInt(PROFILE_FIRST_GEN_DIAMOND)} 다이아다. 할인은 성공했을 때만 없어져서 검토에서
        떨어진 시도는 다음도 할인가고, 만든 아바타를 지워도 할인은 돌아오지 않는다.
      </P>
      <P>
        다이아는 요청과 동시에 빠진다. 아바타는 10분 안팎이면 나오고, 생성 슬롯이 다 차 있으면 대기
        순서와 예상 시간이 뜬다. 슬롯은 {fmtMs(PROFILE_GEN_SLOT_MINUTES * 60_000)}에 하나씩 비어서
        붐빌 때는 더 걸린다.
      </P>

      <H2 id="review">검토</H2>
      <P>
        생성이 끝나면 자동 검토를 거친다. 통과한 아바타만 목록에 들어오고, 통과하지 못한 아바타는
        남지 않는다.
      </P>
      <P>떨어지면 검토 미통과 우편이 온다. 어디가 걸렸는지까지는 알려주지 않는다.</P>

      <H2 id="refund">환불</H2>
      <P>
        검토에서 떨어지면 다이아를 전액 돌려받는다. 우편으로 알림이 오고, 돌려받은 다이아로 곧바로
        다시 만들면 된다.
      </P>
      <UL>
        <LI>검토에서 떨어지면 전액 환불.</LI>
        <LI>생성 도중 오류가 나면 전액 환불.</LI>
        <LI>아바타가 오래 나오지 않아 생성이 실패로 끝나면 전액 환불.</LI>
      </UL>
      <Warn>
        통과한 아바타는 환불되지 않는다. 마음에 안 들면 비용을 다시 내고 새로 만들어야 하고, 지워도
        다이아는 돌아오지 않는다.
      </Warn>

      <H2 id="manage">대표 설정</H2>
      <P>
        아바타는 서버마다 {fmtInt(PROFILE_MAX)}개까지 갖는다. 목록에서 하나를 골라 적용하면 대표가
        되고, 헤더 썸네일과 프로필, 자랑 카드, 채팅 미니 프로필에 그 아바타가 뜬다.
      </P>
      <UL>
        <LI>대표는 언제든 바꾼다. 횟수 제한도 비용도 없다.</LI>
        <LI>마지막 한 개와 기본 아바타는 삭제할 수 없다.</LI>
        <LI>대표로 걸어 둔 아바타를 지우면 남은 것 중 가장 최근 아바타가 대표가 된다.</LI>
      </UL>

      <H2 id="nickname">닉네임</H2>
      <P>
        닉네임은 첫 변경만 무료고, 그다음부터는 한 번에{' '}
        {fmtInt(NICKNAME_CHANGE_COST_DIAMOND)} 다이아가 든다. 무료 한 번은 캐릭터마다 따로 세므로 새
        서버에서는 다시 한 번 무료다.
      </P>
      <P>이름은 전 서버를 통틀어 하나뿐이라, 다른 사람이 쓰는 이름으로는 바꿀 수 없다.</P>

      <P>
        같이 보면 좋은 문서: <DocLink slug="equipment">장비와 장착</DocLink>,{' '}
        <DocLink slug="titles">칭호</DocLink>, <DocLink slug="moderation">신고와 제재</DocLink>.
      </P>
    </>
  );
}
