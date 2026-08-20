import { FRIEND_CAP } from '@/lib/game/friends';
import { INVITE_BOX_PER_REFERRAL, INVITE_DIAMOND_PER_REFERRAL } from '@/lib/game/referral/stats';

import type { WikiDocMeta } from '../registry';
import { fmtInt } from '../fmt';
import { DocLink, Fn, FnList, H2, LI, P, UL, Warn } from '../ui';

export const meta: WikiDocMeta = {
  slug: 'friends',
  cat: '사회',
  title: '친구와 초대',
  summary: '친구 추가와 상한, 카카오톡 초대 링크로 받는 다이아와 상자.',
  sections: [
    { id: 'add', label: '추가' },
    { id: 'cap', label: '상한' },
    { id: 'use', label: '친구 사이' },
    { id: 'manage', label: '정리' },
    { id: 'invite', label: '초대 링크' },
    { id: 'reward', label: '초대 보상' },
  ],
};

/** 초대 상자는 세 부위로 균등하게 나뉘어 우편에 담긴다 — 지급 코드와 같은 식. */
const INVITE_BOX_PER_SLOT = INVITE_BOX_PER_REFERRAL / 3;

export default function Doc() {
  return (
    <>
      <H2 id="add">추가</H2>
      <UL>
        <LI>친구 화면은 프로필에서 들어가며, 탭은 목록·요청·찾기 셋.</LI>
        <LI>
          찾기에서 닉네임이나 코드로 상대를 찾는다. 닉네임은 일부만 넣어도 되고, 코드는 전부
          정확히 넣어야 한다.
          <Fn n={1} />
        </LI>
        <LI>친구 추가를 누르면 요청이 등록되고, 상대가 수락하면 친구가 된다.</LI>
        <LI>상대가 먼저 보낸 요청이 있으면 친구 추가를 누르는 순간 바로 친구가 된다.</LI>
        <LI>상대의 공개 프로필 아래에서도 친구 추가를 누를 수 있다.</LI>
        <LI>받은 요청 수는 프로필의 친구 칸에 배지로 뜬다.</LI>
        <LI>친구는 서버마다 따로 맺으며, 찾기에도 같은 서버의 유저만 나온다.</LI>
      </UL>

      <H2 id="cap">상한</H2>
      <UL>
        <LI>친구는 {fmtInt(FRIEND_CAP)}명까지.</LI>
        <LI>내 목록이 가득 차면 요청을 보내는 것도 수락하는 것도 막힌다.</LI>
        <LI>상대 목록이 가득 차 있으면 수락 단계에서 막힌다.</LI>
        <LI>
          자리는 수락되는 순간에 정해진다. 요청을 여러 곳에 걸어 두어도 상한을 넘겨 친구가 되지는
          않는다.
        </LI>
      </UL>

      <H2 id="use">친구 사이</H2>
      <UL>
        <LI>목록에는 마지막 접속이 함께 뜨고, 최근에 접속한 사람이 위로 온다.</LI>
        <LI>화면 위에는 지금 접속 중인 인원이 표시된다.</LI>
        <LI>마지막 접속은 친구에게만 보인다.</LI>
        <LI>말풍선을 누르면 그 상대와의 귓속말 창이 열린다.</LI>
        <LI>줄을 누르면 상대 프로필로 넘어간다.</LI>
        <LI>
          <DocLink slug="raid" hash="join">
            레이드
          </DocLink>
          를 소환할 때 친구 공개를 켜면 친구들의 레이드 목록에 올라간다.
        </LI>
        <LI>
          지목해서 보내는 레이드 초대는 친구와 같은 <DocLink slug="guild">길드</DocLink> 사람에게만
          보낼 수 있다.
        </LI>
      </UL>

      <H2 id="manage">정리</H2>
      <UL>
        <LI>보낸 요청은 취소, 받은 요청은 거절할 수 있다.</LI>
        <LI>친구 삭제는 확인을 한 번 거치며, 다시 친구가 되려면 상대가 요청을 수락해야 한다.</LI>
        <LI>내가 차단한 상대는 찾기에서 차단함으로 뜨고, 차단을 풀어야 요청을 보낼 수 있다.</LI>
        <LI>차단한 상대가 보낸 요청은 받은 요청에 올라오지 않는다.</LI>
      </UL>

      <H2 id="invite">초대 링크</H2>
      <UL>
        <LI>초대 링크는 프로필의 자랑하기에서 만든다. 카카오톡 공유와 링크 복사 모두 같은 링크다.</LI>
        <LI>
          카카오톡으로 보낸 카드에는 인생강화 시작 버튼이 붙어 가입으로 바로 이어진다.
          <Fn n={2} />
        </LI>
        <LI>
          프로필의 카카오톡 공유 가입 보상 칸에서 초대한 친구 수와 지금까지 받은 다이아·상자를
          본다.
        </LI>
      </UL>

      <H2 id="reward">초대 보상</H2>
      <UL>
        <LI>
          내 링크로 새로 가입한 한 명마다 다이아 {fmtInt(INVITE_DIAMOND_PER_REFERRAL)}개와{' '}
          <DocLink slug="supply" hash="boxes">
            보급 상자
          </DocLink>{' '}
          {fmtInt(INVITE_BOX_PER_REFERRAL)}개.
        </LI>
        <LI>상자는 부위마다 {fmtInt(INVITE_BOX_PER_SLOT)}개씩 나뉘어 들어온다.</LI>
        <LI>
          링크를 누른 뒤에 새로 만든 계정만 초대로 인정된다. 이미 계정이 있는 사람이 링크를 열면
          보상은 붙지 않는다.
        </LI>
        <LI>
          링크를 연 브라우저에서 그대로 가입해야 초대가 이어진다.
          <Fn n={3} />
        </LI>
        <LI>
          한 사람의 가입은 한 번만 인정된다.
          <Fn n={4} />
        </LI>
        <LI>보상은 링크를 만든 서버로 오며, 초대받은 사람이 다른 서버에서 시작해도 같다.</LI>
        <LI>
          우편함에서 받아야 다이아와 상자가 들어온다.
          <Fn n={5} />
        </LI>
      </UL>
      <Warn>초대 보상 우편도 기한이 지나면 받을 수 없다. 남은 기한은 우편 카드의 D-로 뜬다.</Warn>

      <FnList
        notes={[
          '내 코드는 설정의 계정에서 볼 수 있다.',
          '카카오톡 안에서 열린 링크는 이 버튼이 기본 브라우저로 넘겨 준다.',
          '링크를 누른 기록은 그 브라우저에 얼마간 남는다. 브라우저를 바꾸거나 기록을 지우면 초대가 끊긴다.',
          '여러 사람의 링크를 눌렀다면 마지막에 누른 링크가 남는다.',
          '알림을 켜 두면 초대한 사람이 가입하는 즉시 알려 준다.',
        ]}
      />
      <P>
        같이 보면 좋은 문서: <DocLink slug="raid">레이드</DocLink>,{' '}
        <DocLink slug="guild">길드</DocLink>,{' '}
        <DocLink slug="avatar">아바타와 프로필</DocLink>.
      </P>
    </>
  );
}
