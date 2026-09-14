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
    // ⚠ 반드시 **행위자(사용자·고객·구매자)가 붙은** 꼴만 이탈로 본다. 처음엔 '취소되었습니다' 같은
    // 종결형만으로도 잡았는데, "카드사에서 승인이 취소되었습니다"·"한도 초과로 거래가 취소되었습니다"
    // 같은 **PG·카드사 측 실패**까지 이탈로 오분류해 경보를 삼켰다(2026-09-14 재점검에서 발견).
    // 주어가 없는 '취소'는 누가 취소했는지 모르는 것이고, 모르면 오류로 본다(fail-safe).
    '(사용자|고객|구매자|이용자).{0,8}(취소|중단|이탈)', // "사용자가 결제를 취소하였습니다", "고객 취소"
    '(취소|중단).{0,6}(사용자|고객|구매자|이용자)',       // "결제 취소(사용자)", "중단: 고객"
    '결제창.{0,6}(닫|종료|이탈)',
    'user[ _-]?cancel',
    'cancell?ed by (the )?user',
    'aborted by user',
  ].join('|'),
  'i',
);

/**
 * ⚠ 취소로 보면 **안 되는** 문구 — '취소'가 들어가지만 유저 이탈이 아닌 것.
 * 이게 없으면 "취소할 수 없는 거래입니다" 같은 진짜 오류가 조용히 묻힌다.
 */
const NOT_CANCEL_TEXT =
  /취소.{0,6}(불가|실패|할 수 없|되지 않|안 됨)|cannot be cancell?ed|cancel(l?ed)? fail(ed)?|카드사|승인.{0,4}(거절|거부|취소|실패)|한도|잔액|유효하지|만료|정지|도난|분실|점검|오류|에러|error|declin|insufficient|expired|invalid/i;

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
