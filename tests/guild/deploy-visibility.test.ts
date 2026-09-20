import { describe, expect, it } from 'vitest';

import { GUILD_PERM } from '@/lib/game/guild/permissions';
import {
  isDeployOfficer,
  isDeployViewRestricted,
  maskDeployMembers,
  parseDeployVisibility,
  type DeployMemberView,
} from '@/lib/game/guild/conquest/deploy-visibility';

const m = (userId: string, over: Partial<DeployMemberView> = {}): DeployMemberView & { nickname: string; combat: number } => ({
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

  it('제한된 길드원은 본인과 같은 구역에 선 사람만 본다', () => {
    const members = [
      m('me', { depZoneId: 33, depZoneName: '변경 초소', depRole: 'defend' }),
      m('same', { depZoneId: 33, depZoneName: '변경 초소', depRole: 'defend' }),
      m('exec', { execZoneId: 33, execZoneName: '변경 초소' }),
      m('other', { depZoneId: 29, depZoneName: '고사목 숲', depRole: 'attack' }),
      m('idle'),
    ];
    const out = maskDeployMembers(members, 'me');
    expect(out.map((x) => x.userId)).toEqual(['me', 'same', 'exec']);
    // 닉네임·전투력 같은 나머지 필드는 그대로 실린다.
    expect(out[1]!.nickname).toBe('same');
  });

  it('같은 구역 사람이 다른 구역에도 걸쳐 있으면 그쪽 정보는 지운다', () => {
    const members = [
      m('me', { depZoneId: 33, depZoneName: '변경 초소', depRole: 'defend' }),
      m('both', { depZoneId: 33, depZoneName: '변경 초소', depRole: 'defend', execZoneId: 29, execZoneName: '고사목 숲' }),
    ];
    const both = maskDeployMembers(members, 'me')[1]!;
    expect(both.depZoneId).toBe(33);
    expect(both.execZoneId).toBeNull();
    expect(both.execZoneName).toBeNull();
  });

  it('집행관인 구역도 내 구역으로 친다', () => {
    const members = [
      m('me', { execZoneId: 47, execZoneName: '타락한 성소' }),
      m('def', { depZoneId: 47, depZoneName: '타락한 성소', depRole: 'defend' }),
      m('else', { depZoneId: 48, depZoneName: '타락의 심연', depRole: 'defend' }),
    ];
    expect(maskDeployMembers(members, 'me').map((x) => x.userId)).toEqual(['me', 'def']);
  });

  it('어디에도 서지 않았으면 본인 한 줄만 남는다 · 원본 배열은 건드리지 않는다', () => {
    const members = [m('me'), m('a', { depZoneId: 1, depZoneName: 'A', depRole: 'attack' })];
    const out = maskDeployMembers(members, 'me');
    expect(out.map((x) => x.userId)).toEqual(['me']);
    expect(members[1]!.depZoneId).toBe(1);
  });
});
