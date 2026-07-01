// 고객센터 문의 유형 — 클라(폼)·서버(로직) 공용. server-only 아님.
export const INQUIRY_TYPES = [
  {
    id: 'payment',
    label: '결제 · 환불 문의',
    desc: '결제 오류, 환불 요청',
    note: '결제 일시와 상품명을 함께 적어주시면 빠르게 처리됩니다.',
  },
  {
    id: 'bug',
    label: '버그 · 오류 신고',
    desc: '게임 오류, 화면 깨짐',
    note: '발생한 화면, 사용 기기/브라우저, 발생 시각을 적어주세요.',
  },
  { id: 'account', label: '계정 · 로그인 문의', desc: '로그인 불가, 계정 문제' },
  { id: 'etc', label: '건의 · 기타', desc: '제안, 기타 문의' },
] as const;

export type InquiryType = (typeof INQUIRY_TYPES)[number]['id'];

export const INQUIRY_LABEL: Record<string, string> = Object.fromEntries(
  INQUIRY_TYPES.map((t) => [t.id, t.label]),
);

export const INQUIRY_IDS = new Set<string>(INQUIRY_TYPES.map((t) => t.id));

export const BODY_MIN = 5;
export const BODY_MAX = 2000;
export const ANSWER_MAX = 4000;
