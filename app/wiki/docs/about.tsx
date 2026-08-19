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
  summary: '기다릴수록 확률이 오르는 방치형 강화 RPG의 얼개.',
  sections: [
    { id: 'time', label: '시간으로 강화한다' },
    { id: 'start', label: '처음 한 시간' },
    { id: 'day', label: '하루의 리듬' },
    { id: 'systems', label: '시스템 한눈에' },
  ],
};

export default function Doc() {
  return (
    <>
      <H2 id="time">시간으로 강화한다</H2>
      <P>
        강화 버튼을 누르면 결과가 아니라 완료 시각이 잡힌다. 그 시각까지 성공 확률이 0에서
        공시치까지 차오르고, 다 차면 거기서 멈춘다. 판정은 강화 카드를 눌러 수령하는 순간 서버가
        한 번 굴린다. 시간이 다 찬 뒤로는 언제 눌러도 확률이 같아서, 화면을 붙들고 있는 쪽과 자고
        일어나 한 번 들어오는 쪽의 기댓값이 다르지 않다.
      </P>
      <P>
        결과는 세 갈래다. 성공하면 한 단계 오르고, 유지면 그대로, 하락이면 한 단계 내려간다.
        하락은 사이클 시작점 +{fmtInt(SAFE_MAX_LEVEL)} 아래로는 내려가지 않고, 장비가 부서지거나
        사라지는 결과는 없다. 시도 자체에 드는 재료도 비용도 없다.
      </P>
      <P>
        올라갈수록 한 번이 길어진다. 첫 시도는 {fmtMs(enhanceDurationMs(0))},{' '}
        {fmtInt(CYCLE_LEN)}단위로 끊은 사이클의 마지막 단계는{' '}
        {fmtMs(enhanceDurationMs(CYCLE_LEN - 1))}이 걸린다. 사이클을 넘기면 확률 곡선은 처음부터
        다시 시작하고 시도 시간만 두 배가 된다. 한 사이클 끝인 +{fmtInt(CYCLE_LEN - 1)}까지는 매번
        끝까지 기다렸을 때 평균 {fmtMs(CUMULATIVE_REACH_ANCHORS_MS[99])}이 걸리도록 설계됐다.
      </P>
      <Warn>
        다이아로 남은 시간을 줄인 다음 그 강화를 취소하면 쓴 다이아는 돌아오지 않는다. 취소는
        진행 중인 시도를 통째로 버리는 조작이라 환불 경로가 없다.
      </Warn>

      <H2 id="start">처음 한 시간</H2>
      <P>
        가입하면 홈에 튜토리얼 팝업이 뜬다. 시작을 고르면 눌러야 할 자리에 스포트라이트가 하나씩
        붙는다. 보급소에서 상자 열기, 인벤토리에서 장착, 같은 자리에서 강화 누르기, 강화 슬롯 두
        번 탭 순서다. 마지막 슬롯은 첫 탭이 확인이고 한 번 더 눌러야 시도가 큐에 올라간다.
      </P>
      <P>
        진도는 저장된 번호를 따라가지 않고 계정 상태에서 매번 새로 뽑는다. 장비가 없으면 상자
        단계, 장비는 있는데 장착이 없으면 장착 단계로 잡힌다. 도중에 앱을 닫거나 다른 기기로
        들어와도 하던 자리에서 이어지고, 건너뛰기를 누르면 다시 뜨지 않는다.
      </P>
      <P>
        코치마크가 끝나면 홈 배너에 도전 과제 {fmtInt(CHALLENGES.length)}종이 남는다. 상자·장착·강화
        같은 기본기부터 길드 가입, 레이드 소환, 점령전 배치, 아바타 생성까지 게임의 창구를 한
        번씩 열어 보게 하는 일회성 목록이고, 항목마다 다이아와 보급 상자가 붙는다.
      </P>

      <H2 id="day">하루의 리듬</H2>
      <P>
        날짜 경계는 한국 시간 자정이며, 판단은 전부 서버 시계로 한다. 출석·일일 보급·레이드
        횟수·길드 기부가 그 선에서 함께 초기화된다. 접속하지 않은 날은 밀리지도 앞당겨지지도
        않는다.
      </P>
      <Tbl
        head={['때', '벌어지는 일']}
        rows={[
          [
            '자정',
            <>
              일일 보급이 우편함에 새로 꽂히고, 전날 점령전을 정리한 연대기가 열린다.
            </>,
          ],
          [
            '접속 직후',
            <>
              출석 팝업. {fmtInt(CHECKIN_CYCLE_DAYS)}칸을 다 채우면 다음 접속일부터 첫 칸으로
              돌아간다.
            </>,
          ],
          [
            '아침',
            <>
              대난투. 신청 절차가 없고 전투력이 있으면 명단에 자동으로 들어간다. 산출이 끝난 뒤
              정해진 시각에 결과와 리플레이가 한꺼번에 공개된다.
            </>,
          ],
          [
            '수시',
            <>
              강화 수령과 재등록, 보급 상자 열기. 레이드는 하루 {fmtInt(RAID_DAILY_CAP)}회까지
              열거나 참가할 수 있고 한 판 정원은 {fmtInt(RAID_MAX_PARTICIPANTS)}명이다.
            </>,
          ],
          [
            <>{fmtInt(CONQUEST_BATTLE_KST_HOUR)}시</>,
            <>
              점령전. 이 시각에 배치가 잠기고, 공격이 걸린 구역만 그날 전투를 치른다.
            </>,
          ],
        ]}
      />
      <Note>
        강화만 놓고 보면 하루에 손댈 일은 다 찬 카드를 눌러 수령하고 다음 시도를 거는 것뿐이다.
        나머지 일정은 안 챙겨도 강화 진행이 멈추지 않는다.
      </Note>

      <H2 id="systems">시스템 한눈에</H2>
      <Tbl
        head={['시스템', '무엇을 하는가']}
        rows={[
          [
            <><DocLink slug="enhance">강화</DocLink></>,
            '장비 한 점을 한 단계씩 올린다. 부위마다 두 줄씩 동시에 걸 수 있다.',
          ],
          [
            <><DocLink slug="transcend">초월</DocLink></>,
            '같은 장비를 다시 얻으면 진행도가 차고, 임계에 닿으면 자동으로 한 단계 오른다. 상한이 없다.',
          ],
          [
            <><DocLink slug="supply">보급</DocLink></>,
            '슬롯 상자를 열어 장비를 얻는다. 슬롯 안에서 균등하게 뽑고 천장은 없다.',
          ],
          [
            <><DocLink slug="equipment">장비와 장착</DocLink></>,
            '무기·방어구·장신구 세 슬롯. 등급도 성능 차이도 없고 생김새와 로어만 다르다.',
          ],
          [
            <><DocLink slug="combat-power">전투력</DocLink></>,
            '보유한 장비 전부에서 나온다. 착용한 세 점만 세는 것이 아니다.',
          ],
          [
            <><DocLink slug="raid">레이드</DocLink></>,
            '보스를 소환해 여럿이 함께 때린다. 페이즈를 넘길 때마다 참여자 전원이 상자를 받는다.',
          ],
          [
            <><DocLink slug="guild">길드</DocLink></>,
            '기부로 길드 레벨과 정원을 올리고, 점령전에 나갈 판을 만든다.',
          ],
          [
            <><DocLink slug="guild-roles">길드 권한</DocLink></>,
            '길드장이 항목별로 권한을 켜 준다. 집행관 지정과 세금 분배가 여기 걸린다.',
          ],
          [
            <><DocLink slug="conquest">점령전</DocLink></>,
            '구역을 걸고 하루 한 번 싸운다. 가진 길드는 그 구역에서 세금을 걷는다.',
          ],
          [
            <><DocLink slug="titles">칭호</DocLink></>,
            '조건을 채우면 발견되고, 그중 하나를 골라 닉네임 옆에 단다.',
          ],
          [
            <><DocLink slug="avatar">아바타와 프로필</DocLink></>,
            '착용 장비를 반영한 캐릭터 그림을 만들어 프로필과 공유 카드에 쓴다.',
          ],
          [
            <><DocLink slug="moderation">신고와 제재</DocLink></>,
            '채팅 메시지와 프로필 신고가 어떻게 처리되는지, 제재는 어떤 단계로 올라가는지.',
          ],
        ]}
      />
      <P>
        확률과 시간 수치의 정본은 게임 안 <Ext href="/probability">확률 공시</Ext>다. 위키에 적힌
        숫자도 같은 상수를 읽어 렌더한다. 낯선 말이 나오면{' '}
        <DocLink slug="glossary">용어 사전</DocLink>을, 판정 규칙의 세부가 궁금하면{' '}
        <DocLink slug="enhance">강화</DocLink>를 먼저 보면 된다.
      </P>
    </>
  );
}
