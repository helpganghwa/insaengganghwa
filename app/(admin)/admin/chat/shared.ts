/**
 * 채팅 검수(일반·길드·귓속말) 공용 — URL 파라미터 파서 · 링크 빌더 · 시각 표기.
 * 화면 상태(탭·서버·검색·페이지·열람 대상)를 전부 URL로 표현해 서버 컴포넌트만으로 동작시킨다
 * (검수 화면은 조회가 대부분이라 클라이언트 상태를 둘 이유가 없다).
 */

export type ChatTab = 'world' | 'guild' | 'whisper';

export interface ChatSearchParams {
  tab?: string;
  srv?: string;
  q?: string;
  p?: string;
  /** 길드 탭 — 열람 중인 길드 id(없으면 길드 목록). */
  gid?: string;
  /** 귓속말 탭 — 검수 대상 유저(없으면 유저 검색). */
  uid?: string;
  /** 귓속말 탭 — 대화 상대(있으면 스레드 열람). */
  peer?: string;
}

export const CHAT_BASE_PATH = '/admin/chat';
/** 한 화면 표시 건수 — 목록·스레드 공통(오프셋 페이지네이션, 검수는 건수 제한 없음). */
export const CHAT_PAGE_SIZE = 100;

export const CHAT_TABS: { id: ChatTab; label: string }[] = [
  { id: 'world', label: '일반' },
  { id: 'guild', label: '길드' },
  { id: 'whisper', label: '귓속말' },
];

export function parseChatTab(v: string | undefined): ChatTab {
  return v === 'guild' || v === 'whisper' ? v : 'world';
}

/** ?p= → 0 이상 정수. 상한을 둬 임의 offset으로 대량 스캔을 유발하지 못하게 한다. */
export function parsePage(v: string | undefined): number {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? Math.min(n, 200) : 0;
}

/** bigint 문자열 파라미터(gid) → bigint | null. 숫자가 아니면 무시. */
export function parseBigIntParam(v: string | undefined): bigint | null {
  if (!v || !/^\d+$/.test(v)) return null;
  try {
    return BigInt(v);
  } catch {
    return null;
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** uid·peer 파라미터 — uuid 형식만 통과(잘못된 값이 SQL 캐스트 에러가 되지 않게). */
export function parseUuidParam(v: string | undefined): string | null {
  return v && UUID_RE.test(v) ? v : null;
}

/** 현재 파라미터에 patch를 덮어 /admin/chat 링크 생성. patch 값이 null/''이면 그 키를 제거. */
export function chatHref(
  cur: ChatSearchParams,
  patch: Partial<Record<keyof ChatSearchParams, string | number | null>> = {},
): string {
  const merged: Record<string, string> = {};
  for (const [k, v] of Object.entries(cur)) if (v != null && v !== '') merged[k] = String(v);
  for (const [k, v] of Object.entries(patch)) {
    if (v == null || v === '') delete merged[k];
    else merged[k] = String(v);
  }
  const qs = new URLSearchParams(merged).toString();
  return qs ? `${CHAT_BASE_PATH}?${qs}` : CHAT_BASE_PATH;
}

/** 현재 목록의 이전/다음 페이지 링크(끝이면 null). p=0은 파라미터 자체를 뺀다. */
export function pagerHrefs(
  cur: ChatSearchParams,
  page: number,
  hasMore: boolean,
): { prevHref: string | null; nextHref: string | null } {
  return {
    prevHref: page > 0 ? chatHref(cur, { p: page === 1 ? null : page - 1 }) : null,
    nextHref: hasMore ? chatHref(cur, { p: page + 1 }) : null,
  };
}

/** 채팅 금지 진행 중 여부 — chat_muted_until은 과거 값이 남아 있어 만료 비교가 필요하다. */
export function isMuted(until: Date | null | undefined): boolean {
  return !!until && until.getTime() > Date.now();
}

/** KST 표기(CLAUDE §3.8) — DB는 UTC timestamptz, 변환은 표시 직전에만. */
export function fmtKst(d: Date | null): string {
  if (!d) return '-';
  return new Date(d).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour12: false,
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
