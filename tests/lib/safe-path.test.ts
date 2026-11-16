import { describe, expect, it } from 'vitest';

import { safeRelativePath } from '../../lib/util/safe-path';

describe('safeRelativePath — 리다이렉트 목적지 검사', () => {
  it('같은 출처의 상대 경로는 통과한다', () => {
    expect(safeRelativePath('/raid/12')).toBe('/raid/12');
    expect(safeRelativePath('/world-boss/3?tab=rank')).toBe('/world-boss/3?tab=rank');
  });

  it('프로토콜 상대·백슬래시·공백은 막는다', () => {
    for (const p of ['//evil.com', '/\\evil.com', '/\t/evil.com', 'https://evil.com', 'raid/1', '']) {
      expect(safeRelativePath(p)).toBeNull();
    }
  });

  it('인증 라우트는 정규화한 경로로도 막는다(11-16 검수 C11)', () => {
    for (const p of [
      '/auth/switch-server?to=1',
      '/./auth/switch-server?to=1',
      '/raid/../auth/switch-server',
      '/%61uth/switch-server',
      '/AUTH/signout',
      '/auth/signout',
    ]) {
      expect(safeRelativePath(p), p).toBeNull();
    }
  });
});
