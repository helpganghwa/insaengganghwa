import { CYCLE_LEN, RAID_DAILY_CAP } from '@/lib/game/balance';
import { CHALLENGES } from '@/lib/game/challenges/defs';
import { CONQUEST_BATTLE_KST_HOUR } from '@/lib/game/guild/balance';

import type { WikiDocMeta } from '../registry';
import { fmtInt } from '../fmt';
import { DocLink, Ext, Fn, FnList, H2, LI, P, Tbl, UL, Warn } from '../ui';

export const meta: WikiDocMeta = {
  slug: 'about',
  cat: '시작',
  title: '인생강화란',
  summary: '시간으로 장비를 강화하는 방치형 강화 웹게임.',
  sections: [
    { id: 'intro', label: '개요' },
    { id: 'start', label: '초반 진행' },
    { id: 'daily', label: '일일 콘텐츠' },
    { id: 'list', label: '콘텐츠 목록' },
  ],
};

export default function Doc() {
  return (
    <>
      <H2 id="intro">개요</H2>
      <P>
        인생강화는 기다린 시간으로 장비를{' '}
        <DocLink slug="enhance" hash="flow">
          강화
        </DocLink>
        하는 방치형 웹게임이다. 강화를 시작하면 시간이 흐르는 만큼 성공 확률이 오르고, 결과는
        성공·유지·하락으로 갈린다. 강화 시도에는 시간 외에 다른 재화가 들지 않는다.
        <Fn n={1} />
      </P>
      <P>
        강화 {fmtInt(CYCLE_LEN)}단계가 한{' '}
        <DocLink slug="enhance" hash="cycle">
          주기
        </DocLink>
        이며, 확률은 주기마다 똑같이 반복되고 한 번 시도에 드는 시간만 주기를 넘길 때마다 두 배가
        된다.
      </P>
      <Warn>다이아로 시간을 줄인 강화를 취소하면 쓴 다이아는 돌려받지 못한다.</Warn>

      <H2 id="start">초반 진행</H2>
      <UL>
        <LI>
          튜토리얼을{' '}
          <DocLink slug="supply" hash="open">
            상자 열기
          </DocLink>{' '}
          →{' '}
          <DocLink slug="equipment" hash="equip">
            장착
          </DocLink>{' '}
          → 첫 강화 순서로 진행한다.
          <Fn n={2} />
        </LI>
        <LI>
          다음은 도전 과제 {fmtInt(CHALLENGES.length)}종.
          <Fn n={3} /> 보상으로{' '}
          <DocLink slug="glossary" hash="goods">
            다이아
          </DocLink>
          와{' '}
          <DocLink slug="supply" hash="boxes">
            보급 상자
          </DocLink>
          가 나온다.
        </LI>
      </UL>

      <H2 id="daily">일일 콘텐츠</H2>
      <UL>
        <LI>날짜는 한국 시간 자정에 바뀐다.</LI>
        <LI>
          출석,{' '}
          <DocLink slug="supply" hash="sources">
            일일 보급
          </DocLink>
          , 레이드 횟수,{' '}
          <DocLink slug="guild" hash="donate">
            길드 기부
          </DocLink>
          가 매일 초기화된다.
        </LI>
        <LI>
          강화 칸
          <Fn n={4} /> 6개는 늘 채워 두는 것이 좋다. 비워 두면 그만큼 시간이 낭비된다.
        </LI>
      </UL>
      <Tbl
        head={['때', '벌어지는 일']}
        rows={[
          // 9시·10시는 대난투 실행·발표 크론 일정(vercel.json melee-run UTC 0시 / melee-reveal UTC 1시).
          ['9시', '대난투. 전투력이 있으면 자동으로 참가된다.'],
          ['10시', '대난투 결과 발표. 보상이 우편으로 지급되고 결과를 볼 수 있다.'],
          [
            <>{fmtInt(CONQUEST_BATTLE_KST_HOUR)}시</>,
            <>
              점령전{' '}
              <DocLink slug="conquest" hash="deploy">
                배치
              </DocLink>{' '}
              마감.
            </>,
          ],
          [
            '자정',
            <>
              일일 보급이 우편함에 들어오고, 전날 점령전{' '}
              <DocLink slug="conquest" hash="chronicle">
                연대기
              </DocLink>
              가 발표된다.
            </>,
          ],
          [
            '수시',
            <>강화와 상자 열기. 레이드는 개설·참가 합쳐 하루 {fmtInt(RAID_DAILY_CAP)}회.</>,
          ],
        ]}
      />

      <H2 id="list">콘텐츠 목록</H2>
      <Tbl
        head={['콘텐츠', '설명']}
        rows={[
          [
            <>
              <DocLink slug="enhance">강화</DocLink>
            </>,
            '장비를 강화한다. 강화 칸은 부위당 2개.',
          ],
          [
            <>
              <DocLink slug="transcend">초월</DocLink>
            </>,
            '같은 장비를 중복 획득하면 단계가 올라간다.',
          ],
          [
            <>
              <DocLink slug="supply">보급</DocLink>
            </>,
            '상자를 열어 장비를 얻는다.',
          ],
          [
            <>
              <DocLink slug="equipment">장비와 장착</DocLink>
            </>,
            '무기·방어구·장신구 세 부위. 성능은 모두 같고 외형과 이야기가 다르다.',
          ],
          [
            <>
              <DocLink slug="combat-power">전투력</DocLink>
            </>,
            '착용 여부와 무관하게 가진 장비를 합산해서 계산된다.',
          ],
          [
            <>
              <DocLink slug="raid">레이드</DocLink>
            </>,
            '보스를 소환해 여럿이 함께 진행한다. 페이즈를 넘길 때마다 상자가 모두에게 지급된다.',
          ],
          [
            <>
              <DocLink slug="guild">길드</DocLink>
            </>,
            '기부로 길드 레벨을 올리고, 점령전을 진행한다.',
          ],
          [
            <>
              <DocLink slug="conquest">점령전</DocLink>
            </>,
            '지역을 걸고 하루 한 번 진행된다. 점령한 지역에서는 세금을 획득할 수 있다.',
          ],
          [
            <>
              <DocLink slug="titles">칭호</DocLink>
            </>,
            '조건을 만족하면 획득한다. 대표를 지정하면 닉네임 옆에 표시된다.',
          ],
          [
            <>
              <DocLink slug="avatar">아바타와 프로필</DocLink>
            </>,
            '착용 장비를 반영한 아바타를 생성한다.',
          ],
        ]}
      />

      <FnList
        notes={[
          <>
            남은 시간은 다이아로{' '}
            <DocLink slug="enhance" hash="gem">
              단축
            </DocLink>
            할 수 있다.
          </>,
          '중간에 나갔다 들어와도 이어지며, 건너뛰고 바로 시작해도 된다.',
          <>
            <DocLink slug="guild" hash="join">
              길드 가입
            </DocLink>
            ,{' '}
            <DocLink slug="raid" hash="open">
              레이드 소환
            </DocLink>
            ,{' '}
            <DocLink slug="conquest" hash="deploy">
              점령전 배치
            </DocLink>{' '}
            등이 있다.
          </>,
          '부위당 2개씩 총 6개. 장착하지 않은 장비도 강화 칸에 올릴 수 있다.',
        ]}
      />
      <P>
        확률과 시간은 게임 안 <Ext href="/probability">확률 공시</Ext>에서 볼 수 있다.
      </P>
    </>
  );
}
