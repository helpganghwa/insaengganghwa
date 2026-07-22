import { redirect } from 'next/navigation';

/**
 * /checkin — 페이지 폐기(2026-07-22): 출석은 홈 자동 팝업(CheckinPopup)으로 이동.
 * 북마크·구링크·도전과제 구버전 이동 대비 홈 리다이렉트만 유지(actions.ts는 팝업이 사용).
 */
export default function CheckinRedirect() {
  redirect('/');
}
