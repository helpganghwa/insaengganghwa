/** 역사 페이지 공용 타입(순수) — 서버 로더와 클라이언트 플레이어가 함께 쓴다. */
import type { ConquestReplay } from '@/lib/game/guild/conquest/replay';

export type HistoryDay = { kstDay: string; headline: string };
export type HistoryZone = { id: number; name: string; region: string; mapX: number; mapY: number };
/** 길드 표시값. `id`는 문양 이력(emblemHistory) 조회용 — 스냅샷·현재 모두 없으면 null. */
export type HistoryGuildMeta = { color: string | null; emblemUrl: string | null; id?: number | null };
export type HistoryIndex = {
  serverId: number;
  /** 공개된 날(kst_day < 오늘 KST) 오름차순 — 첫날부터. */
  days: HistoryDay[];
  zones: HistoryZone[];
  edges: { a: number; b: number }[];
  /** 지금(최신 공개일 종료 후) 구역 소유 — 첫 진입 정지 화면. */
  owners: Record<number, string | null>;
  /** 현재 길드 표시값(이름 → 색·문양). 과거 날은 그날 리플레이의 스냅샷이 우선. */
  guilds: Record<string, HistoryGuildMeta>;
  /**
   * 길드 id → 연대기 스냅샷에 등장한 문양 URL을 시간순으로(중복 제거) + 현재 문양. 옛 문양 파일이 사라진 URL(보관함
   * 삭제 → 400)이면 클라이언트가 이 목록에서 그 다음 문양으로 넘어간다(2026-09-16: 「전설」 첫 문양 유실 → 두 번째 문양).
   */
  emblemHistory: Record<number, string[]>;
  story: HistoryStory;
};
/** 그날의 장면(2026-09-17) — 하루에서 가장 큰 사건 하나를 카드로. 우선순위: 석권 > 1위 교체 > 격전 > 소수 승리 > 활약 > 헤드라인. */
export type HistoryScene = {
  kind: 'sweep' | 'leader' | 'clash' | 'underdog' | 'hero' | 'headline';
  /** 큰 제목(마커 없음). */
  title: string;
  /** 한 줄 설명(마커 없음). */
  note: string;
  /** 배경 그림용 지역 코드(sprites/guild/region/<code>.png) — 없으면 null. */
  region: string | null;
  regionLabel: string | null;
  zone: string | null;
  /** 관련 길드(최대 3) — 그날 스냅샷 표시값. */
  guilds: { name: string; color: string | null; emblemUrl: string | null; emblemAlsoTry?: string[] }[];
  /** 활약 인물(있으면). */
  hero: { nickname: string; code: string | null; guild: string; kind: string; count: number } | null;
};
export type HistoryDayData = {
  kstDay: string;
  headline: string;
  text: string;
  replay: ConquestReplay | null;
  scene: HistoryScene | null;
};

/** 판도 차트·시대·사건(2026-09-16, A안) — 전부 코드 집계. */
export type HistorySeriesGuild = { id: number; name: string; color: string | null };
export type HistoryEra = { startIdx: number; endIdx: number; guildId: number; name: string; color: string | null };
export type HistoryEventKind = 'sweep' | 'rename' | 'disband' | 'vanish' | 'peak' | 'leader' | 'power1';
export type HistoryEvent = { kind: HistoryEventKind; label: string; short: string };
export type HistoryStory = {
  /** 차트 대상 길드(최대 보유 상위 6, 나머지 제외). */
  guilds: HistorySeriesGuild[];
  /** days와 같은 길이. counts[dayIdx][guildIdx] = 그날 종료 시점 보유 구역 수. */
  counts: number[][];
  /** 대륙 1위(길드 id) 기준 시대 — 개명은 경계가 아니다. */
  eras: HistoryEra[];
  /** kstDay → 그날 사건 칩(정적). */
  events: Record<string, HistoryEvent[]>;
};
