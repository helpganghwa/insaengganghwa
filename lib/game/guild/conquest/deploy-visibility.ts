import { hasGuildPerm, type GuildRole } from '@/lib/game/guild/permissions';

/**
 * 점령전 배치 정보 공개 범위(2026-09-20, 유저 건의) — 길드 단위 설정(guilds.deploy_visibility, 0204).
 *  - 'all'(기본): 길드원 누구나 전원의 배치를 본다(종전과 같음).
 *  - 'officer': 배치 담당자만 전체를 보고, 그 밖의 길드원은 **자기 배치만** 본다(같은 구역에 선 동료도 보이지 않는다 — 사용자 확정).
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

/**
 * 제한된 시청자에게 내려보낼 멤버 목록 — **본인 한 줄만** 남긴다.
 * 같은 구역에 함께 선 길드원도 내려보내지 않는다: 한 구역의 인원·전투력만 알아도 그 구역의 방비가 드러난다.
 */
export function maskDeployMembers<T>(members: T[], viewerId: string, idOf: (m: T) => string): T[] {
  return members.filter((m) => idOf(m) === viewerId);
}

/** 이 시청자에게 제한이 걸리는가 — 설정이 'officer'이고 배치 담당자가 아닐 때. */
export function isDeployViewRestricted(visibility: DeployVisibility, role: GuildRole, permissions: number | null | undefined): boolean {
  return visibility === 'officer' && !isDeployOfficer(role, permissions);
}
