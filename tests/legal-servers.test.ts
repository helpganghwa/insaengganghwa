import { describe, expect, it } from 'vitest';

import {
  LEGAL_BODY,
  LEGAL_META,
  SERVER_CLAUSES_EFFECTIVE_DATE,
  SERVER_CLAUSES_LIVE,
  legalBodies,
} from '@/lib/legal/content';

/**
 * 서버 조항(2026-10-12 결정) — 서버 2 오픈 7일 전 공지와 함께 켠다. 켜기 전에는 약관·환불 안내 본문이
 * 종전 그대로여야 하고(제3조 사전 공지), 켜면 네 조항이 모두 들어가야 한다.
 */
describe('법률 문서 — 서버 조항', () => {
  it('켜면 약관에 서버 정의·재화 귀속·종료 공지·탈퇴 전 서버가 들어간다', () => {
    const on = legalBodies(true, '2026년 12월 1일');
    expect(on.terms).toContain('- 서버: 캐릭터·재화·기록이 따로 관리되는');
    expect(on.terms).toContain('결제할 때 접속한 서버에 지급');
    expect(on.terms).toContain('서버마다 1회로 한정된 상품은 서버마다 따로 구매');
    expect(on.terms).toContain('30일 전에 공지하며, 그 서버에 남아 있는 유료 재화는 다른 서버로 옮기거나 환불');
    expect(on.terms).toContain('탈퇴하면 모든 서버의 게임 데이터는');
    expect(on.terms).toContain('시행일: 2026년 12월 1일 (이전 시행일: 2026년 10월 14일)');
  });

  it('켜면 환불 안내에 서버와 유료 재화 절이 들어간다', () => {
    const on = legalBodies(true, '2026년 12월 1일');
    expect(on.refund).toContain('## 6. 서버와 유료 재화');
    expect(on.refund).toContain('환불은 지급된 서버의 재화를 기준으로');
    expect(on.refund).toContain('30일 전에 공지');
  });

  it('끄면 종전 본문 그대로다(사전 공지 없이 바뀌지 않게)', () => {
    const off = legalBodies(false, '2026년 10월 14일');
    expect(off.terms).not.toContain('- 서버: ');
    expect(off.terms).not.toContain('모든 서버의');
    expect(off.terms).not.toContain('30일 전에 공지하며, 그 서버');
    expect(off.refund).not.toContain('서버와 유료 재화');
    expect(off.terms).toContain('시행일: 2026년 10월 14일 (이전 시행일: 2026년 9월 19일)');
  });

  it('운영 본문은 플래그를 따르고, 켜져 있으면 시행일이 실제 날짜다', () => {
    expect(LEGAL_BODY.terms).toBe(legalBodies(SERVER_CLAUSES_LIVE).terms);
    if (!SERVER_CLAUSES_LIVE) return;
    expect(SERVER_CLAUSES_EFFECTIVE_DATE).toMatch(/^\d{4}년 \d{1,2}월 \d{1,2}일$/);
    expect(LEGAL_META.terms.effectiveDate).toBe(SERVER_CLAUSES_EFFECTIVE_DATE);
    expect(LEGAL_BODY.terms).toContain(`시행일: ${SERVER_CLAUSES_EFFECTIVE_DATE}`);
  });

  it('계정 삭제 안내는 항상 모든 서버를 적는다(안내문 — 사전 공지 대상 아님)', () => {
    expect(LEGAL_BODY['account-deletion']).toContain('모든 서버의 캐릭터가 함께 삭제');
    expect(LEGAL_BODY['account-deletion']).toContain('- 모든 서버의 캐릭터·닉네임');
  });
});
