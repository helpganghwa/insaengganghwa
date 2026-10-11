/**
 * 월드보스 지도 표시용 타입 — 순수 모듈(클라이언트 컴포넌트가 import). 값은 queries.ts(server-only)가 만든다.
 * 숫자는 전부 ms/number로 내려 클라에서 bigint·Date를 다루지 않게 한다(docs/WORLD-BOSS.md §9).
 */
export type WorldBossMapBoss = {
  id: string;
  zoneId: number;
  region: string;
  /** 보스 종류 코드(레지스트리) — 그림·이야기 문장. */
  bossCode: string;
  name: string;
  leaveAt: number;
  stage: number;
  lootDiamond: number;
  lootBoxes: number;
  /** 특성(0~2개) — 구역 카드의 보스 이름 오른쪽에 이름만(이모지 없음, 10-11). */
  traits: { code: string; name: string }[];
};

/** 종료된 보스 기록(종료 뒤 24시간 동안 구역 시트 카드) — 주인이 없었으면 settledGuildName null·전리품 소멸. */
export type WorldBossMapLeft = {
  bossId: string;
  zoneId: number;
  region: string;
  /** 보스 종류 코드(레지스트리) — 그림·이야기 문장. */
  bossCode: string;
  name: string;
  leftAt: number;
  /** 종료 때 단계(최종). */
  stage: number;
  settledGuildName: string | null;
  lootDiamond: number;
  lootBoxes: number;
};

export type WorldBossMapState = { active: WorldBossMapBoss[]; left: WorldBossMapLeft[] };
