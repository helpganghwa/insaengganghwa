/**
 * 서버 시계 보정(2026-08-28) — 클라 표시·완료 판정은 서버가 준 timestamp를 클라 Date.now()와 비교하므로
 * 폰 시계가 어긋나면 "100%·강화 가능"이 서버 판정과 달라진다. 페이지가 렌더 시각(ISO)을 내려주면 offset을 잡아
 * serverNow()로 계산한다. 네트워크 지연만큼 offset이 음수로 치우쳐(클라가 서버보다 뒤라고 봄) 안전한 방향.
 */
let offsetMs = 0;
let established = false;

/**
 * 서버 시각을 등록한다. 두 번째부터는 **단조 최대(max)** 로만 갱신한다(2026-09-14).
 *
 * 왜: 등록되는 ISO는 서버 컴포넌트가 렌더 시각으로 내려준 prop인데, 뒤로가기로 캐시된 RSC 페이로드가
 * 복원되면 몇 분 전 값이 그대로 다시 들어온다. 그대로 받으면 offset이 그만큼 과거로 밀려 강화·대난투·
 * 레이드 타이머가 전부 늦어진다. 참 offset(서버−클라)은 상수이고, 전송 지연이든 캐시 staleness든
 * 후보를 **낮추는** 쪽으로만 오염시키므로, 이미 등록된 값보다 낮은 후보는 오염으로 보고 버린다.
 * 폰 시계를 뒤로 돌리면 참 offset이 올라가므로 max로 자연히 따라간다. 앞으로 돌리는 경우(참 offset ↓)만
 * 못 따라가는데, 그건 새로고침(모듈 초기화)으로 풀리고 시계 조작 자체가 드물다.
 */
export function setServerNow(iso: string): void {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return;
  const cand = t - Date.now();
  offsetMs = established ? Math.max(offsetMs, cand) : cand;
  established = true;
}

/** 이 세션에서 서버 시각이 한 번이라도 등록됐는가 — 타이머 초기값을 prop 대신 serverNow()로 잡을지 결정. */
export function isServerClockEstablished(): boolean {
  return established;
}

/** 테스트 전용 — 모듈 상태 초기화. */
export function __resetServerClockForTests(): void {
  offsetMs = 0;
  established = false;
}
export function clockOffsetMs(): number {
  return offsetMs;
}
export function serverNow(): number {
  return Date.now() + offsetMs;
}
