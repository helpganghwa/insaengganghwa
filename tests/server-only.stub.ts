// vitest용 server-only 스텁 — 'server-only'는 클라이언트 번들에 들어가면 throw하는
// 가드인데 Node 테스트 환경에서도 React 컨텍스트 미탐지로 throw. 테스트에서는 빈
// 모듈로 alias(vitest.config.ts) → 서버 전용 코드도 안전하게 import 가능.
export {};
