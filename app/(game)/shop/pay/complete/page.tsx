import { PayComplete } from './PayComplete';

/**
 * 결제 복귀 페이지 — 모바일 리다이렉트 결제가 끝나면 포트원이 redirectUrl(여기)로 돌아온다.
 * 쿼리의 paymentId(우리 주문키) + code(있으면 실패/취소)를 클라가 받아 서버 검증·지급 확인.
 * 실제 지급은 웹훅이 이미 처리했을 수 있고(멱등), 여기 verify는 즉시 확인·UX 표시용.
 */
export default async function PayCompletePage({
  searchParams,
}: {
  searchParams: Promise<{ paymentId?: string; code?: string; message?: string }>;
}) {
  const { paymentId, code, message } = await searchParams;
  return <PayComplete paymentId={paymentId ?? null} errorCode={code ?? null} errorMessage={message ?? null} />;
}
