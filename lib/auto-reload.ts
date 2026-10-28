// 새 배포 자동 새로고침의 공통 규칙 — VersionUpdateToast(dpl 변경 감지)와 SpritePreloader(옛 배포의
// atlas 404 감지)가 같은 쿨다운·플래그를 쓴다. 브라우저당 10분에 1회만 새로고침(롤링 배포 중 dpl
// 핑퐁·반복 404로 무한 새로고침 방지), 새로고침 뒤엔 sessionStorage 플래그로 안내 토스트 1회.
// 순수 모듈 — 'use client' 없이 클라이언트 컴포넌트에서 import, 테스트는 deps 주입.
export const RELOAD_TS_KEY = 'ig:last-auto-reload';
export const UPDATED_FLAG_KEY = 'ig:auto-updated';
export const RELOAD_COOLDOWN_MS = 10 * 60_000;

type Store = Pick<Storage, 'getItem' | 'setItem'>;

export interface AutoReloadDeps {
  now?: () => number;
  local?: Store;
  session?: Store;
  reload?: () => void;
}

/**
 * 쿨다운이 지났으면 시각·플래그를 남기고 새로고침한다. 새로고침을 시작했으면 true, 쿨다운 안이라
 * 건너뛰었으면 false. 저장소 접근이 throw하면(비공개 모드 등) 쿨다운을 알 수 없으므로 새로고침하지
 * 않는다 — 무한 새로고침 쪽이 더 나쁘다.
 */
export function autoReloadOnce(deps: AutoReloadDeps = {}): boolean {
  const now = deps.now ?? Date.now;
  try {
    const local = deps.local ?? window.localStorage;
    const session = deps.session ?? window.sessionStorage;
    const last = Number(local.getItem(RELOAD_TS_KEY) ?? '0');
    if (now() - last < RELOAD_COOLDOWN_MS) return false;
    local.setItem(RELOAD_TS_KEY, String(now()));
    session.setItem(UPDATED_FLAG_KEY, '1');
  } catch {
    return false;
  }
  (deps.reload ?? (() => window.location.reload()))();
  return true;
}
