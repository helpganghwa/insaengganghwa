/**
 * 월드보스 지도 표시용 타입 — 순수 모듈(클라이언트 컴포넌트가 import). 값은 queries.ts(server-only)가 만든다.
 * 숫자는 전부 ms/number로 내려 클라에서 bigint·Date를 다루지 않게 한다(docs/WORLD-BOSS.md §9).
 */
export type WorldBossMine = 'none' | 'recruiting' | 'fought';

export type WorldBossMapBoss = {
  id: string;
  zoneId: number;
  region: string;
  name: string;
  spawnAt: number;
  leaveAt: number;
  /** 누적 피해(문자열 — 억 단위를 넘을 수 있어 정밀도 보존). 표시는 formatCompactKR(Number(...)). */
  totalDamage: string;
  stage: number;
  /** 현재 단계 안에서 쌓인 피해 / 다음 단계까지 필요한 피해. */
  into: number;
  need: number;
  lootDiamond: number;
  lootBoxes: number;
  /** 모집 중 원정대 수 · 출발한 원정대 수. */
  recruiting: number;
  departed: number;
  /** 내 상태 — 모집 중 원정대 소속 / 이미 출발(보스 하나에 1인 1번) / 없음. 비로그인은 'none'. */
  mine: WorldBossMine;
};

/** 떠난 보스 기록(떠난 뒤 48시간 동안 구역 시트에 한 줄) — 주인이 없었으면 settledGuildName null·전리품 소멸. */
export type WorldBossMapLeft = {
  bossId: string;
  zoneId: number;
  region: string;
  name: string;
  leftAt: number;
  settledGuildName: string | null;
  lootDiamond: number;
  lootBoxes: number;
};

export type WorldBossMapState = { active: WorldBossMapBoss[]; left: WorldBossMapLeft[] };
