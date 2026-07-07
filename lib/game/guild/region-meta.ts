/**
 * 지역(대륙 6권역) 표시 메타 — 라벨·지역색. 클라이언트 안전(순수 데이터, 서버 의존 없음).
 * 세계지도 렌더·길드 팝업 점령 구역 칩 등 지역색이 필요한 모든 UI의 단일 출처.
 */
export type Region = 'volcano' | 'temple' | 'swamp' | 'orc' | 'kingdom' | 'angel';

export const REGION_META: Record<
  Region,
  {
    label: string;
    /** 지도 오버레이·인라인 강조용 헥스(어두운 캔버스 전제). */
    color: string;
    /** 구역 이름 칩용 Tailwind 클래스 — 라이트/다크 모두 대비 확보(팝업은 라이트 배경 존재). */
    chip: string;
  }
> = {
  volcano: {
    label: '드래곤 화산',
    color: '#ef4444',
    chip: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300',
  },
  temple: {
    label: '잊힌 신전',
    color: '#60a5fa',
    chip: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300',
  },
  swamp: {
    label: '슬라임 늪',
    color: '#22c55e',
    chip: 'bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-300',
  },
  orc: {
    label: '오크 부락',
    color: '#f97316',
    chip: 'bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-300',
  },
  kingdom: {
    label: '왕국',
    color: '#fbbf24',
    chip: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
  },
  angel: {
    label: '타락 천사 부유섬',
    color: '#c084fc',
    chip: 'bg-purple-50 text-purple-700 dark:bg-purple-500/10 dark:text-purple-300',
  },
};

/** 지역 현황 표시 순서 — 왕국·오크·늪·화산·신전·부유섬. */
export const REGION_ORDER: Region[] = ['kingdom', 'orc', 'swamp', 'volcano', 'temple', 'angel'];
