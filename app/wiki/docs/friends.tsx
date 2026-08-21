import { FRIEND_CAP } from '@/lib/game/friends';
import { INVITE_BOX_PER_REFERRAL, INVITE_DIAMOND_PER_REFERRAL } from '@/lib/game/referral/stats';

import type { WikiDocMeta } from '../registry';
import { fmtInt } from '../fmt';
import { DocLink, Fn, FnList, H2, LI, UL } from '../ui';

export const meta: WikiDocMeta = {
  slug: 'friends',
  cat: '사회',
  title: '친구와 초대',
  summary: '친구 추가와 상한, 카카오톡 초대 링크로 받는 다이아와 상자.',
  sections: [
    { id: 'add', label: '추가' },
    { id: 'cap', label: '상한' },
    { id: 'use', label: '친구 사이' },
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
        <LI>
          찾기에서 닉네임이나 코드로 상대를 찾는다. 닉네임은 일부만 넣어도 되고, 코드는 전부
          정확히 넣어야 한다.
          <Fn n={1} />
        </LI>
        <LI>친구 추가를 누르면 요청이 등록되고, 상대가 수락하면 친구가 된다.</LI>
        <LI>상대가 먼저 보낸 요청이 있으면 친구 추가를 누르는 순간 바로 친구가 된다.</LI>
        <LI>상대의 공개 프로필 아래에서도 친구 추가를 누를 수 있다.</LI>
        <LI>친구는 서버마다 따로 맺으며, 찾기에도 같은 서버의 유저만 나온다.</LI>
      </UL>

      <H2 id="cap">상한</H2>
      <UL>
        <LI>친구는 최대 {fmtInt(FRIEND_CAP)}명까지 등록할 수 있다.</LI>
        <LI>상대 목록이 가득 차 있어도 요청은 보낼 수 있지만 상대가 수락할 수 없다.</LI>
      </UL>

      <H2 id="use">친구 사이</H2>
      <UL>
        <LI>목록에서는 마지막 접속 정보를 확인할 수 있다.</LI>
        <LI>말풍선을 누르면 그 상대와 귓속말을 할 수 있다.</LI>
        <LI>
          <DocLink slug="raid" hash="join">
            레이드
          </DocLink>
          를 소환할 때 친구 공개를 켜면 친구들의 레이드 참가 가능 목록에 노출된다.
        </LI>
        <LI>채팅에서 상대를 차단하면 친구도 자동으로 해제된다. 차단을 풀어도 친구는 복구되지
          않으며, 다시 친구가 되려면 새로 요청해야 한다.</LI>
      </UL>

      <H2 id="invite">초대 링크</H2>
      <UL>
        <LI>초대 링크는 프로필의 내 프로필 자랑하기에서 만들 수 있다.</LI>
        <LI>
          프로필의 카카오톡 공유 가입 보상 칸에서 초대한 친구 수와 지금까지 초대 보상으로 받은
          다이아·상자를 볼 수 있다.
        </LI>
      </UL>

      <H2 id="reward">초대 보상</H2>
      <UL>
        <LI>
          내 링크로 새로 가입한 한 명마다 다이아 {fmtInt(INVITE_DIAMOND_PER_REFERRAL)}개와{' '}
          <DocLink slug="supply" hash="boxes">
            보급 상자
          </DocLink>{' '}
          {fmtInt(INVITE_BOX_PER_REFERRAL)}개가 보상으로 지급된다.
        </LI>
        <LI>상자는 부위마다 {fmtInt(INVITE_BOX_PER_SLOT)}개씩 나뉘어 들어온다.</LI>
        <LI>
          링크를 누른 뒤에 새로 만든 계정만 초대로 인정된다. 이미 계정이 있는 사람이 링크를 열어도
          보상은 지급되지 않는다.
        </LI>
        <LI>
          초대 보상은 우편함으로 지급된다.
          <Fn n={2} />
        </LI>
      </UL>

      <FnList
        notes={[
          '내 코드는 설정의 계정에서 볼 수 있다.',
          '친구 초대 알림을 켜 두면 초대한 사람이 가입하는 즉시 알림으로 알려 준다.',
        ]}
      />
    </>
  );
}
