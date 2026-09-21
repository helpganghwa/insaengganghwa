import { describe, expect, it } from 'vitest';

import { GUILD_PERM } from '@/lib/game/guild/permissions';
import {
  isDeployOfficer,
  isDeployViewRestricted,
  maskDeployMembers,
  parseDeployVisibility,
  toDeployMemberProps,
  type DeployBoardRow,
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

  describe('화면으로 넘길 멤버 조립', () => {
    const rows: DeployBoardRow[] = [
      { uid: 'me', nickname: '나', mrole: 'member', dep_zone_id: 33, dep_zone_name: '변경 초소', dep_role: 'defend', exec_zone_id: null, exec_zone_name: null },
      { uid: 'u2', nickname: '동료', mrole: 'member', dep_zone_id: 33, dep_zone_name: '변경 초소', dep_role: 'defend', exec_zone_id: null, exec_zone_name: null },
      { uid: 'u3', nickname: '집행관', mrole: 'vice', dep_zone_id: null, dep_zone_name: null, dep_role: null, exec_zone_id: 29, exec_zone_name: '고사목 숲' },
    ];
    const combat = { me: 157, u2: 4900, u3: 6800 };

    it('제한된 시청자에게는 결과 어디에도 다른 길드원의 id·닉네임·전투력·구역이 없다', () => {
      const out = toDeployMemberProps(rows, combat, 'me', true);
      expect(out).toHaveLength(1);
      expect(out[0]).toMatchObject({ userId: 'me', combat: 157, depZoneId: 33, depRole: 'defend' });
      const json = JSON.stringify(out);
      for (const leak of ['u2', 'u3', '동료', '집행관', '4900', '6800', '고사목 숲']) expect(json).not.toContain(leak);
    });

    it('제한이 없으면 전원이 전투력과 함께 그대로 나간다', () => {
      const out = toDeployMemberProps(rows, combat, 'me', false);
      expect(out.map((m) => m.userId)).toEqual(['me', 'u2', 'u3']);
      expect(out[2]).toMatchObject({ role: 'vice', combat: 6800, execZoneId: 29, execZoneName: '고사목 숲' });
    });

    it('전투력 정보가 없는 멤버는 0으로 나간다 · 제한인데 본인 행이 없으면 빈 목록', () => {
      expect(toDeployMemberProps(rows, {}, 'me', false)[1]!.combat).toBe(0);
      expect(toDeployMemberProps(rows, combat, 'ghost', true)).toEqual([]);
    });
  });
});
