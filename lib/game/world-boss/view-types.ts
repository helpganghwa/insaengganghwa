/**
 * 월드보스 상세 화면(/world-boss/<id>) 데이터 모양 — 순수 모듈(클라이언트가 import). 값은 queries.ts가 만든다.
 * 숫자는 number/문자열로만 내려 클라에서 bigint·Date를 다루지 않는다.
 */
export type WorldBossPartyCard = {
  id: string;
  status: 'recruiting' | 'departed';
  leaderNickname: string;
  guildName: string | null;
  /** 길드 문양(+대표색) — 길드 이름은 항상 문양과 함께 보인다(10-10 사용자). */
  guildEmblemUrl: string | null;
  guildEmblemColor: string | null;
  /** 만들 때 적은 소개글(선택, WORLD_BOSS_PARTY_INTRO_MAX자) — 모집 카드·내 원정대 패널에 보인다. */
  intro: string | null;
  /**
   * 명단(대장 먼저, 나머지는 참가 순) — 모집 중은 월드보스 전투력(combat), 완료는 그 전투에서 준 피해(damage). 길드 문양은 닉네임 옆에(무소속은 없음).
   */
  members: { userId: string; nickname: string; combat: number; damage: number; isLeader: boolean; guildEmblemUrl: string | null; guildEmblemColor: string | null }[];
  /** 명단의 전투력 합(모집 카드 '합산 전투력'). 완료 카드는 0. */
  combatSum: number;
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

/** 출발 팝업 행의 장착 한 칸(P3-c, 10-11) — cp는 보너스를 더한 부위 전투력, av/weak는 칸 색(보라/주황). */
export type WorldBossPersonPiece = { slot: 'weapon' | 'armor' | 'accessory'; src: string | null; cp: number; av: boolean; weak: boolean };

export type WorldBossPerson = {
  userId: string;
  nickname: string;
  code: string | null;
  guildName: string | null;
  guildEmblemUrl: string | null;
  guildEmblemColor: string | null;
  /** 월드보스 전투력 — 장착 3개 + 아바타·공개된 약점 보너스(docs/WORLD-BOSS.md §3). */
  combat: number;
  /** 공개된 약점을 장착한 부위 수 · 아바타 보너스를 받는 부위 수(0~3). */
  weakCount: number;
  avatarCount: number;
  /** 활성 프로필 정면 그림 + 얼굴 박스(친구 목록과 같은 썸네일 크롭). 없으면 null. */
  avatarSrc: string | null;
  faceBox: { cx: number; cy: number; h: number } | null;
  /** 장착 3칸(부위 순) — 출발 팝업 행. 장착이 없으면 빈 배열. */
  pieces: WorldBossPersonPiece[];
};

/** 내 원정대(소속일 때) — 참가 순 원정대원 + (대장이면) 대기 중 신청. */
export type WorldBossMyParty = {
  partyId: string;
  status: 'recruiting' | 'departed';
  isLeader: boolean;
  leaderUserId: string;
  /** 대장이 맨 앞, 나머지는 참가 순. 출발한 원정대는 대원마다 결과(준 피해·뽑은 보상, 전투 기록에서 센다)가 붙는다. */
  members: (WorldBossPerson & { isLeader: boolean; result?: WorldBossMemberResult })[];
  requests: WorldBossPerson[];
  /** 대장이 보낸 대기 중 초대(10-11) — 빈 자리에 '초대 중'으로 보인다. 대장일 때만 채운다. */
  invites: WorldBossPerson[];
};

/** 출발한 원정대의 대원 결과 — 얼굴 아래 '준 피해 · 보상'(우편과 같은 값). */
export type WorldBossMemberResult = { damage: number; diamond: number; boxes: number };

/** 초대 후보(친구·같은 길드원) — 상태별로 버튼이 다르다. */
export type WorldBossInvitable = WorldBossPerson & { source: 'friend' | 'guild' | 'both'; state: 'ok' | 'invited' | 'in_party' | 'fought'; /** 마지막 접속(ISO) — 레이드 초대 시트와 같은 접속 표시. */ lastSeenAt: string | null };

/** 나에게 온 초대(대기 중) — 이 보스의 모집 중 원정대만. */
export type WorldBossInviteIn = { partyId: string; leaderNickname: string; memberCount: number };

/**
 * 내 상태 — none(참가 전) · pending(신청 대기 중인 원정대가 하나 이상) · member(모집 중 원정대 소속) · fought(이 보스와 이미 싸움).
 * canCreate = 구역 주인 길드원이고 참가 전·신청 대기 아님·보스가 머무는 중.
 */
export type WorldBossMe = {
  userId: string;
  state: 'none' | 'pending' | 'member' | 'fought';
  /** 대기 중 신청을 걸어 둔 원정대들 — 여러 곳에 동시에 신청할 수 있다(10-10). 한 곳에 수락되면 나머지는 사라진다. */
  pendingPartyIds: string[];
  canCreate: boolean;
  /** 내 길드가 구역 주인인가 — '만들기는 ○○ 길드원만' 안내 분기. */
  isOwnerGuild: boolean;
  /** 나(이름·길드·전투력) — 원정대를 만들 때 낙관적으로 내 원정대 패널을 바로 그리기 위해(보스가 머무는 중·캐릭터 있을 때). */
  person: WorldBossPerson | null;
  /** 나에게 온 대기 중 초대(참가 전일 때만). */
  invites: WorldBossInviteIn[];
};

/** 보스 특성(0~2개) — 이름 오른쪽 칩과 설명 시트에 쓴다(docs/WORLD-BOSS.md §3.5). */
export type WorldBossTraitView = { code: string; icon: string; name: string; effect: string; group: 'party' | 'boss' };

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
  /** 지금 구역 주인(머무는 동안) — 떠날 때 이 길드 금고로. 떠난 뒤엔 정산 받은 길드. 이름은 문양과 함께 보인다. */
  ownerGuildName: string | null;
  ownerGuildEmblem: { url: string | null; color: string | null } | null;
  settledGuildName: string | null;
  settledGuildEmblem: { url: string | null; color: string | null } | null;
  parties: WorldBossPartyCard[];
  me: WorldBossMe | null;
  myParty: WorldBossMyParty | null;
  /** 지금 공격 중인 단계의 페이즈(5단계마다). */
  phase: { index: number; from: number; to: number };
  /** 이 페이즈에서 맞혀서 공개된 약점. 공개 전 약점은 아무도 모른다. */
  weakKnown: import('./loadout').KnownWeak[];
  /** 페이즈 약점 총수(부위별 수 × 3 — 특성 넓어진·치명 약점이면 60·15). */
  weakTotal: number;
  /** 약점 보너스(기본 1.0 = 전투력 2배, 치명 약점 2.0 = 3배). */
  weakBonus: number;
  /** 특성 코드(WORLD_BOSS_TRAITS) → 화면용. 없으면 빈 배열. */
  traits: WorldBossTraitView[];
  /** 내 장착 상태와 제안 — 보스가 머무는 중이고 캐릭터가 있을 때만. */
  mine: { loadout: import('./loadout').Loadout; best: { power: number; pieces: import('./loadout').LoadoutPiece[] } | null } | null;
};

/** 출발한 원정대의 전투 기록 — 재생 화면(WorldBossReplay)이 쓴다. finale은 simulate.ts의 WorldBossFinale과 같은 모양. */
export type WorldBossBattle = {
  partyId: string;
  leaderNickname: string;
  finale: {
    roster: { userId: string; nickname: string; cp: number; guildName: string | null; /** 출발 때 장착(이름은 10-11부터 기록) — 재생 일지 문장용. */ items?: { slot: string; code: string; name?: string }[] }[];
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
  /** 길드 문양(userId → 문양·대표색) — 기록의 길드 이름과 지금 소속이 같은 사람만. 기록엔 이름만 있어 문양은 지금 것을 쓴다. */
  guildEmblems?: Record<string, { url: string | null; color: string | null }>;
  /** 원정대원 얼굴 썸네일(userId → 그림·얼굴 박스) — 재생 칸에 쓴다. 없으면 이니셜. */
  avatars: Record<string, { src: string | null; box: { cx: number; cy: number; h: number } | null }>;
};
