import { describe, expect, it } from 'vitest';

import { GUILD_PERM, GUILD_PERM_DEFAULT, GUILD_PERM_META, GUILD_PERM_ORDER, hasGuildPerm } from '@/lib/game/guild/permissions';
import { GUILD_DEMOTED_RANK, GUILD_JOIN_RANK, MEMBER_RANKS, isMemberRank, parseMemberRank, rankLabel, rankOf } from '@/lib/game/guild/rank';

/** 길드 직급 R1~R5(0244) — 순수 규칙. 숫자가 클수록 높다(4X 관례, 사용자 확정 10-15). */
describe('길드 직급', () => {
  it('길드장 5 · 부길드장 4 · 길드원은 1~3, 이상한 값은 R1로 닫는다', () => {
    expect(rankOf('leader', 1)).toBe(5);
    expect(rankOf('vice', 3)).toBe(4);
    expect(rankOf('member', 1)).toBe(1);
    expect(rankOf('member', 3)).toBe(3);
    expect(rankOf('member', null)).toBe(1);
    expect(rankOf('member', 0)).toBe(1);
    expect(rankOf('member', 4)).toBe(1);
    expect(MEMBER_RANKS).toEqual([1, 2, 3]);
    expect(isMemberRank(2)).toBe(true);
    expect(isMemberRank(4)).toBe(false);
    expect(isMemberRank('2')).toBe(false);
    expect(parseMemberRank(undefined)).toBe(1);
  });

  it('가입은 R1, 부길드장 해제·길드장 교체는 R3', () => {
    expect(GUILD_JOIN_RANK).toBe(1);
    expect(GUILD_DEMOTED_RANK).toBe(3);
  });

  it('라벨은 R5 길드장 · R4 부길드장 · RN', () => {
    expect(rankLabel('leader', 2)).toBe('R5 길드장');
    expect(rankLabel('vice', null)).toBe('R4 부길드장');
    expect(rankLabel('member', 2)).toBe('R2');
    expect(rankLabel('member', null)).toBe('R1');
  });

  it("'직급 관리' 권한은 1<<10, 가입 관리 다음 자리, 임명 기본값에는 꺼져 있다", () => {
    expect(GUILD_PERM.rank).toBe(1 << 10);
    expect(GUILD_PERM_ORDER.indexOf('rank')).toBe(GUILD_PERM_ORDER.indexOf('joinReview') + 1);
    expect(GUILD_PERM_META.rank.label).toBe('직급 관리');
    expect((GUILD_PERM_DEFAULT & GUILD_PERM.rank) === 0).toBe(true);
    expect(hasGuildPerm('leader', 0, 'rank')).toBe(true);
    expect(hasGuildPerm('vice', GUILD_PERM.rank, 'rank')).toBe(true);
    expect(hasGuildPerm('vice', GUILD_PERM.notice, 'rank')).toBe(false);
    expect(hasGuildPerm('member', GUILD_PERM.rank, 'rank')).toBe(false);
  });
});
