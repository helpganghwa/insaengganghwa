import { describe, expect, it } from 'vitest';

/**
 * 스토어 심사 진입로(2026-09-11) — 앱(TWA)은 주소창이 없어 `?test=true`를 붙일 수 없다.
 * 로그인 화면은 **앱으로 열렸을 때만** 심사용 링크를 노출해야 하고, 웹에는 절대 나오면 안 된다.
 *
 * 종전엔 서버에서 쿠키(`ig_platform`) 하나로만 갈랐는데, 앱은 크롬과 저장소를 공유해 앱을 한 번
 * 연 기기의 브라우저 탭에도 링크가 떴다(프로덕션 실측). 이제 서버 쿠키는 1차 필터일 뿐이고
 * 최종 판정은 클라(ReviewerEntry)가 세션 표식·표시 모드로 한다. 서버·클라 양쪽을 고정한다.
 */
import { readFileSync } from 'node:fs';

const PAGE = readFileSync(new URL('../app/login/page.tsx', import.meta.url), 'utf8');
const ENTRY = readFileSync(new URL('../app/login/ReviewerEntry.tsx', import.meta.url), 'utf8');

describe('로그인 심사 진입로', () => {
  it('서버는 쿠키(isTwa)로 1차만 거르고, 심사 모드에서는 중복 노출하지 않는다', () => {
    expect(PAGE).toContain('const showReviewerEntry = !reviewLogin && isApp;');
    expect(PAGE).toContain('const isApp = await isTwa();');
    expect(PAGE).toContain('<ReviewerEntry />');
  });

  it('클라는 쿠키만으로 판단하지 않는다 — 세션 표식이나 표시 모드를 함께 본다', () => {
    expect(ENTRY).toMatch(/isAppSession\(\)/);
    expect(ENTRY).toMatch(/isStandaloneDisplay\(\)/);
    // 쿠키 단독 판정으로 되돌아가면(= isTwaClient만 남으면) 다시 웹에 샌다.
    expect(ENTRY).not.toMatch(/setShow\(\s*isTwaClient\(\)\s*\)/);
  });

  it('첫 페인트에는 숨긴다 — 웹에서 잠깐 비치면 안 된다', () => {
    expect(ENTRY).toContain('useState(false)');
  });

  it('링크는 ?test=true로 가고, 한국어·영어를 함께 적어 심사관이 찾을 수 있다', () => {
    expect(ENTRY).toContain('href="/login?test=true"');
    expect(ENTRY).toMatch(/심사용 로그인[^<]*Reviewer sign-in/);
  });

  it('비밀번호 없이 바로 로그인되는 원클릭 경로를 만들지 않는다', () => {
    expect(PAGE).not.toMatch(/signInAsReviewer|oneClickLogin|autoLogin/);
    expect(ENTRY).not.toMatch(/signInAsReviewer|oneClickLogin|autoLogin/);
  });
});
