import { getSessionUserId } from '@/lib/auth/session';
import { withTimeout } from '@/lib/db/with-timeout';
import { getCheckinState } from '@/lib/game/checkin';
import { kstDateString } from '@/lib/kst';

import { CheckinCalendar } from './CheckinCalendar';

/**
 * /checkin — 14일 출석 캘린더 (WIREFRAMES §1.1).
 *
 * 누적 출석(끊겨도 자리 유지). state.dayProgress=0~27, 다음 칸 1-index = dp+1.
 * 1일 1회 KST 자정 기준 멱등(BALANCE §7.3, SCHEMA §12).
 */
export default async function CheckinPage() {
  const userId = await getSessionUserId();
  if (!userId) return null; // (game) layout이 가드 — 폴백
  // 콜드 DB 커넥션 hang 시 페이지 무한 대기 방지 — 실패 시 신규 유저 기본값으로 degrade(2026-05-29).
  const state = await withTimeout(getCheckinState(userId), 3500, 'checkin.state').catch(() => ({
    dayProgress: 0,
    lastClaimedKstDay: null,
    totalClaimedCount: 0n,
  }));
  const kstToday = kstDateString();

  return (
    <div className="px-4 py-4">
      <CheckinCalendar
        initialDayProgress={state.dayProgress}
        initialLastClaimedKstDay={state.lastClaimedKstDay}
        kstToday={kstToday}
      />
    </div>
  );
}
