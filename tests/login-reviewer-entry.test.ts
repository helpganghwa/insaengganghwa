import { describe, expect, it } from 'vitest';

/**
 * 스토어 심사 진입로(2026-09-11) — 앱(TWA)은 주소창이 없어 `?test=true`를 붙일 수 없다.
 * 로그인 화면은 **앱으로 열렸을 때만** 심사용 링크를 노출해야 하고, 웹에는 절대 나오면 안 된다.
 * 페이지가 서버 컴포넌트라 소스의 분기 조건을 직접 검증한다(렌더 테스트 대신 회귀 고정).
 */
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../app/login/page.tsx', import.meta.url), 'utf8');

describe('로그인 심사 진입로', () => {
  it('앱(TWA)이면서 아직 심사 모드가 아닐 때만 노출한다', () => {
    expect(SRC).toContain('const showReviewerEntry = !reviewLogin && (await isTwa());');
  });

  it('링크는 ?test=true로 가고, 한국어·영어를 함께 적어 심사관이 찾을 수 있다', () => {
    const block = SRC.slice(SRC.indexOf('showReviewerEntry ? ('), SRC.indexOf('showReviewerEntry ? (') + 400);
    expect(block).toContain('href="/login?test=true"');
    expect(block).toMatch(/심사용 로그인[^<]*Reviewer sign-in/);
  });

  it('비밀번호 없이 바로 로그인되는 원클릭 경로를 만들지 않는다', () => {
    expect(SRC).not.toMatch(/signInAsReviewer|oneClickLogin|autoLogin/);
  });
});
