/** 역사 페이지 공용 타입(순수) — 서버 로더와 클라이언트 플레이어가 함께 쓴다. */
import type { ConquestReplay } from '@/lib/game/guild/conquest/replay';

export type HistoryDay = { kstDay: string; headline: string };
export type HistoryZone = { id: number; name: string; region: string; mapX: number; mapY: number };
export type HistoryGuildMeta = { color: string | null; emblemUrl: string | null };
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
};
export type HistoryDayData = { kstDay: string; headline: string; text: string; replay: ConquestReplay | null };
