import type { GuildRole } from './permissions';

/**
 * 길드 직급 R1~R5(2026-10-15, 유저 건의 — 고참·신입 정보 편차, 배치 열람 범위).
 *
 * 숫자가 클수록 높다(4X 전략 게임 관례: R5 길드장 · R4 부길드장 · R3/R2/R1 길드원).
 * 길드장·부길드장은 역할(role)로 정해지고 길드원만 `guild_members.rank`(1~3, 0244)를 가진다.
 * 가입하면 R1. 부길드장 해제·길드장 교체로 길드원이 되면 R3(사용자 결정).
 * 직급 자체에 붙박이 혜택은 없다 — 배치 정보 공개 범위(deploy-visibility.ts)가 'RN 이상'일 때
 * 누가 전체 배치를 보는지 가르는 기준일 뿐이다. 칭호·세금·레이드·채팅은 직급과 무관.
 */
export type MemberRank = 1 | 2 | 3;
export const MEMBER_RANKS: readonly MemberRank[] = [1, 2, 3];
/** 부길드장 해제 · 길드장 교체로 길드원이 될 때 받는 직급. */
export const GUILD_DEMOTED_RANK: MemberRank = 3;
/** 가입 시 직급(DB 기본값과 같다). */
export const GUILD_JOIN_RANK: MemberRank = 1;

export function isMemberRank(v: unknown): v is MemberRank {
  return v === 1 || v === 2 || v === 3;
}

/** DB 값 → 직급. 모르는 값은 R1로 닫는다. */
export function parseMemberRank(v: number | null | undefined): MemberRank {
  return isMemberRank(v) ? v : 1;
}

/** 직급 숫자 1~5 — 길드장 5, 부길드장 4, 길드원은 rank. 비교("RN 이상")는 전부 이 값으로 한다. */
export function rankOf(role: GuildRole, rank: number | null | undefined): 1 | 2 | 3 | 4 | 5 {
  if (role === 'leader') return 5;
  if (role === 'vice') return 4;
  return parseMemberRank(rank);
}

/** 'R5 길드장' · 'R4 부길드장' · 'R3' — 목록 그룹 헤더 · 시트 부제 공용. */
export function rankLabel(role: GuildRole, rank: number | null | undefined): string {
  if (role === 'leader') return 'R5 길드장';
  if (role === 'vice') return 'R4 부길드장';
  return `R${parseMemberRank(rank)}`;
}
