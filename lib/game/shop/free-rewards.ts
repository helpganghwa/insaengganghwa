/**
 * 상점 무료 수령 보상 수치 — 클라(표시)·서버(지급) **공용 단일 진실 원천**(catalog.ts와 같은 역할).
 *
 * 지급 로직(claimFree)이 있는 free.ts는 `server-only`라 클라이언트 컴포넌트가 읽을 수 없다.
 * 그래서 ShopTabs가 같은 수치를 손으로 베껴 두고 있었고, 지급액이 바뀔 때 표시만 옛 값으로
 * 남아 가입 선물이 💎5,000으로 걸린 채 실제로는 2,000만 들어갔다(2026-08-11). 수령 직후
 * 헤더 낙관적 가산·토스트까지 그 미러를 쓰고 있어 유저는 잠깐 +5,000을 보고 나서 2,000을 받았다.
 * 표시광고가 걸린 값이라 수치는 이 파일 하나만 두고 양쪽이 여기서만 읽는다 — 미러가 생길 자리를
 * 없애는 것이 목적이므로, 상점 UI에 숫자를 다시 적어 넣지 말 것.
 */
export type FreeSlot = 'daily' | 'weekly' | 'monthly' | 'signup';
export const FREE_SLOTS: FreeSlot[] = ['daily', 'weekly', 'monthly', 'signup'];

export const FREE_REWARDS: Record<FreeSlot, { diamond: number; boxes: number }> = {
  daily: { diamond: 0, boxes: 3 },
  weekly: { diamond: 0, boxes: 30 },
  monthly: { diamond: 0, boxes: 150 },
  signup: { diamond: 2000, boxes: 0 },
};
