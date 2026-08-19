import {
  CHECKIN_CYCLE_DAYS,
  CUMULATIVE_REACH_ANCHORS_MS,
  CYCLE_LEN,
  RAID_DAILY_CAP,
  RAID_MAX_PARTICIPANTS,
  SAFE_MAX_LEVEL,
  enhanceDurationMs,
} from '@/lib/game/balance';
import { CHALLENGES } from '@/lib/game/challenges/defs';
import { CONQUEST_BATTLE_KST_HOUR } from '@/lib/game/guild/balance';

import type { WikiDocMeta } from '../registry';
import { fmtInt, fmtMs } from '../fmt';
import { DocLink, Ext, H2, Note, P, Tbl, Warn } from '../ui';

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
        인생강화는 기다린 시간으로 장비를 올리는 방치형 강화 게임이다. 강화를 시작해 두면 시간이
        흐르는 만큼 성공 확률이 오르고, 카드를 눌러 강화하면 결과가 나온다. 시도에 드는 비용은
        없다.
      </P>
      <P>
        결과는 성공, 유지, 하락 셋 중 하나다. +{fmtInt(SAFE_MAX_LEVEL)}까지는 하락이 없고, 그 위에서
        떨어져도 한 번에 한 단계다. 장비가 부서지거나 사라지는 일은 없다.
      </P>
      <P>
        강화 {fmtInt(CYCLE_LEN)}단계가 한 주기다. 확률은 주기마다 똑같이 반복되고, 한 번 시도에 드는
        시간만 주기를 넘길 때마다 두 배가 된다.
      </P>
      <P>
        첫 시도는 {fmtMs(enhanceDurationMs(0))}다. 올라갈수록 길어져서 한 주기 끝인 +
        {fmtInt(CYCLE_LEN - 1)}은 한 번에 {fmtMs(enhanceDurationMs(CYCLE_LEN - 1))} 걸리고, 매번
        끝까지 기다렸다 강화하면 +{fmtInt(CYCLE_LEN - 1)}까지 보통{' '}
        {fmtMs(CUMULATIVE_REACH_ANCHORS_MS[99])}이다.
      </P>
      <Warn>다이아로 시간을 줄인 강화를 취소하면 쓴 다이아는 돌려받지 못한다.</Warn>

      <H2 id="start">초반 진행</H2>
      <P>
        가입하면 홈에 튜토리얼이 뜬다. 시작을 고르면 눌러야 할 자리에 하나씩 표시가 붙는다.
        보급소에서 상자 열기, 인벤토리에서 장착, 같은 화면에서 강화 누르기 순서다.
      </P>
      <P>
        마지막 강화 슬롯은 첫 탭이 확인이라 한 번 더 눌러야 강화가 시작된다. 앱을 닫았다 들어와도
        하던 자리에서 이어지고, 건너뛰기를 누르면 다시 뜨지 않는다.
      </P>
      <P>
        튜토리얼이 끝나면 홈 배너에 도전 과제 {fmtInt(CHALLENGES.length)}종이 남는다. 길드 가입,
        레이드 소환, 점령전 배치처럼 한 번씩 해 보는 목록이고, 항목마다 다이아와 보급 상자를
        수령한다.
      </P>

      <H2 id="daily">일일 콘텐츠</H2>
      <P>
        날짜는 한국 시간 자정에 바뀐다. 출석, 일일 보급, 레이드 횟수, 길드 기부가 그 선에서 함께
        초기화된다.
      </P>
      <Tbl
        head={['때', '벌어지는 일']}
        rows={[
          ['자정', '일일 보급이 우편함에 들어오고, 전날 점령전을 정리한 연대기가 열린다.'],
          [
            '접속 직후',
            <>
              출석 팝업. {fmtInt(CHECKIN_CYCLE_DAYS)}칸을 다 채우면 다음 접속일부터 첫 칸으로
              돌아간다.
            </>,
          ],
          [
            '아침',
            '대난투. 신청 없이 전투력만 있으면 명단에 들어가고, 정해진 시각에 결과와 리플레이가 열린다.',
          ],
          [
            '수시',
            <>
              강화, 보급 상자 열기. 레이드는 하루 {fmtInt(RAID_DAILY_CAP)}회까지 열거나 참가할 수
              있고 한 판 정원은 {fmtInt(RAID_MAX_PARTICIPANTS)}명이다.
            </>,
          ],
          [
            <>{fmtInt(CONQUEST_BATTLE_KST_HOUR)}시</>,
            '점령전. 이 시각에 배치가 잠기고, 공격이 걸린 구역만 그날 싸운다.',
          ],
        ]}
      />
      <Note>강화만 하려면 다 찬 카드를 눌러 주면 된다. 나머지를 안 챙겨도 강화는 멈추지 않는다.</Note>

      <H2 id="list">콘텐츠 목록</H2>
      <Tbl
        head={['콘텐츠', '설명']}
        rows={[
          [
            <><DocLink slug="enhance">강화</DocLink></>,
            '장비를 한 단계씩 올린다. 강화 칸은 부위당 2개다.',
          ],
          [
            <><DocLink slug="transcend">초월</DocLink></>,
            '같은 장비를 또 얻으면 진행도가 차고, 다 차면 자동으로 한 단계 오른다.',
          ],
          [
            <><DocLink slug="supply">보급</DocLink></>,
            '상자를 열어 장비를 얻는다. 천장은 없다.',
          ],
          [
            <><DocLink slug="equipment">장비와 장착</DocLink></>,
            '무기·방어구·장신구 세 부위. 성능 차이가 없고 생김새와 이야기만 다르다.',
          ],
          [
            <><DocLink slug="combat-power">전투력</DocLink></>,
            '가진 장비 전부에서 나온다. 착용한 셋만 세는 게 아니다.',
          ],
          [
            <><DocLink slug="raid">레이드</DocLink></>,
            '보스를 불러 여럿이 함께 때린다. 페이즈를 넘길 때마다 상자를 받는다.',
          ],
          [
            <><DocLink slug="guild">길드</DocLink></>,
            '기부로 길드 레벨과 정원을 올리고, 점령전에 나갈 인원을 배치한다.',
          ],
          [
            <><DocLink slug="guild-roles">길드 권한</DocLink></>,
            '길드장이 항목별로 권한을 켠다. 집행관 지정과 세금 분배가 여기 걸린다.',
          ],
          [
            <><DocLink slug="conquest">점령전</DocLink></>,
            '구역을 걸고 하루 한 번 싸운다. 가진 구역에서는 세금이 나온다.',
          ],
          [
            <><DocLink slug="titles">칭호</DocLink></>,
            '조건을 채우면 발견되고, 그중 하나를 닉네임 옆에 단다.',
          ],
          [
            <><DocLink slug="avatar">아바타와 프로필</DocLink></>,
            '착용 장비를 반영한 캐릭터 그림을 만들어 프로필과 공유 카드에 쓴다.',
          ],
          [
            <><DocLink slug="moderation">신고와 제재</DocLink></>,
            '채팅과 프로필을 신고하는 법, 제재가 올라가는 단계.',
          ],
        ]}
      />
      <P>
        확률과 시간은 게임 안 <Ext href="/probability">확률 공시</Ext>에서 그대로 볼 수 있다. 낯선
        말이 나오면 <DocLink slug="glossary">용어 사전</DocLink>을 찾으면 된다.
      </P>
    </>
  );
}
