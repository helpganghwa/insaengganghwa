/**
 * 모달 뒤로가기 — `ModalShell`이 쓰고 `RouteTransitionOverlay`가 읽는다.
 *
 * 안드로이드 뒤로가기로 모달을 닫으려면 열릴 때 히스토리 항목을 하나 쌓아 둬야 한다. 그런데 그
 * 항목은 **화면 이동이 아니다.** 구분이 없으면 라우트 전환 로딩 오버레이가 모달을 열 때마다 뜨고,
 * 라우트가 바뀌어 모달이 사라진 경우까지 히스토리를 되돌려 방금 떠난 화면으로 튕겨 돌아온다.
 *
 * ⚠ **판정을 history.state에 두면 안 된다**(2026-09-12 실측). Next의 AppRouter는 라우터 상태가
 * 갱신될 때마다 `replaceState`로 현재 항목을 덮어쓰는데, 최초 로드 이후에는 커스텀 state를
 * 보존하지 않는다(`preserveCustomHistoryState`가 false). 모달을 연 채 서버 액션이나
 * `router.refresh()`(복귀 동기화 등)가 한 번만 돌아도 우리가 심은 표식이 사라진다. 프로덕션
 * `/enhance`에서 모달을 연 뒤 복귀 동기화를 일으키자 표식이 즉시 null이 되는 것을 확인했다.
 *
 * 그래서 판정을 **모듈 스코프 스택**으로 옮겼다. 히스토리에 심는 표식은 오버레이가 push 시점에
 * 인자를 그대로 보고 거르는 용도로만 남긴다(그 시점엔 Next가 덮기 전이라 유효하다).
 */

/** 모달이 쌓는 항목임을 push 시점에 알리는 표식 — 오버레이 필터 전용(수명을 신뢰하지 않는다). */
export const MODAL_HISTORY_KEY = 'igModal';

/** pushState 인자로 넘어온 state가 모달 표식인가 — 오버레이가 화면 이동과 구분하는 근거. */
export function isModalHistoryState(state: unknown): boolean {
  if (typeof state !== 'object' || state === null) return false;
  return (state as Record<string, unknown>)[MODAL_HISTORY_KEY] === true;
}

/** 히스토리 조작 대상 — 테스트에서 가짜 창을 넣을 수 있게 분리한다. */
export type HistoryHost = {
  /** 해시를 뺀 현재 주소 — 라우트가 바뀌었는지 판단하는 유일한 근거. */
  href(): string;
  pushState(state: unknown): void;
  back(): void;
  /** popstate 구독 — 핸들러는 **그 이벤트 자체**를 받는다(순서 무관 판정의 근거, `verdictFor`). */
  onPop(handler: (ev: unknown) => void): void;
};

export type ModalHistoryHandle = {
  /** 언마운트 정리 — 닫힌 사유(뒤로가기/버튼/라우트 이동)를 스스로 판별한다. */
  release(): void;
};

type Entry = { close: () => void; href: string; popped: boolean };

/** 되돌리기가 popstate를 못 만든 경우 표식이 영원히 남지 않게 하는 한도. */
const SELF_BACK_TTL_MS = 1000;

