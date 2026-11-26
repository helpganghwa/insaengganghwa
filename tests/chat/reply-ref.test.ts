import { describe, expect, it } from 'vitest';

import { CHAT_REPLY_EXCERPT, toReplyRef } from '@/lib/game/chat/service';

// 답장 인용(0254) — 원문 상태별 표시 규칙.
const nick = (uid: string) => (uid === 'u1' ? '조약돌' : undefined);
const live = { userId: 'u1', body: '방금 무기 +87 찍었어요', hiddenAt: null, deletedAt: null };

describe('toReplyRef', () => {
  it('답장이 아니면 undefined', () => {
    expect(toReplyRef(null, live, nick)).toBeUndefined();
  });
  it('보이는 원문 — 작성자 닉·본문', () => {
    expect(toReplyRef(10n, live, nick)).toEqual({ id: '10', uid: 'u1', nick: '조약돌', body: '방금 무기 +87 찍었어요' });
  });
  it('본문은 앞부분만', () => {
    const r = toReplyRef(10n, { ...live, body: 'ㄱ'.repeat(100) }, nick);
    expect(r && 'body' in r ? r.body.length : -1).toBe(CHAT_REPLY_EXCERPT);
  });
  it('닉을 못 찾으면 기본 이름', () => {
    expect(toReplyRef(10n, { ...live, userId: 'u9' }, nick)).toMatchObject({ nick: '대장장이' });
  });
  it('본인 삭제 → deleted', () => {
    expect(toReplyRef(10n, { ...live, deletedAt: new Date() }, nick)).toEqual({ id: '10', gone: 'deleted' });
  });
  it('운영 숨김·정리돼 없음 → unavailable (숨김이 삭제보다 우선)', () => {
    expect(toReplyRef(10n, { ...live, hiddenAt: new Date(), deletedAt: new Date() }, nick)).toEqual({ id: '10', gone: 'unavailable' });
    expect(toReplyRef(10n, null, nick)).toEqual({ id: '10', gone: 'unavailable' });
  });
});
