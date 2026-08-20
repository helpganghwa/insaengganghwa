import { NICKNAME_CHANGE_COST_DIAMOND, PROFILE_GENERATION_DIAMOND } from '@/lib/game/balance';

import type { WikiDocMeta } from '../registry';
import { fmtInt } from '../fmt';
import { DocLink, Ext, Fn, FnList, H2, LI, P, Tbl, UL, Warn } from '../ui';

export const meta: WikiDocMeta = {
  slug: 'moderation',
  cat: '사회',
  title: '신고와 제재',
  summary: '신고 넣는 자리와 처리 절차, 제재 종류, 차단과 문의.',
  sections: [
    { id: 'report', label: '신고 경로' },
    { id: 'rules', label: '신고 규칙' },
    { id: 'process', label: '처리 절차' },
    { id: 'sanction', label: '제재 종류' },
    { id: 'block', label: '차단' },
    { id: 'support', label: '문의' },
  ],
};

export default function Doc() {
  return (
    <>
      <H2 id="report">신고 경로</H2>
      <P>
        신고는 대상이 있는 자리에서 한다. <DocLink slug="avatar">프로필</DocLink>은 프로필 화면에서,
        채팅은 그 메시지에서.
      </P>
      <Tbl
        head={['대상', '위치', '고르는 것']}
        rows={[
          ['프로필', '상대 프로필 화면의 신고', '부적절한 닉네임 · 부적절한 아바타 · 버그 악용 · 기타'],
          ['전체·길드 채팅', '메시지 본문을 눌러 나오는 확인 창', '사유 선택 없음'],
          ['귓속말', '상대 메시지 본문을 눌러 나오는 확인 창', '사유 선택 없음'],
        ]}
      />

      <H2 id="rules">신고 규칙</H2>
      <UL>
        <LI>버그 악용과 기타로 신고할 때는 내용을 적는다.</LI>
        <LI>같은 프로필을 같은 사유로 두 번 신고할 수 없다. 사유가 다르면 따로 접수된다.</LI>
      </UL>

      <H2 id="process">처리 절차</H2>
      <UL>
        <LI>신고를 넣으면 운영자가 확인한다.</LI>
        <LI>
          조치는 사유에 맞춰 걸리며, 위반한 것만 되돌린다.
          <Fn n={1} />
        </LI>
      </UL>

      <H2 id="sanction">제재 종류</H2>
      <Tbl
        head={['제재', '내용']}
        rows={[
          ['경고', '우편으로 통지된다. 바뀌는 것은 없다.'],
          [
            '닉네임 초기화',
            <>
              닉네임이 임시 이름으로 바뀌고, 새 이름을 정하도록 변경 비용{' '}
              {fmtInt(NICKNAME_CHANGE_COST_DIAMOND)}{' '}
              다이아가 우편으로 지급된다.
            </>,
          ],
          [
            '아바타 초기화',
            <>
              문제가 된 <DocLink slug="avatar" hash="create">아바타</DocLink>를 지우고 기본 아바타로
              되돌리며, 생성 비용 {fmtInt(PROFILE_GENERATION_DIAMOND)} 다이아가 우편으로 지급된다.
            </>,
          ],
          ['채팅 금지', '정해진 기간 동안 전체 채팅과 귓속말을 보낼 수 없다. 읽기는 된다.'],
          ['메시지 숨김', '문제가 된 메시지만 다른 사람에게 보이지 않게 한다.'],
          ['계정 정지', '기간을 정하거나 기한 없이 건다. 게임 화면 대신 정지 안내가 표시된다.'],
        ]}
      />
      <Warn>
        제재는 계정에 걸린다. 닉네임 초기화와 채팅 금지, 계정 정지는{' '}
        서버를 가리지 않고 그 계정의 모든 캐릭터에
        적용되고, 정지 중에는 <DocLink slug="enhance">강화</DocLink>와{' '}
        <DocLink slug="raid">레이드</DocLink>를 비롯한 모든 조작이 막힌다.
      </Warn>
      <UL>
        <LI>
          <DocLink slug="guild" hash="create">길드</DocLink> 이름은 결성할 때 정하고 나면 길드장도
          바꿀 수 없다.
          <Fn n={2} />
        </LI>
      </UL>

      <H2 id="block">차단</H2>
      <UL>
        <LI>
          차단은 그 사람을 내 화면에서 지우는 기능이다. 차단해도 운영에 접수되지 않고 제재로도
          이어지지 않는다.
        </LI>
        <LI>채팅에서 닉네임을 눌러 나오는 미니 프로필에서 차단한다.</LI>
        <LI>
          차단하면 그 사람의 채팅이 내 목록에서 사라지고, 서로 귓속말을 주고받을 수 없다.
          <Fn n={3} />
        </LI>
        <LI>차단은 계정 단위로 걸리며, 차단 목록에서 언제든 해제한다.</LI>
        <LI>규정 위반이 아니라 나와 맞지 않는 정도라면 신고 대신 차단을 쓴다.</LI>
      </UL>

      <H2 id="support">문의</H2>
      <UL>
        <LI>문의는 설정의 고객센터 문의에서 넣는다.</LI>
        <LI>유형은 결제·환불, 버그·오류, 계정·로그인, 건의·기타. 내용과 함께 화면 사진도 올린다.</LI>
        <LI>답변은 우편함으로 발송되고, 도착하면 알림이 표시된다.</LI>
        <LI>제재에 이의가 있어도 같은 창구로 넣는다.</LI>
        <LI>
          계정이 정지돼 게임에 들어갈 수 없을 때는 정지 화면에 적힌{' '}
          <Ext href="mailto:help@ganghwa.app">help@ganghwa.app</Ext>으로 보낸다.
        </LI>
      </UL>

      <FnList
        notes={[
          '닉네임이 걸리면 닉네임만, 아바타가 걸리면 아바타만 되돌린다.',
          '부적절한 길드 이름은 우편으로 통지되며, 문의로 새 이름을 접수하면 변경된다.',
          '아직 수락하지 않은 친구 요청은 양쪽 모두 정리된다.',
        ]}
      />
      <P>
        같이 보면 좋은 문서: <DocLink slug="avatar">아바타와 프로필</DocLink>,{' '}
        <DocLink slug="guild">길드 기본</DocLink>, <DocLink slug="about">인생강화란</DocLink>.
      </P>
    </>
  );
}