export function createModalHistory(host: HistoryHost) {
  const stack: Entry[] = [];
  let selfBackAt = 0;
  let installed = false;
  /**
   * 마지막으로 판정을 내린 popstate와 그 결론 — **리스너 순서 의존을 없애는 장치**(2026-09-13).
   *
   * popstate 리스너는 둘이다: 여기(처리용)와 `RouteTransitionOverlay`(판정용). 그런데 처리용은
   * 판정용이 읽는 값을 **소비한다**(`selfBackAt = 0`, `stack.pop()`). 처리용이 먼저 돌면 판정용은
   * 이미 비워진 상태를 보고 모달 닫기를 '화면 이동'으로 잘못 세어 로딩 오버레이를 띄웠다.
   *
   * 순서는 실제로 뒤집힌다 — 오버레이는 (game) 레이아웃에만 있어 /u·/admin 등 다른 라우트
   * 그룹에 다녀오면 언마운트·재마운트되며 리스너를 다시 다는데, 이 리스너는 모듈 스코프라
   * 그대로 남는다. 그 뒤로는 영구히 뒤집힌 순서로 돈다(iOS PWA 실기기 제보 — 앱 안에서만
   * 프로필·위키를 열어 이 왕복이 잦다. PC는 새 탭으로 열려 재현이 어려웠다).
   *
   * 그래서 판정을 **이벤트에 못박아** 기록한다. 누가 먼저 돌든 같은 popstate면 같은 답이 나온다.
   */
  let lastPopEvent: unknown = null;
  let lastPopWasModal = false;

  const selfBackPending = () => selfBackAt !== 0 && Date.now() - selfBackAt < SELF_BACK_TTL_MS;

  function install(): void {
    if (installed) return;
    installed = true;
    // 리스너는 **모듈에 하나만** 둔다. 셸마다 달면 하나의 popstate에 전부 반응해, 어느 셸이
    // 닫혀야 하는지를 리스너 등록 순서로 추측하게 된다(중첩 모달이 같이 닫히던 원인).
    host.onPop((ev) => {
      // 소비하기 **전에** 판정을 굳힌다 — 판정용 리스너가 뒤에 돌아도 이 답을 그대로 쓴다.
      lastPopEvent = ev ?? null;
      lastPopWasModal = selfBackPending() || stack.length > 0;
      if (selfBackPending()) {
        // 버튼으로 닫으며 우리가 되돌린 것 — 소비만 하고 아무도 닫지 않는다.
        selfBackAt = 0;
        return;
      }
      selfBackAt = 0;
      const top = stack.pop();
      if (!top) return;
      top.popped = true;
      top.close();
    });
  }

  return {
    /** 모달을 열며 항목을 쌓는다. 뒤로가기가 오면 **맨 위 모달만** 닫힌다. */
    open(onClose: () => void): ModalHistoryHandle {
      install();
      const entry: Entry = { close: onClose, href: host.href(), popped: false };
      stack.push(entry);
      host.pushState({ [MODAL_HISTORY_KEY]: true });
      return {
        release() {
          if (entry.popped) return; // 뒤로가기로 이미 소비됐다 — 되돌리면 한 칸 더 간다.
          const i = stack.indexOf(entry);
          if (i >= 0) stack.splice(i, 1);
          // 라우트가 바뀌어 언마운트됐다 — 내 항목은 새 라우트 아래로 묻혔다. 여기서 되돌리면
          // 방금 떠난 화면으로 튕긴다(튜토리얼 완료 CTA·다이아 충전 유도 동선).
          if (host.href() !== entry.href) return;
          // 내 위에 다른 모달이 남아 있다 — 되돌리면 남의 항목을 지운다.
          if (i !== stack.length) return;
          selfBackAt = Date.now();
          host.back();
        },
      };
    },
    /** 열려 있는 모달 수 — 뒤로가기가 모달을 닫는 것인지(화면 이동이 아닌지) 판정한다. */
    hasOpen(): boolean {
      return stack.length > 0;
    },
    /** 셸이 스스로 되돌리는 중인가 — 오버레이가 그 popstate를 화면 이동으로 세지 않게 한다. */
    isSelfBack(): boolean {
      return selfBackPending();
    },
    /**
     * 이 popstate를 모달이 삼켰는가 — **리스너 순서와 무관하게** 같은 답을 준다.
     *
     * 처리용 리스너가 이미 판정한 이벤트면 그 결론을, 아직이면(우리가 먼저 돌았거나 모달을
     * 한 번도 연 적 없어 리스너가 없으면) 현재 상태를 본다.
     */
    verdictFor(ev: unknown): boolean {
      if (ev != null && ev === lastPopEvent) return lastPopWasModal;
      return selfBackPending() || stack.length > 0;
    },
    /** 테스트용 — 스택 깊이. */
    depth(): number {
      return stack.length;
    },
  };
}

export type ModalHistory = ReturnType<typeof createModalHistory>;

const browserHost: HistoryHost = {
  href() {
    if (typeof window === 'undefined') return '';
    const u = new URL(window.location.href);
    u.hash = ''; // 해시는 라우트 변경이 아니다(앱 진입 표식 `#app` 포함).
    return u.toString();
  },
  pushState(state) {
    window.history.pushState(state, '');
  },
  back() {
    window.history.back();
  },
  onPop(handler) {
    window.addEventListener('popstate', (ev) => handler(ev));
  },
};

export const modalHistory = createModalHistory(browserHost);

/**
 * 오버레이용 — 이 뒤로가기가 모달을 닫는 중인가(화면 이동이 아닌가).
 *
 * ⚠ **popstate 이벤트를 반드시 넘긴다.** 안 넘기면 리스너 순서에 따라 답이 달라진다
 * (`verdictFor` 주석 참조 — 2026-09-13 팝업 닫을 때 로딩 오버레이가 뜨던 버그).
 */
export function isModalPop(ev?: unknown): boolean {
  return modalHistory.verdictFor(ev ?? null);
}
