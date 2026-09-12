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
  onPop(handler: () => void): void;
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

  const selfBackPending = () => selfBackAt !== 0 && Date.now() - selfBackAt < SELF_BACK_TTL_MS;

  function install(): void {
    if (installed) return;
    installed = true;
    // 리스너는 **모듈에 하나만** 둔다. 셸마다 달면 하나의 popstate에 전부 반응해, 어느 셸이
    // 닫혀야 하는지를 리스너 등록 순서로 추측하게 된다(중첩 모달이 같이 닫히던 원인).
    host.onPop(() => {
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
    window.addEventListener('popstate', handler);
  },
};

export const modalHistory = createModalHistory(browserHost);

/** 오버레이용 — 지금 뒤로가기가 모달을 닫는 중인가(화면 이동이 아닌가). */
export function isModalPop(): boolean {
  return modalHistory.isSelfBack() || modalHistory.hasOpen();
}
