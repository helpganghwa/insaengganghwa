import { describe, expect, it } from 'vitest';

import { GUILD_PERM } from '@/lib/game/guild/permissions';
import {
  isDeployOfficer,
  isDeployViewRestricted,
  maskDeployMembers,
  parseDeployVisibility,
} from '@/lib/game/guild/conquest/deploy-visibility';

type Row = { userId: string; nickname: string; combat: number; depZoneId: number | null; depZoneName: string | null; depRole: 'attack' | 'defend' | null; execZoneId: number | null; execZoneName: string | null };
const m = (userId: string, over: Partial<Row> = {}): Row => ({
  userId,
  nickname: userId,
  combat: 1000,
  depZoneId: null,
  depZoneName: null,
  depRole: null,
  execZoneId: null,
  execZoneName: null,
  ...over,
});

describe('배치 정보 공개 범위', () => {
  it('설정값은 officer만 제한으로 읽고 나머지는 전부 all', () => {
    expect(parseDeployVisibility('officer')).toBe('officer');
    expect(parseDeployVisibility('all')).toBe('all');
    expect(parseDeployVisibility(null)).toBe('all');
    expect(parseDeployVisibility('weird')).toBe('all');
  });

  it('배치 담당자 = 길드장, 배치 해제 또는 집행관 지정 권한이 있는 부길드장', () => {
    expect(isDeployOfficer('leader', 0)).toBe(true);
    expect(isDeployOfficer('vice', GUILD_PERM.deploy)).toBe(true);
    expect(isDeployOfficer('vice', GUILD_PERM.executor)).toBe(true);
    expect(isDeployOfficer('vice', GUILD_PERM.notice | GUILD_PERM.taxCollect)).toBe(false);
    expect(isDeployOfficer('member', GUILD_PERM.deploy)).toBe(false);
  });

  it("제한은 설정이 'officer'이고 담당자가 아닐 때만 걸린다", () => {
    expect(isDeployViewRestricted('all', 'member', 0)).toBe(false);
    expect(isDeployViewRestricted('officer', 'member', 0)).toBe(true);
    expect(isDeployViewRestricted('officer', 'vice', GUILD_PERM.notice)).toBe(true);
    expect(isDeployViewRestricted('officer', 'vice', GUILD_PERM.executor)).toBe(false);
    expect(isDeployViewRestricted('officer', 'leader', 0)).toBe(false);
  });

  it('제한된 길드원은 본인 배치만 본다 — 같은 구역 동료도 내려가지 않는다', () => {
    const members = [
      m('me', { depZoneId: 33, depZoneName: '변경 초소', depRole: 'defend' }),
      m('same', { depZoneId: 33, depZoneName: '변경 초소', depRole: 'defend' }),
      m('exec', { execZoneId: 33, execZoneName: '변경 초소' }),
      m('other', { depZoneId: 29, depZoneName: '고사목 숲', depRole: 'attack' }),
      m('idle'),
    ];
    const out = maskDeployMembers(members, 'me', (x) => x.userId);
    expect(out.map((x) => x.userId)).toEqual(['me']);
    expect(out[0]!.depZoneId).toBe(33);
    // 원본 배열은 건드리지 않는다.
    expect(members).toHaveLength(5);
  });

  it('배치하지 않은 길드원도 본인 한 줄은 남는다 · 목록에 본인이 없으면 빈 목록', () => {
    expect(maskDeployMembers([m('me'), m('a', { depZoneId: 1, depZoneName: 'A', depRole: 'attack' })], 'me', (x) => x.userId).map((x) => x.userId)).toEqual(['me']);
    expect(maskDeployMembers([m('a')], 'me', (x) => x.userId)).toEqual([]);
  });
});
