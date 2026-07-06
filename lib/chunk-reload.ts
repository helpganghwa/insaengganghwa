/**
 * 청크 로드 실패 자동 복구 — 배포 직후 "Failed to load chunk"류 에러의 공통 처방.
 *
 * 주원인 두 가지 모두 전체 리로드로 해소된다:
 *  1. 배포 스큐 — 열려 있던 탭(구 런타임)이 새 배포의 청크 그래프를 요청.
 *  2. 전환 창 캐시 오염 — 배포 전파 중 실패 응답이 기기에 캐시됨. 리로드로 새 HTML이
 *     새 청크 URL(해시·dpl 변경)을 참조하면 오염 엔트리를 우회한다.
 *
 * 유저에게는 "일시적 오류 + 수동 새로고침" 대신 무감각한 자동 회복이 된다.
 */

const RELOAD_COOLDOWN_MS = 60_000;
const KEY = 'ig:chunk-reload-at';

export function isChunkLoadError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? '');
  return /Failed to load chunk|ChunkLoadError|Loading chunk .* failed|Importing a module script failed|error loading dynamically imported module/i.test(
    msg,
  );
}

/**
 * 청크 로드 에러면 쿨다운(60s) 내 1회 전체 리로드. 리로드를 시작했으면 true.
 * sessionStorage 불가 환경(일부 인앱 브라우저 프라이빗 모드)은 루프 방지가 불가능하므로
 * 자동 리로드 없이 수동 복구 UI로 폴백한다.
 */
export function tryReloadOnChunkError(error: unknown): boolean {
  if (typeof window === 'undefined' || !isChunkLoadError(error)) return false;
  try {
    const last = Number(window.sessionStorage.getItem(KEY) ?? 0);
    if (Date.now() - last < RELOAD_COOLDOWN_MS) return false;
    window.sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}
