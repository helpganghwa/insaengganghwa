import { describe, it, expect, beforeEach } from 'vitest';

/**
 * history.pushState 후킹 회귀 — 되돌리는 패치가 Next의 패치를 파괴하던 실서버 버그.
 *
 * 실제 증상: (game) 레이아웃에만 있는 RouteTransitionOverlay가 /admin·/u 등 다른 라우트
 * 그룹으로 나갈 때 언마운트되며 cleanup에서 '원본'을 복원했는데, 그 원본이 Next 패치 이전의
 * 네이티브 함수라 Next의 동기화 래퍼가 사라졌다 → useSearchParams가 멈춰 대난투 탭이
 * 눌러도 안 바뀜(앱 재시작해야 복구).
 *
 * 여기서는 브라우저 없이 그 체인을 그대로 재현해 두 방식의 결과를 대조한다.
 */
type PushFn = (data: unknown, unused: string, url?: string) => void;

function makeHistory() {
  const calls: string[] = [];
  const native: PushFn = (_d, _u, url) => {
    calls.push(`native:${url}`);
  };
  return { h: { pushState: native } as { pushState: PushFn }, calls };
}

/** Next처럼 감싸기 — 라우터 동기화 표식을 남긴다. */
function nextPatch(h: { pushState: PushFn }, calls: string[]) {
  const orig = h.pushState.bind(h);
  h.pushState = (d, u, url) => {
    calls.push('next-sync');
    orig(d, u, url);
  };
}

describe('history 후킹 — 복원형 vs 1회 설치형', () => {
  let hist: ReturnType<typeof makeHistory>;
  beforeEach(() => {
    hist = makeHistory();
  });

  it('복원형(구버전): 언마운트 후 Next 동기화가 사라진다', () => {
    const { h, calls } = hist;
    // 자식(오버레이) effect가 먼저 → 네이티브를 캡처해 감쌈
    const origPush = h.pushState.bind(h);
    h.pushState = (d, u, url) => {
      calls.push('overlay');
      origPush(d, u, url);
    };
    // 부모(Next AppRouter) effect가 나중 → 오버레이 래퍼를 감쌈
    nextPatch(h, calls);

    h.pushState(null, '', '/melee?tab=log');
    expect(calls).toEqual(['next-sync', 'overlay', 'native:/melee?tab=log']);

    // 다른 라우트 그룹으로 이동 → 오버레이 cleanup이 '원본'(네이티브)을 복원
    calls.length = 0;
    h.pushState = origPush;

    h.pushState(null, '', '/melee?tab=mine');
    // Next 동기화가 사라져 주소만 바뀐다 — 이것이 탭이 안 먹던 원인
    expect(calls).toEqual(['native:/melee?tab=mine']);
    expect(calls).not.toContain('next-sync');
  });

  it('1회 설치형(현재): 언마운트해도 Next 동기화가 유지된다', () => {
    const { h, calls } = hist;
    let onNav: (() => void) | null = null;

    // 모듈 스코프 1회 설치 — 이후 절대 되돌리지 않는다
    const origPush = h.pushState.bind(h);
    h.pushState = (d, u, url) => {
      onNav?.();
      origPush(d, u, url);
    };
    nextPatch(h, calls);

    onNav = () => calls.push('overlay');
    h.pushState(null, '', '/melee?tab=log');
    expect(calls).toEqual(['next-sync', 'overlay', 'native:/melee?tab=log']);

    // 언마운트 — 콜백만 해제하고 후크는 남긴다
    calls.length = 0;
    onNav = null;

    h.pushState(null, '', '/melee?tab=mine');
    // 오버레이 표시만 빠지고 Next 동기화는 살아 있다
    expect(calls).toEqual(['next-sync', 'native:/melee?tab=mine']);
  });
});
