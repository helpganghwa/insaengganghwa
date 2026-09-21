import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * 활성 서버 교정(2026-09-21) — 헤더는 Suspense 안에서 스트리밍된다. 그 안에서 서버 컴포넌트의
 * `redirect()`를 부르면 307이 아니라 클라 라우터 처리로 넘어가고, 그 과정에서 Next 라우터 내부가
 * "Rendered more hooks than during the previous render"를 던진다(이동은 되지만 잡히지 않은 예외가 남는다).
 * 그래서 화면 없는 클라 컴포넌트가 문서 이동으로 교정 라우트에 보낸다 — 이 방식을 고정한다.
 */
const HEADER = readFileSync(new URL('../../components/AppHeader.tsx', import.meta.url), 'utf8');
const CORRECT = readFileSync(new URL('../../components/ServerCorrect.tsx', import.meta.url), 'utf8');

describe('활성 서버 교정', () => {
  it('헤더는 redirect()를 쓰지 않고 ServerCorrect만 그린다', () => {
    expect(HEADER).not.toMatch(/from 'next\/navigation'/);
    expect(HEADER).toContain('if (d.correctServerId != null) return <ServerCorrect to={d.correctServerId} />;');
  });

  it('교정은 라우터가 아니라 문서 이동으로, 무한 왕복 방지와 함께', () => {
    expect(CORRECT).toContain('window.location.replace(`/auth/switch-server?to=${to}`)');
    expect(CORRECT).not.toMatch(/useRouter|router\.(push|replace)/);
    expect(CORRECT).toContain('MAX_TRIES');
  });
});
