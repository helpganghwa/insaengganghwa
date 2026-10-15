import { hasGuildPerm, type GuildRole } from '@/lib/game/guild/permissions';
import { rankOf } from '@/lib/game/guild/rank';

/**
 * 점령전 배치 정보 공개 범위(2026-09-20 유저 건의, 2026-10-15 직급 R1~R5로 확장) — 길드 단위 설정(guilds.deploy_visibility, 0204 · 0244).
 *  - 'all'(기본): 길드원 누구나 전원의 배치를 본다(종전과 같음).
 *  - 'r2' | 'r3' | 'r4' | 'r5': 그 직급 **이상**(rank.ts rankOf — 길드장 5 · 부길드장 4 · 길드원 1~3)만 전체를 보고,
 *    그 밖의 길드원은 **자기 배치만** 본다(같은 구역에 선 동료도 보이지 않는다 — 사용자 확정).
 *  - 배치 권한(배치 해제 · 집행관 지정)이 있는 부길드장은 설정과 무관하게 항상 전체를 본다 — 집행관을 지정하려면
 *    누가 어디를 지키는지 봐야 한다. 배치 권한과 공개 범위는 별개(사용자 결정 2026-10-15).
 *  - 종전 'officer'(길드장 + 배치 권한 부길드장)는 'r5'와 뜻이 같아 그렇게 읽는다(0244가 값도 옮긴다).
 *
 * 가리는 일은 서버에서 한다 — 화면에서만 숨기면 전원분이 RSC payload에 그대로 실려 내려간다.
 * DB·요청과 분리한 순수 함수(tests/guild/deploy-visibility.test.ts).
 */
export type DeployVisibility = 'all' | 'r2' | 'r3' | 'r4' | 'r5';
export const DEPLOY_VISIBILITIES: DeployVisibility[] = ['all', 'r2', 'r3', 'r4', 'r5'];

export function parseDeployVisibility(v: string | null | undefined): DeployVisibility {
  if (v === 'officer') return 'r5';
  return (DEPLOY_VISIBILITIES as string[]).includes(v ?? '') ? (v as DeployVisibility) : 'all';
}

/** 전체 배치를 보는 최소 직급(1~5). 'all'은 1. */
export function deployVisibilityMinRank(v: DeployVisibility): 1 | 2 | 3 | 4 | 5 {
  return v === 'all' ? 1 : (Number(v.slice(1)) as 2 | 3 | 4 | 5);
}

/** 설정 선택지 라벨 — 배치 현황 팝업 · 길드 기록 공용. */
export const DEPLOY_VISIBILITY_LABEL: Record<DeployVisibility, string> = {
  all: '전체',
  r2: 'R2 이상',
  r3: 'R3 이상',
  r4: 'R4 이상',
  r5: 'R5',
};

/** 선택지 설명 한 줄(설정 아래). */
export function deployVisibilityDesc(v: DeployVisibility): string {
  if (v === 'all') return '길드원 모두가 전체 배치를 볼 수 있습니다';
  if (v === 'r5') return '길드장과 배치 권한이 있는 부길드장만 전체 배치를 볼 수 있습니다';
  return `${DEPLOY_VISIBILITY_LABEL[v]} 직급과 길드장, 배치 권한이 있는 부길드장만 전체 배치를 볼 수 있습니다`;
}

/** 제한된 길드원에게 보이는 안내문(구역 시트 · 내 배치 팝업). */
export function deployRestrictedNote(v: DeployVisibility): string {
  if (v === 'r5' || v === 'all') return '길드 전체 배치는 길드장과 배치 권한이 있는 부길드장만 볼 수 있습니다.';
  return `길드 전체 배치는 ${DEPLOY_VISIBILITY_LABEL[v]} 직급과 길드장, 배치 권한이 있는 부길드장만 볼 수 있습니다.`;
}

/**
 * 전체 배치를 볼 수 있는 사람 — 길드장, 그리고 배치를 다루는 권한(길드원 배치 해제 · 집행관 지정)이 있는 부길드장.
 * 집행관을 지정하려면 누가 어디를 지키는지 봐야 해서 executor도 포함한다.
 */
export function isDeployOfficer(role: GuildRole, permissions: number | null | undefined): boolean {
  return hasGuildPerm(role, permissions, 'deploy') || hasGuildPerm(role, permissions, 'executor');
}

/** 배치 보드 조회가 돌려주는 멤버 행(서버 쿼리 컬럼 이름 그대로). */
export type DeployBoardRow = {
  uid: string;
  nickname: string;
  mrole: GuildRole;
  dep_zone_id: number | null;
  dep_zone_name: string | null;
  dep_role: 'attack' | 'defend' | null;
  exec_zone_id: number | null;
  exec_zone_name: string | null;
};

/** 점령지 화면(클라이언트)으로 넘기는 멤버 한 줄. */
export type DeployMemberProp = {
  userId: string;
  nickname: string;
  role: GuildRole;
  combat: number;
  depZoneId: number | null;
  depZoneName: string | null;
  depRole: 'attack' | 'defend' | null;
  execZoneId: number | null;
  execZoneName: string | null;
};

/**
 * 제한된 시청자에게 내려보낼 멤버 목록 — **본인 한 줄만** 남긴다.
 * 같은 구역에 함께 선 길드원도 내려보내지 않는다: 한 구역의 인원·전투력만 알아도 그 구역의 방비가 드러난다.
 */
export function maskDeployMembers<T>(members: T[], viewerId: string, idOf: (m: T) => string): T[] {
  return members.filter((m) => idOf(m) === viewerId);
}

/**
 * 클라이언트로 넘길 멤버 목록 조립 — 페이지가 이 함수만 거쳐 넘긴다.
 * 제한된 시청자면 서버 쿼리가 이미 본인 행만 읽지만, 여기서 **한 번 더** 거른다(조회 옵션을 빠뜨리는 회귀 대비).
 * 전투력은 남는 멤버 것만 꺼낸다 — combat 맵 전체를 넘기지 않는다.
 */
export function toDeployMemberProps(
  rows: DeployBoardRow[],
  combat: Record<string, number>,
  viewerId: string,
  restricted: boolean,
): DeployMemberProp[] {
  const visible = restricted ? maskDeployMembers(rows, viewerId, (m) => m.uid) : rows;
  return visible.map((m) => ({
    userId: m.uid,
    nickname: m.nickname,
    role: m.mrole,
    combat: combat[m.uid] ?? 0,
    depZoneId: m.dep_zone_id,
    depZoneName: m.dep_zone_name,
    depRole: m.dep_role,
    execZoneId: m.exec_zone_id,
    execZoneName: m.exec_zone_name,
  }));
}

/**
 * 이 시청자에게 제한이 걸리는가 — 설정의 최소 직급에 못 미치고, 배치 권한도 없을 때.
 * 길드장(5)은 어떤 설정에서도 통과하고, 배치 권한 부길드장은 설정과 무관하게 통과한다.
 */
export function isDeployViewRestricted(
  visibility: DeployVisibility,
  role: GuildRole,
  permissions: number | null | undefined,
  rank: number | null | undefined,
): boolean {
  if (visibility === 'all') return false;
  if (isDeployOfficer(role, permissions)) return false;
  return rankOf(role, rank) < deployVisibilityMinRank(visibility);
}
