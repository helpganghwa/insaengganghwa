import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// 최소 Vitest 설정 — CLAUDE §1/§5.4. 현재는 순수 함수 테스트만(BALANCE 결정 로직).
// DB 통합 테스트(resolveEnhance 등)는 분리 풀·fixture cleanup 인프라 갖춘 뒤 추가.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    globals: false,
    reporters: ['default'],
  },
});
