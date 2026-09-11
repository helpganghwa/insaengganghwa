import { describe, expect, it } from 'vitest';

import { LEGAL_BODY, LEGAL_META } from '@/lib/legal/content';

/**
 * 계정 삭제 안내(2026-09-11) — Google Play가 요구하는 '계정 삭제 요청 URL'의 필수 요건을 고정한다.
 * 요건: ① 앱·개발자 이름 ② 삭제 요청 절차 ③ 삭제되는 데이터와 보관되는 데이터·기간.
 * 로그인 없이 열려야 하므로 공개 법률 문서(app/legal/[doc])에 둔다.
 */
describe('계정 삭제 안내', () => {
  const body = LEGAL_BODY['account-deletion'];

  it('앱 이름과 개발자, 문의처를 밝힌다', () => {
    expect(body).toContain('인생강화');
    expect(body).toContain('서해남');
    expect(body).toContain('help@ganghwa.app');
    expect(LEGAL_META['account-deletion'].title).toBe('계정 삭제 안내');
  });

  it('앱 안에서 탈퇴하는 절차를 단계로 적는다', () => {
    expect(body).toContain('계정 탈퇴');
    expect(body).toMatch(/1\.[\s\S]*2\.[\s\S]*3\.[\s\S]*4\./);
  });

  it('삭제되는 데이터와 법령 보관 기간을 함께 밝힌다', () => {
    expect(body).toContain('삭제되는 데이터');
    for (const k of ['5년', '3년', '6개월', '3개월']) expect(body).toContain(k);
    expect(body).toContain('전자상거래법');
  });
});
