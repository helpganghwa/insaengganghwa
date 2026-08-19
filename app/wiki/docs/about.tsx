import {
  CHECKIN_CYCLE_DAYS,
  CUMULATIVE_REACH_ANCHORS_MS,
  CYCLE_LEN,
  CYCLE_TIME_BASE,
  RAID_DAILY_CAP,
  RAID_MAX_PARTICIPANTS,
  SAFE_MAX_LEVEL,
  enhanceDurationMs,
} from '@/lib/game/balance';
import { CHALLENGES } from '@/lib/game/challenges/defs';
import { CONQUEST_BATTLE_KST_HOUR } from '@/lib/game/guild/balance';

import type { WikiDocMeta } from '../registry';
import { fmtInt, fmtMs } from '../fmt';
import { DocLink, Ext, Fn, FnList, H2, LI, P, Tbl, UL, Warn } from '../ui';

export const meta: WikiDocMeta = {
  slug: 'about',
  cat: '시작',
  title: '인생강화란',
  summary: '기다린 시간으로 장비를 올리는 방치형 강화 게임. 처음이라면 여기부터.',
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
        인생강화는 기다린 시간으로 장비를 올리는 방치형 게임이다.{' '}
        <DocLink slug="enhance" hash="flow">
          강화
        </DocLink>
        를 시작해 두면 시간이 흐르는 만큼 성공 확률이 오르고, 카드를 눌러 강화하면 결과가 나온다.
        시도는 무료다.
      </P>
      <P>
        결과는 성공 · 유지 · 하락 셋. +{fmtInt(SAFE_MAX_LEVEL)}까지는{' '}
        <DocLink slug="enhance" hash="result">
          안전 구간
        </DocLink>
        이라 실패해도 유지고, 그 위에서 떨어져도 한 번에 한 단계다.
      </P>
      <P>
        강화 {fmtInt(CYCLE_LEN)}단계가 한{' '}
        <DocLink slug="enhance" hash="cycle">
          주기
        </DocLink>
        다. 확률은 주기마다 똑같이 반복되고, 한 번 시도에 드는 시간만 주기를 넘길 때마다 두 배가
        된다.
        <Fn n={1} />
      </P>
      <Warn>다이아로 시간을 줄인 강화를 취소하면 쓴 다이아는 돌려받지 못한다.</Warn>

      <H2 id="start">초반 진행</H2>
      <UL>
        <LI>
          튜토리얼이{' '}
          <DocLink slug="supply" hash="open">
            상자 열기
          </DocLink>{' '}
          →{' '}
          <DocLink slug="equipment" hash="equip">
            장착
          </DocLink>{' '}
          → 첫 강화 순서로 잡아 준다.
          <Fn n={2} />
        </LI>
        <LI>
          다음은 도전 과제 {fmtInt(CHALLENGES.length)}종.
          <Fn n={3} /> 하나 깰 때마다{' '}
          <DocLink slug="glossary" hash="goods">
            다이아
          </DocLink>
          와{' '}
          <DocLink slug="supply" hash="boxes">
            보급 상자
          </DocLink>
          가 나온다.
        </LI>
        <LI>초반 다이아는 대부분 여기서 나오니, 목록부터 훑는 것이 낫다.</LI>
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
          가 그 선에서 함께 초기화된다.
        </LI>
        <LI>
          강화 칸
          <Fn n={4} /> 6개는 늘 채워 두는 것이 정석이다. 비워 두면 그만큼 하루 진행이 밀린다.
        </LI>
      </UL>
      <Tbl
        head={['때', '벌어지는 일']}
        rows={[
          [
            '자정',
            <>
              일일 보급이 우편함에 들어오고, 전날 점령전{' '}
              <DocLink slug="conquest" hash="chronicle">
                연대기
              </DocLink>
              가 열린다.
            </>,
          ],
          [
            '접속 직후',
            <>출석 팝업. {fmtInt(CHECKIN_CYCLE_DAYS)}칸을 채우면 다음 접속일부터 첫 칸으로.</>,
          ],
          ['아침', '대난투. 전투력만 있으면 자동으로 명단에 들고, 결과와 리플레이가 열린다.'],
          [
            '수시',
            <>
              강화와 상자 열기. 레이드는 개설·참가 합쳐 하루 {fmtInt(RAID_DAILY_CAP)}회, 한 판 정원{' '}
              {fmtInt(RAID_MAX_PARTICIPANTS)}명.
            </>,
          ],
          [
            <>{fmtInt(CONQUEST_BATTLE_KST_HOUR)}시</>,
            '점령전. 배치가 잠기고, 공격이 걸린 구역만 그날 싸운다.',
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
            '장비를 한 단계씩 올린다. 강화 칸은 부위당 2개.',
          ],
          [
            <>
              <DocLink slug="transcend">초월</DocLink>
            </>,
            '같은 장비를 또 얻으면 진행도가 차고, 다 차면 자동으로 오른다.',
          ],
          [
            <>
              <DocLink slug="supply">보급</DocLink>
            </>,
            '상자를 열어 장비를 얻는다. 상자 하나에 아이템 하나.',
          ],
          [
            <>
              <DocLink slug="equipment">장비와 장착</DocLink>
            </>,
            '무기·방어구·장신구 세 부위. 성능은 같고 생김새와 이야기가 다르다.',
          ],
          [
            <>
              <DocLink slug="combat-power">전투력</DocLink>
            </>,
            '착용 여부와 무관하게 가진 장비 전부에서 나온다.',
          ],
          [
            <>
              <DocLink slug="raid">레이드</DocLink>
            </>,
            '보스를 불러 여럿이 함께 때린다. 페이즈를 넘길 때마다 상자.',
          ],
          [
            <>
              <DocLink slug="guild">길드</DocLink>
            </>,
            '기부로 길드 레벨과 정원을 올리고, 점령전에 나갈 인원을 배치한다.',
          ],
          [
            <>
              <DocLink slug="guild-roles">길드 권한</DocLink>
            </>,
            '길드장이 항목별로 권한을 켠다. 집행관 지정과 세금 분배가 여기 걸린다.',
          ],
          [
            <>
              <DocLink slug="conquest">점령전</DocLink>
            </>,
            '구역을 걸고 하루 한 번 싸운다. 가진 구역에서는 세금이 나온다.',
          ],
          [
            <>
              <DocLink slug="titles">칭호</DocLink>
            </>,
            '조건을 채우면 발견되고, 그중 하나를 닉네임 옆에 단다.',
          ],
          [
            <>
              <DocLink slug="avatar">아바타와 프로필</DocLink>
            </>,
            '착용 장비를 반영한 캐릭터 그림. 프로필과 자랑 카드에 쓴다.',
          ],
          [
            <>
              <DocLink slug="moderation">신고와 제재</DocLink>
            </>,
            '채팅과 프로필을 신고하는 법, 제재가 올라가는 단계.',
          ],
        ]}
      />

      <FnList
        notes={[
          <>
            계산 예: 첫 시도 {fmtMs(enhanceDurationMs(0))}, +{fmtInt(CYCLE_LEN / 2)}에서{' '}
            {fmtMs(enhanceDurationMs(CYCLE_LEN / 2))}, +{fmtInt(CYCLE_LEN - 1)}에서{' '}
            {fmtMs(enhanceDurationMs(CYCLE_LEN - 1))}. 주기를 넘기면 여기에{' '}
            {fmtInt(CYCLE_TIME_BASE)}배가 붙어 +{fmtInt(2 * CYCLE_LEN - 1)}은 한 번에{' '}
            {fmtMs(enhanceDurationMs(2 * CYCLE_LEN - 1))}가 된다. 매번 다 기다렸다 올리면 +
            {fmtInt(CYCLE_LEN - 1)}까지 대략 {fmtMs(CUMULATIVE_REACH_ANCHORS_MS[99])}다.
          </>,
          '중간에 나갔다 들어와도 하던 자리에서 이어진다. 건너뛰고 바로 시작해도 된다.',
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
            </DocLink>
            처럼 콘텐츠를 한 번씩 해 보는 목록이다.
          </>,
          '부위당 2개씩 총 6개. 장착하지 않은 장비도 강화 칸에 올릴 수 있다.',
        ]}
      />
      <P>
        확률과 시간은 게임 안 <Ext href="/probability">확률 공시</Ext>에서 그대로 볼 수 있다. 낯선
        말이 나오면 <DocLink slug="glossary">용어 사전</DocLink>을 찾으면 된다.
      </P>
    </>
  );
}
