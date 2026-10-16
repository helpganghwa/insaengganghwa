import { describe, expect, it } from 'vitest';

import { GUILD_PERM } from '@/lib/game/guild/permissions';
import {
  DEPLOY_VISIBILITIES,
  DEPLOY_VISIBILITY_LABEL,
  DEPLOY_VISIBILITY_NOTE,
  DEPLOY_VISIBILITY_OPTION_DESC,
  deployRankScopeNote,
  deployRestrictedNote,
  deployViewMaxRank,
  deployVisibilityMinRank,
  isDeployOfficer,
  isDeployViewRestricted,
  maskDeployMembers,
  parseDeployVisibility,
  scopeDeployMembersByRank,
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
  it("설정값은 all · rank · r2 · r3 · r4 · r5 — 종전 'officer'는 r5로, 모르는 값은 all로 읽는다", () => {
    expect(parseDeployVisibility('officer')).toBe('r5');
    expect(parseDeployVisibility('all')).toBe('all');
    expect(parseDeployVisibility('rank')).toBe('rank');
    expect(parseDeployVisibility('r2')).toBe('r2');
    expect(parseDeployVisibility('r5')).toBe('r5');
    expect(parseDeployVisibility(null)).toBe('all');
    expect(parseDeployVisibility('weird')).toBe('all');
    expect(DEPLOY_VISIBILITIES).toEqual(['all', 'rank', 'r2', 'r3', 'r4', 'r5']);
    // 'rank'는 문턱이 없다(범위는 deployViewMaxRank).
    expect(DEPLOY_VISIBILITIES.map(deployVisibilityMinRank)).toEqual([1, 1, 2, 3, 4, 5]);
  });

  it('배치 담당자 = 길드장, 배치 해제 또는 집행관 지정 권한이 있는 부길드장', () => {
    expect(isDeployOfficer('leader', 0)).toBe(true);
    expect(isDeployOfficer('vice', GUILD_PERM.deploy)).toBe(true);
    expect(isDeployOfficer('vice', GUILD_PERM.executor)).toBe(true);
    expect(isDeployOfficer('vice', GUILD_PERM.notice | GUILD_PERM.taxCollect)).toBe(false);
    expect(isDeployOfficer('member', GUILD_PERM.deploy)).toBe(false);
  });

  it("제한(자기 배치만)은 'RN 이상'에 등급이 못 미치고 배치 권한도 없을 때만 걸린다 — 전체·등급별은 제한이 아니다", () => {
    // 전체 · 등급별 — 아무도 제한되지 않는다.
    expect(isDeployViewRestricted('all', 'member', 0, 1)).toBe(false);
    expect(isDeployViewRestricted('rank', 'member', 0, 1)).toBe(false);
    expect(isDeployViewRestricted('rank', 'vice', 0, null)).toBe(false);
    // R2 이상 — R1만 제한, R2·R3·부길드장·길드장은 통과.
    expect(isDeployViewRestricted('r2', 'member', 0, 1)).toBe(true);
    expect(isDeployViewRestricted('r2', 'member', 0, 2)).toBe(false);
    expect(isDeployViewRestricted('r2', 'member', 0, 3)).toBe(false);
    expect(isDeployViewRestricted('r2', 'vice', GUILD_PERM.notice, null)).toBe(false);
    // R3 이상 — R1·R2 제한.
    expect(isDeployViewRestricted('r3', 'member', 0, 2)).toBe(true);
    expect(isDeployViewRestricted('r3', 'member', 0, 3)).toBe(false);
    // R4 이상 — 길드원 전부 제한, 배치 권한 없는 부길드장도 R4라 통과.
    expect(isDeployViewRestricted('r4', 'member', 0, 3)).toBe(true);
    expect(isDeployViewRestricted('r4', 'vice', GUILD_PERM.notice, null)).toBe(false);
    // R5 — 길드장만. 배치 권한 없는 부길드장은 제한.
    expect(isDeployViewRestricted('r5', 'vice', GUILD_PERM.notice, null)).toBe(true);
    expect(isDeployViewRestricted('r5', 'leader', 0, null)).toBe(false);
    // 배치 권한(배치 해제 · 집행관)이 있는 부길드장은 설정과 무관하게 통과(사용자 결정 10-15).
    expect(isDeployViewRestricted('r5', 'vice', GUILD_PERM.executor, null)).toBe(false);
    expect(isDeployViewRestricted('r5', 'vice', GUILD_PERM.deploy, null)).toBe(false);
    // 길드원은 배치 권한 비트가 있어도(부길드장 해제 뒤 잔존 등) 등급으로만 본다.
    expect(isDeployViewRestricted('r3', 'member', GUILD_PERM.deploy, 1)).toBe(true);
    // 등급 값이 이상하면 R1로 닫는다.
    expect(isDeployViewRestricted('r2', 'member', 0, null)).toBe(true);
    expect(isDeployViewRestricted('r2', 'member', 0, 9)).toBe(true);
  });

  it("등급별('rank')에서 보는 최대 등급 — 내 등급. 길드장·배치 권한 부길드장은 범위 없음, 다른 설정도 범위 없음", () => {
    expect(deployViewMaxRank('rank', 'member', 0, 1)).toBe(1);
    expect(deployViewMaxRank('rank', 'member', 0, 2)).toBe(2);
    expect(deployViewMaxRank('rank', 'member', 0, 3)).toBe(3);
    // 배치 권한 없는 부길드장은 R4 이하 — 길드장의 배치는 보이지 않는다(글자 그대로 "같은 등급과 아래").
    expect(deployViewMaxRank('rank', 'vice', GUILD_PERM.notice, null)).toBe(4);
    expect(deployViewMaxRank('rank', 'vice', GUILD_PERM.deploy, null)).toBeNull();
    expect(deployViewMaxRank('rank', 'vice', GUILD_PERM.executor, null)).toBeNull();
    expect(deployViewMaxRank('rank', 'leader', 0, null)).toBeNull();
    // 길드원의 잔존 권한 비트는 무시, 이상한 등급 값은 R1.
    expect(deployViewMaxRank('rank', 'member', GUILD_PERM.deploy, 2)).toBe(2);
    expect(deployViewMaxRank('rank', 'member', 0, null)).toBe(1);
    expect(deployViewMaxRank('rank', 'member', 0, 9)).toBe(1);
    for (const v of ['all', 'r2', 'r3', 'r4', 'r5'] as const) expect(deployViewMaxRank(v, 'member', 0, 1)).toBeNull();
  });

  it('선택지 라벨 · 설명 · 공통 규칙 · 안내 문구(사용자 확정 10-16)', () => {
    expect(DEPLOY_VISIBILITY_LABEL).toEqual({ all: '전체', rank: '등급별', r2: 'R2 이상', r3: 'R3 이상', r4: 'R4 이상', r5: 'R5' });
    expect(DEPLOY_VISIBILITY_OPTION_DESC).toEqual({
      all: '길드원 모두가 전체 배치를 봅니다',
      rank: '나와 같은 등급과 아래 등급의 배치만 봅니다',
      r2: 'R2 이상 등급만 전체 배치를 봅니다',
      r3: 'R3 이상 등급만 전체 배치를 봅니다',
      r4: '부길드장과 길드장만 전체 배치를 봅니다',
      r5: '길드장만 전체 배치를 봅니다',
    });
    expect(DEPLOY_VISIBILITY_NOTE).toBe(
      '길드장과 배치 권한이 있는 부길드장은 설정과 상관없이 전체를 봅니다. 범위 밖 길드원은 자기 배치만 봅니다. 저장하면 바로 적용되고 길드 기록에 남습니다.',
    );
    expect(deployRestrictedNote('r2')).toBe('길드 전체 배치는 R2 이상 등급과 길드장, 배치 권한이 있는 부길드장만 볼 수 있습니다.');
    expect(deployRestrictedNote('r5')).toBe('길드 전체 배치는 길드장과 배치 권한이 있는 부길드장만 볼 수 있습니다.');
    expect(deployRankScopeNote(2)).toBe('R2 이하 등급의 배치만 보입니다.');
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

  it('등급별 범위 — 최대 등급 이하의 행만 남고 원본은 그대로', () => {
    const rows = [
      { id: 'L', r: 5 },
      { id: 'V', r: 4 },
      { id: 'c', r: 3 },
      { id: 'b', r: 2 },
      { id: 'a', r: 1 },
    ];
    expect(scopeDeployMembersByRank(rows, 2, (x) => x.r).map((x) => x.id)).toEqual(['b', 'a']);
    expect(scopeDeployMembersByRank(rows, 4, (x) => x.r).map((x) => x.id)).toEqual(['V', 'c', 'b', 'a']);
    expect(scopeDeployMembersByRank(rows, 1, (x) => x.r).map((x) => x.id)).toEqual(['a']);
    expect(rows).toHaveLength(5);
  });

  describe('화면으로 넘길 멤버 조립', () => {
    const rows: DeployBoardRow[] = [
      { uid: 'me', nickname: '나', mrole: 'member', mrank: 2, dep_zone_id: 33, dep_zone_name: '변경 초소', dep_role: 'defend', exec_zone_id: null, exec_zone_name: null },
      { uid: 'u2', nickname: '동료', mrole: 'member', mrank: 2, dep_zone_id: 33, dep_zone_name: '변경 초소', dep_role: 'defend', exec_zone_id: null, exec_zone_name: null },
      { uid: 'u3', nickname: '집행관', mrole: 'vice', mrank: 1, dep_zone_id: null, dep_zone_name: null, dep_role: null, exec_zone_id: 29, exec_zone_name: '고사목 숲' },
      { uid: 'u4', nickname: '신입', mrole: 'member', mrank: 1, dep_zone_id: null, dep_zone_name: null, dep_role: null, exec_zone_id: null, exec_zone_name: null },
      { uid: 'u5', nickname: '고참', mrole: 'member', mrank: 3, dep_zone_id: 29, dep_zone_name: '고사목 숲', dep_role: 'attack', exec_zone_id: null, exec_zone_name: null },
    ];
    const combat = { me: 157, u2: 4900, u3: 6800, u4: 10, u5: 7700 };

    it('제한된 시청자에게는 결과 어디에도 다른 길드원의 id·닉네임·전투력·구역이 없다', () => {
      const out = toDeployMemberProps(rows, combat, 'me', true);
      expect(out).toHaveLength(1);
      expect(out[0]).toMatchObject({ userId: 'me', combat: 157, depZoneId: 33, depRole: 'defend' });
      const json = JSON.stringify(out);
      for (const leak of ['u2', 'u3', '동료', '집행관', '4900', '6800', '고사목 숲']) expect(json).not.toContain(leak);
    });

    it('등급별(R2가 볼 때)에는 R2·R1만 나가고 부길드장(R4) · R3의 정보는 어디에도 없다', () => {
      const out = toDeployMemberProps(rows, combat, 'me', false, 2);
      expect(out.map((x) => x.userId)).toEqual(['me', 'u2', 'u4']);
      const json = JSON.stringify(out);
      for (const leak of ['u3', 'u5', '집행관', '고참', '6800', '7700', '고사목 숲']) expect(json).not.toContain(leak);
      // R1이 볼 때는 R1끼리.
      expect(toDeployMemberProps(rows, combat, 'u4', false, 1).map((x) => x.userId)).toEqual(['u4']);
      // 부길드장(R4, 배치 권한 없음)이 볼 때는 길드장만 빠진다(여기 행에는 길드장이 없어 전원).
      expect(toDeployMemberProps(rows, combat, 'u3', false, 4).map((x) => x.userId)).toEqual(['me', 'u2', 'u3', 'u4', 'u5']);
    });

    it('제한이 없으면 전원이 전투력과 함께 그대로 나간다', () => {
      const out = toDeployMemberProps(rows, combat, 'me', false);
      expect(out.map((m) => m.userId)).toEqual(['me', 'u2', 'u3', 'u4', 'u5']);
      expect(out[2]).toMatchObject({ role: 'vice', combat: 6800, execZoneId: 29, execZoneName: '고사목 숲' });
    });

    it('전투력 정보가 없는 멤버는 0으로 나간다 · 제한인데 본인 행이 없으면 빈 목록', () => {
      expect(toDeployMemberProps(rows, {}, 'me', false)[1]!.combat).toBe(0);
      expect(toDeployMemberProps(rows, combat, 'ghost', true)).toEqual([]);
    });
  });
});
