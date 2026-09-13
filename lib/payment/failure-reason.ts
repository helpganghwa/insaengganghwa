/**
 * 결제 실패 사유 분류 — **유저가 결제창에서 그만둔 것**과 **진짜 결제 오류**를 가른다(2026-09-13).
 *
 * 왜: 포트원 `Transaction.Failed` 웹훅은 유저가 결제창을 닫거나 취소를 눌러도 온다. 종전엔 그것만으로
 * 곧바로 '결제 사고' 경보가 울려, 실서버 4건이 전부 오경보였다 — 셋은 **같은 유저가 1~4분 안에
 * 결제를 성공**시켰고(헤이론 68,000원, 글라시안 1,000원, 도헤 4,900원), 나머지 하나는 한 계정의
 * 반복 이탈이었다. 경보가 늑대 소년이 되면 진짜 사고 때 무시하게 된다.
 *
 * 분류 근거는 포트원이 주는 실패 사유(`failure.reason` / `pgCode` / `pgMessage`)다. PG마다 코드
 * 체계가 달라 코드 목록만으로는 못 덮으므로 **문구 키워드도 함께** 본다. 그리고 **모르면 진짜 오류로
 * 본다**(fail-safe) — 놓친 사고보다 오경보 한 번이 낫다.
 *
 * 순수 함수 — 네트워크·DB 없음. 테스트 tests/payment/failure-reason.test.ts.
 */

export type PaymentFailureInfo = {
  reason?: string | null;
  pgCode?: string | null;
  pgMessage?: string | null;
};

export type FailureVerdict = {
  /** 유저가 스스로 그만둔 것인가 — true면 경보·기록을 만들지 않는다. */
  userCancelled: boolean;
  /** 경보 본문에 넣을 한 줄 요약(사유 원문 기반, 없으면 '사유 미상'). */
  summary: string;
};

/**
 * 유저 이탈로 보는 PG 코드 — 정확히 일치할 때만. 이니시스·카카오페이·토스에서 관측되는 대표값과
 * 포트원 공통 코드. 새 PG를 붙이면 여기 추가하되, **빠져도 키워드 쪽에서 걸린다.**
 */
const CANCEL_CODES = new Set(
  [
    'USER_CANCEL',
    'PAY_PROCESS_CANCELED',
    'PAY_PROCESS_ABORTED',
    'USER_CANCELED',
    'CANCELED_BY_USER',
    'PG_PROVIDER_ERROR_USER_CANCEL',
    'V001', // 이니시스 — 사용자 취소
    'PAY-CANCEL',
  ].map((c) => c.toUpperCase()),
);

/**
 * 유저 이탈 문구 — 한국어 PG 메시지가 코드보다 신뢰도가 높다(코드는 PG마다 제각각).
 * ⚠ 낱말 사이에 조사가 낀다("결제**를** 취소했습니다") — `[^가-힣]*`로 막으면 못 잡는다(실측).
 */
const CANCEL_TEXT = new RegExp(
  [
    '사용자.{0,6}(취소|중단|이탈)', // "사용자가 결제를 취소", "사용자 중단"
    '고객.{0,6}취소',
    '구매자.{0,6}취소',
    '결제.{0,8}(취소|중단)(했|하였|되었|됐|함|합니다|됩니다)', // "결제를 취소했습니다"
    '취소(하였|했|되었|됐|하셨)', // 종결형 — '취소할 수 없는'은 아래 NOT_CANCEL이 먼저 막는다
    '결제창.{0,6}(닫|종료|이탈)',
    'user[ _-]?cancel',
    'cancell?ed by (the )?user',
    'payment (was )?cancell?ed',
    'aborted by user',
  ].join('|'),
  'i',
);

/**
 * ⚠ 취소로 보면 **안 되는** 문구 — '취소'가 들어가지만 유저 이탈이 아닌 것.
 * 이게 없으면 "취소할 수 없는 거래입니다" 같은 진짜 오류가 조용히 묻힌다.
 */
const NOT_CANCEL_TEXT = /취소.{0,6}(불가|실패|할 수 없|되지 않|안 됨)|cannot be cancell?ed|cancel(l?ed)? fail(ed)?/i;

function norm(s: string | null | undefined): string {
  return (s ?? '').trim();
}

export function classifyPaymentFailure(f: PaymentFailureInfo | null | undefined): FailureVerdict {
  const reason = norm(f?.reason);
  const pgCode = norm(f?.pgCode);
  const pgMessage = norm(f?.pgMessage);
  const text = [reason, pgMessage].filter(Boolean).join(' / ');
  const summary =
    [pgCode && `코드 ${pgCode}`, text].filter(Boolean).join(' — ') || '사유 미상(포트원이 실패 사유를 주지 않음)';

  // 사유를 하나도 못 받았으면 판단하지 않는다 — 모르면 진짜 오류로 본다(fail-safe).
  if (!reason && !pgCode && !pgMessage) return { userCancelled: false, summary };

  if (NOT_CANCEL_TEXT.test(text)) return { userCancelled: false, summary };
  if (pgCode && CANCEL_CODES.has(pgCode.toUpperCase())) return { userCancelled: true, summary };
  if (text && CANCEL_TEXT.test(text)) return { userCancelled: true, summary };
  return { userCancelled: false, summary };
}
