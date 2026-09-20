import { hasGuildPerm, type GuildRole } from '@/lib/game/guild/permissions';

/**
 * 점령전 배치 정보 공개 범위(2026-09-20, 유저 건의) — 길드 단위 설정(guilds.deploy_visibility, 0204).
 *  - 'all'(기본): 길드원 누구나 전원의 배치를 본다(종전과 같음).
 *  - 'officer': 배치 담당자만 전체를 보고, 그 밖의 길드원은 **자기가 선 구역**의 배치만 본다.
 *
 * 가리는 일은 서버에서 한다 — 화면에서만 숨기면 전원분이 RSC payload에 그대로 실려 내려간다.
 * DB·요청과 분리한 순수 함수(tests/guild/deploy-visibility.test.ts).
 */
export type DeployVisibility = 'all' | 'officer';
export const DEPLOY_VISIBILITIES: DeployVisibility[] = ['all', 'officer'];

export function parseDeployVisibility(v: string | null | undefined): DeployVisibility {
  return v === 'officer' ? 'officer' : 'all';
}

/**
 * 전체 배치를 볼 수 있는 사람 — 길드장, 그리고 배치를 다루는 권한(길드원 배치 해제 · 집행관 지정)이 있는 부길드장.
 * 집행관을 지정하려면 누가 어디를 지키는지 봐야 해서 executor도 포함한다.
 */
export function isDeployOfficer(role: GuildRole, permissions: number | null | undefined): boolean {
  return hasGuildPerm(role, permissions, 'deploy') || hasGuildPerm(role, permissions, 'executor');
}

export type DeployMemberView = {
  userId: string;
  depZoneId: number | null;
  depZoneName: string | null;
  depRole: 'attack' | 'defend' | null;
  execZoneId: number | null;
  execZoneName: string | null;
};

/**
 * 제한된 시청자에게 내려보낼 멤버 목록 — 본인, 그리고 본인이 선 구역(배치 구역 · 집행관 구역)에 함께 선 길드원만 남긴다.
 * 함께 선 길드원이라도 **다른 구역**에 걸친 정보(예: 내 구역 수비 + 다른 구역 집행관)는 지운다.
 * 본인이 어디에도 서지 않았으면 본인 한 줄만 남는다.
 */
export function maskDeployMembers<T extends DeployMemberView>(members: T[], viewerId: string): T[] {
  const me = members.find((m) => m.userId === viewerId);
  const myZones = new Set<number>();
  if (me?.depZoneId != null) myZones.add(me.depZoneId);
  if (me?.execZoneId != null) myZones.add(me.execZoneId);
  const out: T[] = [];
  for (const m of members) {
    if (m.userId === viewerId) {
      out.push(m);
      continue;
    }
    const depHere = m.depZoneId != null && myZones.has(m.depZoneId);
    const execHere = m.execZoneId != null && myZones.has(m.execZoneId);
    if (!depHere && !execHere) continue;
    out.push({
      ...m,
      depZoneId: depHere ? m.depZoneId : null,
      depZoneName: depHere ? m.depZoneName : null,
      depRole: depHere ? m.depRole : null,
      execZoneId: execHere ? m.execZoneId : null,
      execZoneName: execHere ? m.execZoneName : null,
    });
  }
  return out;
}

/** 이 시청자에게 제한이 걸리는가 — 설정이 'officer'이고 배치 담당자가 아닐 때. */
export function isDeployViewRestricted(visibility: DeployVisibility, role: GuildRole, permissions: number | null | undefined): boolean {
  return visibility === 'officer' && !isDeployOfficer(role, permissions);
}
