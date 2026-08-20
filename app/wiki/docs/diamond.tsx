import { GEM_TO_MS } from '@/lib/game/balance';
import { RESIDENCE_SPEEDUP_GEM_PER_MIN } from '@/lib/game/guild/balance';

import type { WikiDocMeta } from '../registry';
import { fmtInt, fmtMs } from '../fmt';
import { DocLink, Fn, FnList, H2, LI, P, Tbl, UL, Warn } from '../ui';

export const meta: WikiDocMeta = {
  slug: 'diamond',
  cat: '시작',
  title: '다이아',
  summary: '서버마다 따로 쌓이는 재화. 얻는 곳과 쓰는 곳, 시간을 줄이는 환산.',
  sections: [
    { id: 'wallet', label: '지갑' },
    { id: 'gain', label: '획득처' },
    { id: 'use', label: '사용처' },
    { id: 'time', label: '시간 단축' },
  ],
};

export default function Doc() {
  return (
    <>
      <H2 id="wallet">지갑</H2>
      <UL>
        <LI>
          다이아는 서버마다 따로 쌓인다.
          <Fn n={1} />
        </LI>
        <LI>다른 서버에서 모은 다이아는 이 서버에서 쓰지 못한다.</LI>
        <LI>잔액은 화면 위쪽 헤더에 늘 표시된다.</LI>
        <LI>
          헤더의 다이아를 누르면 <DocLink slug="shop" hash="charge">상점 충전 탭</DocLink>이 열린다.
        </LI>
        <LI>
          우편으로 오는 보상은 우편함에서 받아야 지갑에 들어온다.
          <Fn n={2} />
        </LI>
      </UL>

      <H2 id="gain">획득처</H2>
      <Tbl
        head={['획득처', '내용']}
        firstColNowrap
        rows={[
          ['가입', '서버에 처음 들어갈 때 지급된다.'],
          [
            <><DocLink slug="checkin" hash="calendar">출석</DocLink></>,
            '매일 받는 칸 보상과 완주 보너스.',
          ],
          [
            <><DocLink slug="about" hash="start">도전 과제</DocLink></>,
            '항목마다 한 번씩, 달성하면 지급된다.',
          ],
          [
            <><DocLink slug="supply" hash="sources">일일 보급</DocLink></>,
            '매일 자정 우편함에 들어온다.',
          ],
          [
            <><DocLink slug="shop" hash="free">상점 무료 수령</DocLink></>,
            '가입 선물과 주기마다 열리는 무료 카드.',
          ],
          [
            <><DocLink slug="melee" hash="reward">대난투</DocLink></>,
            '등수 보상이 발표와 함께 우편으로 온다.',
          ],
          ['성장패스', '구간을 넘길 때마다 보상으로 나온다.'],
          [
            <><DocLink slug="conquest" hash="tax">길드 세금</DocLink></>,
            '집행관이 수금하면 그 몫이 바로 들어온다.',
          ],
          [
            <><DocLink slug="friends">친구 초대</DocLink></>,
            '초대한 사람이 가입하면 우편으로 온다.',
          ],
          [
            <><DocLink slug="avatar" hash="refund">아바타 환불</DocLink></>,
            '검토에서 떨어지면 낸 다이아가 되돌아온다.',
          ],
          [
            <><DocLink slug="shop" hash="charge">충전</DocLink></>,
            '상점 충전 탭에서 산다.',
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
            <>
              남은 시간을 줄여 확률을 먼저 채운다.
              <Fn n={3} />
            </>,
          ],
          [
            <><DocLink slug="raid" hash="open">레이드</DocLink></>,
            '보스 소환비와 추가 공격에 쓴다.',
          ],
          [
            <><DocLink slug="shop" hash="box">보급 주머니</DocLink></>,
            '상점에서 보급 상자 묶음을 산다.',
          ],
          [
            <><DocLink slug="avatar" hash="nickname">닉네임 변경</DocLink></>,
            '첫 변경 다음부터 매번 든다.',
          ],
          [
            <><DocLink slug="avatar" hash="cost">아바타 생성</DocLink></>,
            '요청과 동시에 차감된다.',
          ],
          [
            <><DocLink slug="guild" hash="create">길드</DocLink></>,
            <>
              결성과 문양 제작,{' '}
              <DocLink slug="guild" hash="donate">기부</DocLink>에 쓴다.
            </>,
          ],
          [
            <><DocLink slug="conquest" hash="residence">거주지 이동</DocLink></>,
            '남은 쿨타임을 줄인다.',
          ],
        ]}
      />
      <Warn>
        강화 슬롯을 해제하면 단축에 쓴 다이아를, 레이드에서 보스를 잡지 못하면 소환과 추가 공격에 쓴
        다이아를, 길드를 탈퇴하면 기부한 다이아를 그대로 잃는다.
      </Warn>

      <H2 id="time">시간 단축</H2>
      <UL>
        <LI>
          다이아 1개로 <DocLink slug="enhance" hash="gem">강화</DocLink>의 남은 시간이{' '}
          {fmtMs(GEM_TO_MS)} 줄어든다.
        </LI>
        <LI>
          <DocLink slug="conquest" hash="residence">거주지 이동</DocLink> 쿨타임도 남은 1분당 다이아{' '}
          {fmtInt(RESIDENCE_SPEEDUP_GEM_PER_MIN)}개로 환산이 같다.
        </LI>
        <LI>남은 시간을 한 번에 없애는 데 드는 다이아는 화면에 계산되어 나온다.</LI>
        <LI>남은 시간이 1분에 못 미쳐도 1분치를 낸다.</LI>
      </UL>

      <FnList
        notes={[
          '새 서버에 합류하면 그 서버에서 가입 보상을 다시 받는다.',
          '우편은 기한이 지나면 사라지고, 담겨 있던 보상도 함께 없어진다.',
          '자동 강화를 켜면 정해 둔 예산까지 단축과 강화를 반복한다.',
        ]}
      />
      <P>
        같이 보면 좋은 문서: <DocLink slug="shop">상점</DocLink>,{' '}
        <DocLink slug="checkin">출석</DocLink>, <DocLink slug="enhance">강화</DocLink>.
      </P>
    </>
  );
}
