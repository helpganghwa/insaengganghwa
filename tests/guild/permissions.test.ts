import { describe, expect, it } from 'vitest';

import {
  GUILD_PERM,
  GUILD_PERM_ALL,
  GUILD_PERM_CONFIRM,
  GUILD_PERM_DEFAULT,
  GUILD_PERM_META,
  GUILD_PERM_ORDER,
  hasGuildPerm,
  isConfirmKey,
  permKeys,
  sanitizePerms,
  type GuildPermKey,
} from '@/lib/game/guild/permissions';
import { taxMailBody } from '@/lib/game/guild/tax-mail';

const KEYS = Object.keys(GUILD_PERM) as GuildPermKey[];

describe('부길드장 권한 비트', () => {
  it('모든 권한 키가 화면 순서 목록에 있다 — 빠진 키는 저장할 때 조용히 지워진다', () => {
    expect([...GUILD_PERM_ORDER].sort()).toEqual([...KEYS].sort());
    expect(new Set(GUILD_PERM_ORDER).size).toBe(GUILD_PERM_ORDER.length);
  });

  it('비트는 서로 겹치지 않는 2의 거듭제곱이고, 전체 마스크는 그 합이다', () => {
    const bits = KEYS.map((k) => GUILD_PERM[k]);
    for (const b of bits) expect(b > 0 && (b & (b - 1)) === 0).toBe(true);
    expect(new Set(bits).size).toBe(bits.length);
    expect(GUILD_PERM_ALL).toBe(bits.reduce((m, b) => m | b, 0));
    expect(GUILD_PERM_ALL).toBe(1023);
  });

  it('모든 권한에 라벨이 있다', () => {
    for (const k of KEYS) expect(GUILD_PERM_META[k].label.length).toBeGreaterThan(0);
  });

  it('세금 수금과 세금 분배는 서로 다른 권한이다', () => {
    expect(GUILD_PERM.taxCollect).toBe(512);
    expect(GUILD_PERM.taxDistribute).toBe(128);
    expect(hasGuildPerm('vice', GUILD_PERM.taxDistribute, 'taxCollect')).toBe(false);
    expect(hasGuildPerm('vice', GUILD_PERM.taxCollect, 'taxDistribute')).toBe(false);
    expect(hasGuildPerm('vice', GUILD_PERM.taxCollect | GUILD_PERM.taxDistribute, 'taxCollect')).toBe(true);
    expect(GUILD_PERM_META.taxCollect.label).toBe('세금 수금');
    expect(GUILD_PERM_META.taxDistribute.label).toBe('세금 분배');
  });

  it('길드장은 항상 전권, 일반 길드원은 비트가 있어도 권한이 없다', () => {
    for (const k of KEYS) {
      expect(hasGuildPerm('leader', 0, k)).toBe(true);
      expect(hasGuildPerm('member', GUILD_PERM_ALL, k)).toBe(false);
    }
  });

  it('저장 전 정제 — 아는 비트는 지키고 모르는 비트·음수·소수는 버린다', () => {
    expect(sanitizePerms(GUILD_PERM.taxDistribute | GUILD_PERM.taxCollect)).toBe(640);
    expect(sanitizePerms(GUILD_PERM.taxCollect | 1024)).toBe(512);
    expect(sanitizePerms(-5)).toBe(0);
    expect(sanitizePerms(7.9)).toBe(7);
  });

  it('임명 기본값은 공지·소개·오픈채팅뿐이다 — 세금 권한은 길드장이 직접 켠다', () => {
    expect(permKeys(GUILD_PERM_DEFAULT)).toEqual(['notice', 'intro', 'openchat']);
  });

  it('켤 때 확인받는 권한 — 분배는 확인하고 수금은 확인하지 않는다', () => {
    expect(isConfirmKey('taxDistribute')).toBe(true);
    expect(isConfirmKey('taxCollect')).toBe(false);
    expect([...GUILD_PERM_CONFIRM].sort()).toEqual(['emblem', 'executor', 'kick', 'taxDistribute']);
  });
});

describe('세금 분배 우편 본문', () => {
  it('분배한 사람의 실제 직책으로 적는다', () => {
    expect(taxMailBody('Winners', 'leader', '여왕', 12000n)).toBe('Winners 길드장 여왕님이 세금 💎12,000을 분배했습니다.');
    expect(taxMailBody('Winners', 'vice', '헤이론', 500n)).toBe('Winners 부길드장 헤이론님이 세금 💎500을 분배했습니다.');
  });
  it('닉네임을 못 읽으면 직책만 적는다', () => {
    expect(taxMailBody('Winners', 'vice', null, 1n)).toBe('Winners 부길드장이 세금 💎1을 분배했습니다.');
  });
});
