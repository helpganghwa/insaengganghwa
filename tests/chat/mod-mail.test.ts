import { describe, expect, it } from 'vitest';

import {
  CHAT_MOD_BODY_MAX,
  CHAT_MOD_EXCERPT_MAX,
  CHAT_MUTE_PERMANENT_DAYS,
  chatExcerpt,
  chatModMailProblem,
  chatMuteMailDraft,
  chatWarnMailDraft,
  fmtKstSlash,
  parseMuteDays,
} from '@/lib/game/chat/mod-mail';

// 2026-10-22 06:01 UTC = 10/22 15:01 KST
const AT = new Date('2026-10-22T06:01:00Z');

describe('chatExcerpt', () => {
  it('공백을 정리하고 80자를 넘으면 말줄임', () => {
    expect(chatExcerpt('  안녕   하세요\n\n반가워요 ')).toBe('안녕 하세요 반가워요');
    const long = '가'.repeat(CHAT_MOD_EXCERPT_MAX + 5);
    const cut = chatExcerpt(long);
    expect(Array.from(cut).length).toBe(CHAT_MOD_EXCERPT_MAX + 1);
    expect(cut.endsWith('…')).toBe(true);
    expect(chatExcerpt('가'.repeat(CHAT_MOD_EXCERPT_MAX))).toBe('가'.repeat(CHAT_MOD_EXCERPT_MAX));
  });
});

describe('fmtKstSlash', () => {
  it('KST 월/일 시:분', () => {
    expect(fmtKstSlash(AT)).toBe('10/22 15:01');
    // 자정은 00시(24 아님)
    expect(fmtKstSlash(new Date('2026-10-22T15:00:00Z'))).toBe('10/23 00:00');
  });
});

describe('chatWarnMailDraft', () => {
  it('발췌·시각이 들어가고 이모지·줄표가 없다', () => {
    const d = chatWarnMailDraft(AT, '야 이 바보야   진짜');
    expect(d.title).toBe('운영 경고 · 채팅');
    expect(d.body).toContain('[10/22 15:01] 야 이 바보야 진짜');
    expect(d.body).not.toMatch(/—/);
    expect(chatModMailProblem(d.title, d.body)).toBeNull();
  });
});

describe('chatMuteMailDraft', () => {
  it('N일이면 기간과 해제 시각, 영구면 둘 다 생략', () => {
    const from = new Date('2026-10-22T06:01:00Z');
    const d = chatMuteMailDraft({ days: 3, from, at: AT, body: '도배도배' });
    expect(d.title).toBe('채팅 이용 제한 안내');
    expect(d.body).toContain('3일간 제한됩니다. (해제: 10/25 15:01)');
    expect(d.body).toContain('[10/22 15:01] 도배도배');
    expect(d.body).toContain('귓속말');
    const p = chatMuteMailDraft({ days: CHAT_MUTE_PERMANENT_DAYS, from, at: AT, body: '도배' });
    expect(p.body).toContain('채팅 이용이 제한됩니다.');
    expect(p.body).not.toContain('해제:');
    expect(p.body).not.toContain('일간');
  });
});

describe('chatModMailProblem', () => {
  it('빈 값·길이 초과를 막는다', () => {
    expect(chatModMailProblem('', '본문')).toBe('제목을 입력하세요.');
    expect(chatModMailProblem('제목', '  ')).toBe('본문을 입력하세요.');
    expect(chatModMailProblem('제'.repeat(41), '본문')).toContain('40자');
    expect(chatModMailProblem('제목', '본'.repeat(CHAT_MOD_BODY_MAX + 1))).toContain('1000자');
    expect(chatModMailProblem('제목', '본문')).toBeNull();
  });
});

describe('parseMuteDays', () => {
  it('1~36500 정수만', () => {
    expect(parseMuteDays('3')).toBe(3);
    expect(parseMuteDays(' 30 ')).toBe(30);
    expect(parseMuteDays(36500)).toBe(36500);
    expect(parseMuteDays('0')).toBeNull();
    expect(parseMuteDays('36501')).toBeNull();
    expect(parseMuteDays('1.5')).toBeNull();
    expect(parseMuteDays('')).toBeNull();
    expect(parseMuteDays('abc')).toBeNull();
  });
});
