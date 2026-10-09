/**
 * 월드보스 상세 화면(/world-boss/<id>) 데이터 모양 — 순수 모듈(클라이언트가 import). 값은 queries.ts가 만든다.
 * 숫자는 number/문자열로만 내려 클라에서 bigint·Date를 다루지 않는다.
 */
export type WorldBossPartyCard = {
  id: string;
  status: 'recruiting' | 'departed';
  leaderNickname: string;
  guildName: string | null;
  memberCount: number;
  createdAt: number;
  /** 출발한 원정대만 — 피해·라운드·단계 구간·1인 보상. */
  departedAt: number | null;
  damage: number;
  rounds: number;
  stageFrom: number | null;
  stageTo: number | null;
  rewardDiamond: number;
  rewardBoxes: number;
};

export type WorldBossPerson = {
  userId: string;
  nickname: string;
  code: string | null;
  guildName: string | null;
  /** 월드보스 전투력 — 장착 3개 + 아바타·공개된 약점 보너스(docs/WORLD-BOSS.md §3). */
  combat: number;
  /** 공개된 약점을 장착한 부위 수 · 아바타 보너스를 받는 부위 수(0~3). */
  weakCount: number;
  avatarCount: number;
  /** 활성 프로필 정면 그림 + 얼굴 박스(친구 목록과 같은 썸네일 크롭). 없으면 null. */
  avatarSrc: string | null;
  faceBox: { cx: number; cy: number; h: number } | null;
};

/** 내 원정대(소속일 때) — 참가 순 원정대원 + (대장이면) 대기 중 신청. */
export type WorldBossMyParty = {
  partyId: string;
  status: 'recruiting' | 'departed';
  isLeader: boolean;
  leaderUserId: string;
  members: (WorldBossPerson & { isLeader: boolean })[];
  requests: WorldBossPerson[];
};

/**
 * 내 상태 — none(참가 전) · pending(신청 대기, partyId) · member(모집 중 원정대 소속) · fought(이 보스와 이미 싸움).
 * canCreate = 구역 주인 길드원이고 참가 전·신청 대기 아님·보스가 머무는 중.
 */
export type WorldBossMe = {
  userId: string;
  state: 'none' | 'pending' | 'member' | 'fought';
  pendingPartyId: string | null;
  canCreate: boolean;
  /** 내 길드가 구역 주인인가 — '만들기는 ○○ 길드원만' 안내 분기. */
  isOwnerGuild: boolean;
};

export type WorldBossDetail = {
  id: string;
  serverId: number;
  zoneId: number;
  zoneName: string;
  region: string;
  name: string;
  status: 'scheduled' | 'active' | 'left';
  spawnAt: number;
  leaveAt: number;
  totalDamage: number;
  stage: number;
  into: number;
  need: number;
  lootDiamond: number;
  lootBoxes: number;
  /** 지금 구역 주인(머무는 동안) — 떠날 때 이 길드 금고로. 떠난 뒤엔 정산 받은 길드. */
  ownerGuildName: string | null;
  settledGuildName: string | null;
  parties: WorldBossPartyCard[];
  me: WorldBossMe | null;
  myParty: WorldBossMyParty | null;
  /** 지금 공격 중인 단계의 페이즈(5단계마다). */
  phase: { index: number; from: number; to: number };
  /** 이 페이즈에서 맞혀서 공개된 약점(발견자 이름). 공개 전 약점은 아무도 모른다. */
  weakKnown: import('./loadout').KnownWeak[];
  /** 페이즈 약점 총수(부위별 10 × 3). */
  weakTotal: number;
  /** 내 장착 상태와 제안 — 보스가 머무는 중이고 캐릭터가 있을 때만. */
  mine: { loadout: import('./loadout').Loadout; best: { power: number; pieces: import('./loadout').LoadoutPiece[] } | null } | null;
};

/** 출발한 원정대의 전투 기록 — 재생 화면(WorldBossReplay)이 쓴다. finale은 simulate.ts의 WorldBossFinale과 같은 모양. */
export type WorldBossBattle = {
  partyId: string;
  leaderNickname: string;
  finale: {
    roster: { userId: string; nickname: string; cp: number; guildName: string | null }[];
    events: [number, number, number, number][];
    /** events와 짝 — 공격마다 뽑은 [다이아, 상자](쓰러짐은 [0,0]). 옛 기록엔 없다. */
    drops?: [number, number][];
    /** events와 짝 — 공격에서 약점을 맞힌 부위 비트(무기 1·방어구 2·장신구 4). 옛 기록엔 없다. */
    weak?: number[];
    rounds: number;
    totalDamage: number;
  };
  stageFrom: number;
  stageTo: number;
  /** 원정대 전체 획득 합(공격마다 뽑은 보상의 합 — 원정대원마다 몫이 다르다). */
  reward: { diamond: number; boxes: number };
  /** 원정대원 얼굴 썸네일(userId → 그림·얼굴 박스) — 재생 칸에 쓴다. 없으면 이니셜. */
  avatars: Record<string, { src: string | null; box: { cx: number; cy: number; h: number } | null }>;
};
