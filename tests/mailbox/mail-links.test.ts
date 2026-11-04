import { describe, expect, it } from 'vitest';

import { isAllowedMailHref, mailBodyPlain, parseMailBody } from '@/lib/ui/mail-links';

describe('mail-links', () => {
  it('허용 주소의 표기를 링크로 바꾼다', () => {
    expect(parseMailBody('의견을 들려주세요.\n[설문 참여하기](https://forms.gle/abc123)\n감사합니다.')).toEqual([
      { kind: 'text', text: '의견을 들려주세요.\n' },
      { kind: 'link', label: '설문 참여하기', href: 'https://forms.gle/abc123' },
      { kind: 'text', text: '\n감사합니다.' },
    ]);
  });

  it('허용 목록', () => {
    expect(isAllowedMailHref('https://forms.gle/x')).toBe(true);
    expect(isAllowedMailHref('https://docs.google.com/forms/d/e/x/viewform')).toBe(true);
    expect(isAllowedMailHref('https://ganghwa.app/history')).toBe(true);
    expect(isAllowedMailHref('https://docs.google.com/document/d/x')).toBe(false);
    expect(isAllowedMailHref('http://forms.gle/x')).toBe(false);
    expect(isAllowedMailHref('https://forms.gle.evil.com/x')).toBe(false);
    expect(isAllowedMailHref('https://evil.com/?forms.gle')).toBe(false);
    expect(isAllowedMailHref('https://user@forms.gle/x')).toBe(false);
    expect(isAllowedMailHref('javascript:alert(1)')).toBe(false);
  });

  it('허용 밖 표기와 일반 대괄호는 원문 그대로', () => {
    const body = '[점검 보상] 안내 [여기](https://evil.com/x)';
    expect(parseMailBody(body)).toEqual([{ kind: 'text', text: body }]);
  });

  it('여러 링크·평문 변환', () => {
    const body = '[설문](https://forms.gle/a) 또는 [역사](https://ganghwa.app/history)';
    expect(parseMailBody(body).filter((p) => p.kind === 'link')).toHaveLength(2);
    expect(mailBodyPlain(body)).toBe('설문 또는 역사');
    expect(mailBodyPlain('링크 없음')).toBe('링크 없음');
  });
});
