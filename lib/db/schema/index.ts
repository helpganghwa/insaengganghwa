/**
 * Drizzle 스키마 barrel — 도메인별 분할(CLAUDE §5.1). SCHEMA.md §1~§10과 1:1.
 * 도메인 추가 시 여기 export 확장.
 */
export * from './profiles'; // §1
export * from './equipment'; // §2 카탈로그/장비/도감
export * from './enhance'; // §3 강화 큐/로그/보석단축
export * from './transcend'; // §4 초월 로그
export * from './supply'; // §5 보급 상자/열기/분해
export * from './raid'; // §6 레이드
export * from './mailbox'; // §7 우편함
export * from './social'; // §8 공유/추천
export * from './payment'; // §9 결제/IAP/본인인증
export * from './ops'; // §10 운영/감사/안티치트
export * from './push'; // §11 PWA Web Push (v1: 강화·레이드·보급)
export * from './checkin'; // §12 출석 캘린더 (28일 누적·반복)
export * from './avatar'; // PROFILE — 캐릭터 프로필(8방향 rotations + 자동 검토 + 신고)
export * from './melee'; // §13 대난투 (Grand Melee) — 단일 글로벌 결정론 난투
