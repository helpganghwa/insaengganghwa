import { GEM_TO_MS } from '@/lib/game/balance';

import type { WikiDocMeta } from '../registry';
import { fmtInt, fmtMs } from '../fmt';
import { DocLink, H2, LI, Tbl, UL } from '../ui';

export const meta: WikiDocMeta = {
  slug: 'diamond',
  cat: '시작',
  title: '다이아',
  summary: '서버마다 따로 쌓이는 재화. 얻는 곳과 쓰는 곳, 시간을 줄이는 환산.',
  sections: [
    { id: 'gain', label: '획득처' },
    { id: 'use', label: '사용처' },
    { id: 'time', label: '시간 단축' },
  ],
};

export default function Doc() {
  return (
    <>
      <H2 id="gain">획득처</H2>
      <Tbl
        head={['획득처', '내용']}
        firstColNowrap
        rows={[
          ['가입', '서버에 처음 캐릭터를 생성할 때 지급된다.'],
          ['출석', '다이아 보상과 완주 보너스.'],
          [
            <><DocLink slug="about" hash="start">도전 과제</DocLink></>,
            '과제를 달성하면 지급된다.',
          ],
          [
            <><DocLink slug="supply" hash="sources">일일 보급</DocLink></>,
            '매일 자정 우편함에 들어온다.',
          ],
          [
            <><DocLink slug="shop" hash="free">상점 무료 수령</DocLink></>,
            '가입 선물과 주기마다 무료 지급.',
          ],
          [
            <><DocLink slug="melee" hash="reward">대난투</DocLink></>,
            '등수 보상이 발표와 함께 우편으로 지급된다.',
          ],
          ['성장패스', '구간을 달성할 때마다 보상.'],
          [
            <><DocLink slug="conquest" hash="tax">길드 세금</DocLink></>,
            '길드가 수금한 다이아를 배분.',
          ],
          [
            <><DocLink slug="expedition" hash="reward">파견</DocLink></>,
            '완료한 파견의 보상으로 지급된다.',
          ],
          [
            <><DocLink slug="friends">친구 초대</DocLink></>,
            '초대한 사람이 가입하면 우편으로 지급된다.',
          ],
          [
            <><DocLink slug="shop" hash="charge">충전</DocLink></>,
            '상점 충전 탭에서 구매.',
          ],
        ]}
      />

      <H2 id="use">사용처</H2>
      <Tbl
        head={['사용처', '내용']}
        firstColNowrap
        rows={[
          [
            <><DocLink slug="enhance" hash="gem">강화 단축</DocLink></>,
            '남은 시간을 줄여 확률을 바로 채운다.',
          ],
          [
            <><DocLink slug="raid" hash="open">레이드</DocLink></>,
            '보스 소환과 추가 공격에 사용.',
          ],
          [
            <><DocLink slug="shop" hash="box">보급 주머니</DocLink></>,
            '상점에서 보급 상자 묶음을 구매.',
          ],
          [
            <><DocLink slug="avatar" hash="nickname">닉네임 변경</DocLink></>,
            '첫 변경 다음부터 매번 사용.',
          ],
          [
            <><DocLink slug="avatar" hash="cost">아바타 생성</DocLink></>,
            '요청과 동시에 차감.',
          ],
          [
            <><DocLink slug="guild" hash="create">길드</DocLink></>,
            <>
              결성과 문양 제작, <DocLink slug="guild" hash="donate">기부</DocLink>에 사용.
            </>,
          ],
        ]}
      />

      <H2 id="time">시간 단축</H2>
      <UL>
        <LI>
          다이아 1개로 <DocLink slug="enhance" hash="gem">강화</DocLink>의 남은 시간이{' '}
          {fmtMs(GEM_TO_MS)} 줄어든다.
        </LI>
        <LI>남은 시간이 1분 이하여도 1분치를 사용한다.</LI>
      </UL>

    </>
  );
}
