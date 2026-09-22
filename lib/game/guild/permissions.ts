/**
 * 부길드장 권한(2026-07-30) — 길드장이 부길드장 **개인별**로 열어주는 열 가지.
 *
 * 길드장은 항상 전부 가진다(설정 대상이 아니다). 길드장 전속 네 가지는 이 목록에 없다 —
 * 부길드장 임명·해제 / 길드장 위임 / 길드 해산 / **권한 설정 자체**. 마지막 것을 전속으로
 * 두지 않으면 부길드장이 자기 권한을 올릴 수 있다.
 *
 * 저장은 `guild_members.permissions` 비트마스크(0142). 길드 단위가 아니라 멤버 행이라
 * 부길드장 해제 시 권한도 함께 사라지고, 다시 임명하면 기본값에서 시작한다.
 */
export const GUILD_PERM = {
  /** 길드 공지 작성 */
  notice: 1 << 0,
  /** 길드 소개 작성(공개) */
  intro: 1 << 1,
  /** 카카오 오픈채팅 설정 */
  openchat: 1 << 2,
  /** 가입 신청 승인·거절 + 가입 방식(자유/승인) 변경 */
  joinReview: 1 << 3,
  /** 일반 길드원 추방(부길드장은 대상 불가 — 그건 길드장 전속) */
  kick: 1 << 4,
  /** 점령전 집행관 지정·해제(집행관은 맡은 구역의 세금을 권한 없이 수금한다) */
  executor: 1 << 5,
  /**
   * 다른 길드원의 점령전 배치 **해제**.
   * ⚠ 배치 자체는 본인만 한다 — 남을 배치하는 UI 경로는 없다(deployMember는 휴면 서버 함수).
   * 그래서 이 권한이 실제로 여는 것은 해제뿐이다(2026-07-30 확인).
   */
  deploy: 1 << 6,
  /** 세금 분배 — 곳간의 다이아를 길드원에게 나눠 준다(되돌릴 수 없음). 2026-09-20 수금이 taxCollect로 갈라졌다. */
  taxDistribute: 1 << 7,
  /** 문양 생성·변경(생성마다 다이아 소모) */
  emblem: 1 << 8,
  /**
   * 세금 수금(대리 · 일괄) — 남이 집행관인 구역의 세금을 곳간으로 걷는다(집행관 몫 10%는 그대로 집행관에게).
   * 2026-09-20 분배에서 분리(유저 건의): 수금은 단순 작업이고 분배는 잘못하면 되돌릴 수 없어 맡기는 사람이 다르다.
   * 집행관 본인의 자기 구역 수금은 이 권한과 무관하다.
   */
  taxCollect: 1 << 9,
} as const;

export type GuildPermKey = keyof typeof GUILD_PERM;

/** 화면 표시 순서 — 약한 것부터. 권한 화면 토글 순서와 1:1. */
export const GUILD_PERM_ORDER: GuildPermKey[] = [
  'notice',
  'intro',
  'openchat',
  'joinReview',
  'executor',
  'deploy',
  'kick',
  'taxCollect',
  'taxDistribute',
  'emblem',
];

/** 라벨·부가설명 — 권한 화면과 안내 문구 공용(문구를 코드 한 곳에서만 관리). */
export const GUILD_PERM_META: Record<GuildPermKey, { label: string; desc?: string }> = {
  notice: { label: '공지 작성' },
  intro: { label: '소개 작성', desc: '길드 목록에 공개' },
  openchat: { label: '오픈채팅 설정' },
  joinReview: { label: '가입 관리', desc: '신청 승인 · 거절 · 가입 방식' },
  executor: { label: '집행관 지정', desc: '집행관은 맡은 구역 세금을 수금합니다' },
  deploy: { label: '길드원 배치 해제', desc: '남의 공격 · 수비를 물림(배치는 본인만)' },
  kick: { label: '길드원 추방', desc: '되돌릴 수 없습니다' },
  taxCollect: { label: '세금 수금', desc: '남의 구역 대리 수금 · 모두 수금' },
  taxDistribute: { label: '세금 분배', desc: '분배 시 다이아가 나갑니다' },
  emblem: { label: '문양 생성 · 변경', desc: '생성마다 다이아 소모' },
};

/**
 * 켤 때 확인을 받아야 하는 권한 — 되돌릴 수 없거나 재화가 나가는 것.
 * 끄는 쪽은 확인하지 않는다(권한을 좁히는 방향은 막을 이유가 없다).
 */
export const GUILD_PERM_CONFIRM = ['executor', 'kick', 'taxDistribute', 'emblem'] as const satisfies readonly GuildPermKey[];
export type GuildPermConfirmKey = (typeof GUILD_PERM_CONFIRM)[number];
/** 켤 때 확인이 필요한 권한인가(타입 가드 — 확인 문구 표를 이 키로만 찾게 한다). */
export function isConfirmKey(key: GuildPermKey): key is GuildPermConfirmKey {
  return (GUILD_PERM_CONFIRM as readonly GuildPermKey[]).includes(key);
}

/** 부길드장 임명 시 기본값 — 공지·소개·오픈채팅만 켬. 이 셋도 길드장이 끌 수 있다. */
export const GUILD_PERM_DEFAULT = GUILD_PERM.notice | GUILD_PERM.intro | GUILD_PERM.openchat;

/** 설정 가능한 전체 비트(마스크 검증용) — 알 수 없는 비트는 저장 시 버린다. */
export const GUILD_PERM_ALL = GUILD_PERM_ORDER.reduce((m, k) => m | GUILD_PERM[k], 0);

export type GuildRole = 'leader' | 'vice' | 'member';

/**
 * 이 멤버가 권한을 갖는가 — 길드장은 항상 true, 일반 길드원은 항상 false.
 * 부길드장만 비트마스크를 본다.
 */
export function hasGuildPerm(
  role: GuildRole,
  permissions: number | null | undefined,
  key: GuildPermKey,
): boolean {
  if (role === 'leader') return true;
  if (role !== 'vice') return false;
  return ((permissions ?? 0) & GUILD_PERM[key]) !== 0;
}

/** 비트마스크 → 키 배열(화면 표시 순서). */
export function permKeys(permissions: number | null | undefined): GuildPermKey[] {
  const p = permissions ?? 0;
  return GUILD_PERM_ORDER.filter((k) => (p & GUILD_PERM[k]) !== 0);
}

