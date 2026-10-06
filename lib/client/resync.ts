/**
 * 결과를 모르는 채 끝난 요청(응답 유실·서버 오류) 뒤 화면을 서버 값으로 다시 맞춘다 — 서버에서는 이미 처리됐을 수 있다.
 *
 * 연결이 실제로 닿는지 먼저 확인한 뒤에만 실행한다. 끊긴 채로 router.refresh()를 부르면 Next가 전체 새로고침으로
 * 넘어가 게임 화면 대신 오프라인 안내 화면이 뜬다. 기기가 '온라인'이라고 해도 신호가 죽어 있는 경우가 흔해
 * (응답이 끊기는 가장 흔한 원인) navigator.onLine만으로는 부족하다 — 가벼운 요청(/api/health) 하나로 확인한다.
 * 닿지 않으면 연결이 돌아왔을 법한 때(online 이벤트·화면 복귀)에 다시 본다.
 *
 * key가 같은 요청은 하나로 합친다(실패가 여러 번 쌓여도 한 번만 다시 맞춘다).
 */
const waiting = new Map<string, () => void>();
let probing = false;
let armed = false;

async function reachable(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  try {
    const r = await fetch('/api/health', { cache: 'no-store' });
    return r.ok;
  } catch {
    return false;
  }
}

function armRetry(): void {
  if (armed) return;
  armed = true;
  const again = () => {
    armed = false;
    window.removeEventListener('online', again);
    document.removeEventListener('visibilitychange', onVisible);
    void flush();
  };
  // 연결 복귀 신호는 화면이 가려져 있어도 받는다. 화면 복귀는 '보이게 됐을 때'만(가려질 때의 이벤트는 흘려보낸다).
  const onVisible = () => {
    if (document.visibilityState === 'visible') again();
  };
  window.addEventListener('online', again);
  document.addEventListener('visibilitychange', onVisible);
}

async function flush(): Promise<void> {
  if (probing || waiting.size === 0) return;
  probing = true;
  const ok = await reachable();
  probing = false;
  if (!ok) return armRetry();
  const run = [...waiting.values()];
  waiting.clear();
  for (const f of run) f();
}

export function resyncWhenOnline(key: string, resync: () => void): void {
  if (typeof window === 'undefined') return;
  waiting.set(key, resync);
  void flush();
}
