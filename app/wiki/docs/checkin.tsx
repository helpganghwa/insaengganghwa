import {
  CHECKIN_CALENDAR,
  CHECKIN_COMPLETE_BONUS_DIAMOND,
  CHECKIN_CYCLE_DAYS,
  checkinRewardForDay,
  isCheckinMilestone,
  type CheckinReward,
} from '@/lib/game/balance';

import type { WikiDocMeta } from '../registry';
import { fmtInt } from '../fmt';
import { DocLink, Fn, FnList, H2, LI, Note, P, Tbl, UL } from '../ui';

export const meta: WikiDocMeta = {
  slug: 'checkin',
  cat: '시작',
  title: '출석',
  summary: `하루 한 칸씩 받는 ${CHECKIN_CYCLE_DAYS}칸 보상, 연속으로 접속하지 않아도 이어진다.`,
  sections: [
    { id: 'claim', label: '수령' },
    { id: 'progress', label: '칸 진행' },
    { id: 'milestone', label: '마일스톤' },
    { id: 'bonus', label: '완주 보너스' },
    { id: 'calendar', label: '보상표' },
  ],
};

/** 상자 보상의 부위 이름 — 출석 팝업 표기와 같다. */
const SLOT_KO = { weapon: '무기', armor: '방어구', accessory: '장신구' } as const;

/** 칸 보상 한 줄 — 수량은 전부 CHECKIN_CALENDAR에서 파생한다. */
function rewardText(r: CheckinReward): string {
  if (r.kind === 'diamond') return `다이아 ${fmtInt(r.amount)}`;
  if (r.kind === 'supply') return `${SLOT_KO[r.slot]} 보급 상자 ${fmtInt(r.count)}개`;
  return `무기·방어구·장신구 보급 상자 각 ${fmtInt(r.perSlot)}개`;
}

/** 7의 배수 칸(마일스톤) — 번호와 보상 모두 캘린더에서 뽑는다. */
const MILESTONE_DAYS = CHECKIN_CALENDAR.map((_, i) => i + 1).filter(isCheckinMilestone);
const MILESTONE_LIST = MILESTONE_DAYS.map(
  (d) => `${fmtInt(d)}칸 ${rewardText(checkinRewardForDay(d))}`,
).join(' · ');

/** 마지막 칸 보상 — 완주 보너스와 함께 지급되는 쪽. */
const LAST_REWARD = checkinRewardForDay(CHECKIN_CYCLE_DAYS);

export default function Doc() {
  return (
    <>
      <H2 id="claim">수령</H2>
      <UL>
        <LI>홈에 그날 처음 들어오면 출석 팝업이 뜨고, 받기를 누르면 그 칸 보상이 들어온다.</LI>
        <LI>
          하루 한 칸이며, 한국 시간 자정이 지나면 다음 칸을 받을 수 있다.
          <Fn n={1} />
        </LI>
        <LI>
          받기 전에는 팝업이 닫히지 않는다.
          <Fn n={2} />
        </LI>
        <LI>
          받는 즉시 다이아는 <DocLink slug="diamond" hash="wallet">지갑</DocLink>에, 상자는{' '}
          <DocLink slug="supply" hash="boxes">보유 상자</DocLink>에 더해진다.
        </LI>
        <LI>출석 진행은 서버마다 따로 쌓인다.</LI>
      </UL>

      <H2 id="progress">칸 진행</H2>
      <UL>
        <LI>칸은 날짜가 아니라 받은 횟수를 따라간다.</LI>
        <LI>
          하루를 건너뛰어도 다음에 접속한 날 이어서 받는다.
          <Fn n={3} />
        </LI>
        <LI>팝업 위쪽에 며칠째인지와 몇 주 차인지 적힌다.</LI>
        <LI>아래 게이지 둘은 다음 마일스톤까지와 완주까지 남은 칸을 보여준다.</LI>
        <LI>
          {fmtInt(CHECKIN_CYCLE_DAYS)}칸을 다 받으면 다음에 접속한 날 1칸부터 다시 시작한다.
        </LI>
      </UL>

      <H2 id="milestone">마일스톤</H2>
      <UL>
        <LI>{MILESTONE_DAYS.map((d) => fmtInt(d)).join(' · ')}칸이 마일스톤 칸이다.</LI>
        <LI>보상은 {MILESTONE_LIST}.</LI>
        <LI>마일스톤 칸은 팝업에서 한 줄을 통째로 차지한다.</LI>
      </UL>

      <H2 id="bonus">완주 보너스</H2>
      <UL>
        <LI>
          {fmtInt(CHECKIN_CYCLE_DAYS)}칸째를 받으면 그 칸 보상({rewardText(LAST_REWARD)})에 완주
          보너스 다이아 {fmtInt(CHECKIN_COMPLETE_BONUS_DIAMOND)}개가 더해져 함께 들어온다.
        </LI>
        <LI>팝업의 받기 버튼과 수령 화면도 둘을 합친 값으로 표시된다.</LI>
        <LI>한 바퀴를 다시 채우면 완주 보너스도 다시 받는다.</LI>
      </UL>

      <H2 id="calendar">보상표</H2>
      <Tbl
        head={['칸', '보상']}
        firstColNowrap
        rows={CHECKIN_CALENDAR.map((r, i) => [`${fmtInt(i + 1)}칸`, rewardText(r)])}
      />
      <Note>
        칸 번호는 날짜가 아니라 지금까지 받은 횟수다. {fmtInt(CHECKIN_CYCLE_DAYS)}칸째 보상에는 완주
        보너스가 따로 붙는다.
      </Note>

      <FnList
        notes={[
          '자정을 넘겨 화면을 켜 두고 있어도 날짜가 바뀌면 팝업이 다시 뜬다.',
          '받고 난 뒤에는 팝업 바깥을 눌러 닫을 수 있다.',
          <>
            출석이 일주일 넘게 끊겼다가 다시 받으면 <DocLink slug="titles">칭호</DocLink>를 하나
            얻는다.
          </>,
        ]}
      />
      <P>
        같이 보면 좋은 문서: <DocLink slug="diamond">다이아</DocLink>,{' '}
        <DocLink slug="supply">보급</DocLink>.
      </P>
    </>
  );
}
