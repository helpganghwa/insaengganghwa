/**
 * 위키 전용 종이 톤 팔레트 — 게임 셸(zinc + 앰버 픽셀아트)과 다른 얼굴을 만드는 근거.
 * 색을 클래스 문자열 상수로 두는 이유: 전역 CSS(app/globals.css)와 게임 토큰을 건드리지
 * 않고 위키 안에서만 일관성을 유지하기 위해서다.
 *
 * ⚠ 루트 <html>에 `dark`가 상시 부착돼 있고(app/layout.tsx) globals.css의
 *   `@custom-variant dark (&:where(.dark, .dark *))`가 클래스 기반이라, 실제로 렌더되는
 *   값은 언제나 ` 쪽이다. 라이트(크림) 값은 그 클래스가 토글되는 날의 대비다.
 */

/** 제목용 세리프 — 웹폰트 없이 시스템 스택만. 본문은 루트의 고딕(Geist)을 그대로 쓴다. */
export const SERIF = { fontFamily: "Georgia, 'Apple SD Gothic Neo', serif" } as const;

export const PAPER = {
  page: 'bg-[#f5f0e6] text-[#2a251e]',
  bar: 'border-[#e2d9c6] bg-[#f5f0e6]/85',
  card: 'border-[#e2d9c6] bg-[#fdfaf3]',
  border: 'border-[#e2d9c6]',
  muted: 'text-[#6d6455]',
  link: 'text-[#8a4b23]',
  hover: 'hover:bg-[#ece3d1]',
  active: 'bg-[#ece3d1]',
} as const;
