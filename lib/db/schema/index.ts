/**
 * Drizzle 스키마 barrel — 도메인별 분할(CLAUDE §5.1). SCHEMA.md §1~§10과 1:1.
 * 도메인 추가 시 여기 export 확장.
 */
export * from './profiles'; // §1
export * from './equipment'; // §2 카탈로그/장비(카탈로그당 1레코드)
export * from './enhance'; // §3 강화 큐/로그/보석단축
export * from './transcend'; // §4 초월 로그
export * from './supply'; // §5 보급 상자/열기
export * from './raid'; // §6 레이드
export * from './mailbox'; // §7 우편함
export * from './social'; // §8 공유/추천
export * from './payment'; // §9 결제/IAP/본인인증
export * from './ops'; // §10 운영/감사/안티치트
export * from './push'; // §11 PWA Web Push (v1: 강화·레이드·보급)
export * from './checkin'; // §12 출석 캘린더 (28일 누적·반복)
export * from './avatar'; // PROFILE — 캐릭터 프로필(정면 rotations + 자동 검토 + 신고)
export * from './melee'; // §13 대난투 (Grand Melee) — 단일 글로벌 결정론 난투
export * from './battlepass'; // §14 배틀패스 (성장 패스 — 강화/초월, 만료 없음)
export * from './shop'; // §15 상점 무료 수령 (일일/주간/월간/가입 주기 멱등)
export * from './friends'; // §16 친구 (검색→요청→수락)
export * from './guild'; // §17 길드 (협력 성장 + 월드맵 점령전) — GUILD.md. ⚠ 마이그레이션 미적용 시 inert
export * from './server'; // §18 서버 (논리 분리 — 계정 전역/캐릭터 서버별) — SERVER.md
export * from './world'; // §19 월드 이벤트 피드 (홈 하단 WorldLogFeed) + 랭킹 1위 추적
export * from './support'; // §20 고객센터 문의 (인앱 접수 → 관리자 답변)
export * from './announcement'; // §20 공지사항 (게시판 — 어드민 작성·발행, 홈 카드/강제 팝업)
export * from './leaderboard'; // §21 리더보드 사전계산 스냅샷 (cron 재계산 — 읽기 경량화)
