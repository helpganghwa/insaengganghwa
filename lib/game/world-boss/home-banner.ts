/**
 * 홈 월드보스 배너 닫힘 쿠키 이름 — 서버(홈 page.tsx가 렌더 전에 읽음)와 클라이언트(✕가 씀)가 같이 쓴다.
 * ⚠ 'use client' 파일에서 export한 값은 서버 컴포넌트로 들어올 때 클라이언트 참조 객체가 되어 문자열이 아니다(10-11 사고) — 그래서 순수 모듈에 둔다.
 */
export const WORLD_BOSS_BANNER_COOKIE = 'ig_wb_banner_closed';
