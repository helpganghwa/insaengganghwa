/**
 * 의도된 best-effort 실패를 **흔적은 남기고** 삼키는 헬퍼(코드 품질 조사 10-12: `.catch(() => {})` 153곳은 실패가 로그조차 안 남았다).
 * 같은 라벨은 1분에 한 번만 warn한다(핑·폴링처럼 반복되는 경로에서 로그 폭주 방지). 서버·클라 공용(순수 모듈).
 *
 *   void fetch(...).catch(swallow('presence.ping'));
 */
const lastAt = new Map<string, number>();
const WINDOW_MS = 60_000;

export function swallow(label: string): (e: unknown) => void {
  return (e: unknown) => {
    const now = Date.now();
    const prev = lastAt.get(label) ?? 0;
    if (now - prev < WINDOW_MS) return;
    lastAt.set(label, now);
    console.warn(`[swallow] ${label}`, e instanceof Error ? e.message : e);
  };
}

/** 실패하면 흔적을 남기고 대체값을 돌려준다 — `.catch(() => null)` 자리에. */
export function swallowTo<T>(label: string, fallback: T): (e: unknown) => T {
  const log = swallow(label);
  return (e: unknown) => {
    log(e);
    return fallback;
  };
}
