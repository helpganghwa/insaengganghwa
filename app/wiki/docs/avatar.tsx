import {
  NICKNAME_CHANGE_COST_DIAMOND,
  PROFILE_FIRST_GEN_DIAMOND,
  PROFILE_GENERATION_DIAMOND,
  PROFILE_GEN_SLOT_MINUTES,
  PROFILE_MAX,
} from '@/lib/game/balance';

import type { WikiDocMeta } from '../registry';
import { fmtInt, fmtMs } from '../fmt';
import { DocLink, H2, LI, Note, P, Tbl, UL, Warn } from '../ui';

export const meta: WikiDocMeta = {
  slug: 'avatar',
  cat: '계정',
  title: '아바타와 프로필',
  summary: '아바타를 만드는 절차와 비용, 검토·환불 규칙, 대표 설정.',
  sections: [
    { id: 'create', label: '생성' },
    { id: 'cost', label: '비용과 소요' },
    { id: 'review', label: '자동 검토' },
    { id: 'refund', label: '환불' },
    { id: 'manage', label: '보관과 대표' },
    { id: 'nickname', label: '닉네임' },
  ],
};

export default function Doc() {
  return (
    <>
      <H2 id="create">생성</H2>
      <P>
        아바타는 프로필의 아바타 관리에서 만든다. 고르는 것은 성별 하나뿐이고, 나머지 외형은
        요청 시점에 장착한 무기·방어구·장신구 세 종의 생김새에서 뽑는다. 표정과 종족, 머리
        길이는 서버가 무작위로 정한다. 같은 장비로 다시 만들어도 결과는 매번 달라진다.
      </P>
      <UL>
        <LI>무기·방어구·장신구를 모두 장착해야 요청할 수 있다.</LI>
        <LI>동시에 진행하는 요청은 한 건이다. 앞의 요청이 끝나야 다음을 넣는다.</LI>
        <LI>아바타는 서버별 자산이다. 다른 서버에서 만든 아바타는 이 서버 캐릭터에 달 수 없다.</LI>
      </UL>
      <Note>
        요청을 넣은 뒤 화면을 벗어나도 진행된다. 끝나면 우편과 알림으로 알려준다.
      </Note>

      <H2 id="cost">비용과 소요</H2>
      <P>
        생성 비용은 {fmtInt(PROFILE_GENERATION_DIAMOND)} 다이아다. 아직 한 번도 성공한 적이
        없다면 첫 생성만 {fmtInt(PROFILE_FIRST_GEN_DIAMOND)} 다이아로 깎인다. 할인은 성공했을
        때만 소진되므로 검토에서 떨어진 시도는 다음 시도도 할인가다. 만든 아바타를 지워도 할인이
        되살아나지는 않는다.
      </P>
      <P>
        다이아는 요청과 동시에 빠지고, 결과가 나올 때까지 잡혀 있다. 그림이 나오기까지는 십 분
        안팎이 걸리며, 생성 자리가 다 차 있으면 순서를 기다린다. 대기 화면에 뜨는 예상 시간은 한
        자리가 도는 데 {fmtMs(PROFILE_GEN_SLOT_MINUTES * 60_000)} 걸린다고 보고 계산한 값이라,
        붐비는 시간대에는 더 걸릴 수 있다.
      </P>

      <H2 id="review">자동 검토</H2>
      <P>
        그림이 완성되면 자동 검토를 거치고, 통과한 것만 아바타 목록에 들어온다. 검토는 안전과
        형태만 본다. 색·머리 길이·체형·자세·화풍이 생각과 다른 것은 실패 사유가 아니다.
      </P>
      <Tbl
        head={['항목', '떨어지는 경우']}
        rows={[
          ['안전', '선정적 묘사, 훼손된 신체가 드러난 유혈, 혐오 상징'],
          ['형태', '팔·다리·머리·눈의 개수가 사람과 다름, 몸에서 뻗어 나온 여분의 팔다리'],
          ['무기', '장착 무기가 조각나 떨어져 있음, 손에 닿지 않은 채 떠 있음, 아예 없음'],
          ['성별', '고른 성별과 명백히 반대로 나옴'],
          ['화면', '하반신이 화면 아래로 잘려 발이 없음, 배경이 투명하지 않음'],
          ['비율', '머리가 몸에 견줘 지나치게 커서 인체 비율이 무너짐'],
        ]}
      />
      <P>
        판정은 보수적이다. 각도 때문에 팔 하나가 가려진 경우, 활처럼 팔로 오해받기 쉬운 물건을
        든 경우, 무기가 망토나 몸 뒤로 일부 숨은 경우는 통과시킨다.
      </P>

      <H2 id="refund">환불</H2>
      <P>
        검토를 통과하지 못하면 잡아 둔 다이아를 전액 돌려주고 우편으로 사유를 보낸다. 환불된
        다이아로 곧바로 다시 만들 수 있다.
      </P>
      <UL>
        <LI>검토 탈락 — 전액 환불.</LI>
        <LI>생성 도중 시스템 오류 — 전액 환불.</LI>
        <LI>그림이 오래 나오지 않거나 대기열에서 지나치게 오래 묶인 경우 — 실패 처리 후 전액 환불.</LI>
      </UL>
      <Warn>
        검토를 통과한 아바타는 환불 대상이 아니다. 결과가 마음에 들지 않으면 비용을 다시 내고
        새로 만들어야 한다. 아바타를 삭제해도 다이아는 돌아오지 않는다.
      </Warn>

      <H2 id="manage">보관과 대표</H2>
      <P>
        아바타는 서버마다 {fmtInt(PROFILE_MAX)}개까지 갖는다. 목록에서 하나를 골라 적용하면 대표
        아바타가 되고, 헤더의 얼굴 썸네일과 프로필, 공유 카드, 채팅 미니 프로필에 그 아바타가
        쓰인다.
      </P>
      <UL>
        <LI>대표는 언제든 바꿀 수 있고 횟수 제한이나 비용이 없다.</LI>
        <LI>마지막 한 개는 삭제할 수 없다.</LI>
        <LI>기본 아바타는 삭제할 수 없다. 신고 처리로 되돌아갈 자리이기 때문이다.</LI>
        <LI>대표로 걸어 둔 아바타를 지우면 남은 것 중 가장 최근 아바타가 대표가 된다.</LI>
      </UL>

      <H2 id="nickname">닉네임</H2>
      <P>
        닉네임은 첫 변경만 무료고, 이후로는 한 번에 {fmtInt(NICKNAME_CHANGE_COST_DIAMOND)}{' '}
        다이아가 든다. 무료 횟수는 캐릭터마다 따로 세므로 새 서버에서는 다시 한 번 무료다. 이름
        자체는 전 서버를 통틀어 하나뿐이라, 다른 사람이 쓰는 이름으로는 바꿀 수 없다.
      </P>

      <P>
        관련 문서 — <DocLink slug="equipment">장비와 장착</DocLink> ·{' '}
        <DocLink slug="titles">칭호</DocLink> ·{' '}
        <DocLink slug="moderation">신고와 제재</DocLink>
      </P>
    </>
  );
}
