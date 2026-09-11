import { beforeEach, describe, expect, it } from 'vitest';

import {
  consumeModalBack,
  hasOpenModal,
  isModalHistoryState,
  markModalBack,
  MODAL_HISTORY_KEY,
  modalHistoryClosed,
  modalHistoryOpened,
  nextModalToken,
  shouldCloseOnPop,
  shouldRewindOnUnmount,
} from '@/lib/ui/modal-history';

/**
 * 모달 뒤로가기 규칙 회귀 테스트(2026-09-12).
 *
 * 1차 구현은 열린 순서(스택)로 판정하고 언마운트 사유를 구분하지 않아 세 가지가 깨졌다.
 *  (a) 중첩 모달에서 뒤로가기 한 번에 두 개가 같이 닫히고 항목이 하나 남았다
 *  (b) 확인 팝업을 화면 버튼으로 닫으면 뒤에 있던 시트까지 닫혔다
 *  (c) 모달 안 링크로 라우트를 옮기면 방금 떠난 화면으로 튕겨 돌아왔다
 * 아래는 그 셋을 히스토리 모형으로 재현해 막는다.
 */

// openCount는 모듈 전역이라 테스트 간에 샌다 — 매 테스트 앞에서 0으로 되돌린다(0에서 클램프).
beforeEach(() => {
  for (let i = 0; i < 50; i += 1) modalHistoryClosed();
});

/** 브라우저 히스토리 최소 모형 — 항목 스택과 현재 위치만. */
class FakeHistory {
  entries: Array<{ token: string | null }> = [{ token: null }]; // 초기 라우트
  index = 0;

  pushModal(token: string): void {
    this.entries = this.entries.slice(0, this.index + 1);
    this.entries.push({ token });
    this.index += 1;
  }

  /** 라우트 이동(Next의 pushState) — 모달 표식이 없는 항목. */
  pushRoute(): void {
    this.entries = this.entries.slice(0, this.index + 1);
    this.entries.push({ token: null });
    this.index += 1;
  }

  back(): void {
    if (this.index > 0) this.index -= 1;
  }

  get currentToken(): string | null {
    return this.entries[this.index]?.token ?? null;
  }

  /**
   * 현재 위치까지(뒤쪽)에 남아 있는 모달 항목 수.
   *
   * 핵심 불변식: 이 수는 **열려 있는 모달 수와 같아야 한다.** 어긋나면 닫힌 모달의 항목이
   * 히스토리에 남아 뒤로가기 한 번이 아무 일도 없이 삼켜진다(1차 구현의 증상).
   * 앞쪽(forward) 항목은 브라우저에서도 그대로 남으므로 세지 않는다.
   */
  get modalEntriesBehind(): number {
    return this.entries.slice(0, this.index + 1).filter((e) => e.token !== null).length;
  }
}

/** 열려 있는 셸 하나 — 실제 effect가 하는 일만 따라 한다. */
function openShell(h: FakeHistory) {
  const token = nextModalToken();
  h.pushModal(token);
  modalHistoryOpened();
  let closed = false;
  let poppedByBack = false;
  return {
    token,
    get closed() {
      return closed;
    },
    /** popstate 수신 — 닫아야 할 때만 닫는다. */
    onPop() {
      if (!shouldCloseOnPop(h.currentToken, token)) return;
      poppedByBack = true;
      closed = true;
    },
    /** 화면 버튼 등으로 닫힘 → 언마운트 정리. */
    unmount() {
      closed = true;
      modalHistoryClosed();
      if (!shouldRewindOnUnmount({ poppedByBack, currentToken: h.currentToken, myToken: token })) return;
      markModalBack();
      h.back();
      return 'rewound' as const;
    },
  };
}

describe('모달 히스토리 — 뒤로가기 판정', () => {
  it('단일 모달: 뒤로가기로 닫히고 항목이 남지 않는다', () => {
    const h = new FakeHistory();
    const modal = openShell(h);
    expect(h.index).toBe(1);

    h.back();
    modal.onPop();
    expect(modal.closed).toBe(true);

    modal.unmount(); // 이미 소비됐으므로 되돌리지 않는다
    expect(h.index).toBe(0);
  });

  it('단일 모달: 화면 버튼으로 닫으면 쌓아 둔 항목을 걷어낸다', () => {
    const h = new FakeHistory();
    const modal = openShell(h);
    expect(modal.unmount()).toBe('rewound');
    expect(h.index).toBe(0);
    expect(h.modalEntriesBehind).toBe(0);
  });

  it('중첩 모달: 뒤로가기 한 번은 위 팝업만 닫는다', () => {
    const h = new FakeHistory();
    const sheet = openShell(h);
    const confirm = openShell(h);

    h.back();
    // 리스너는 등록 순서대로 — 아래 시트가 먼저 받는다.
    sheet.onPop();
    confirm.onPop();

    expect(confirm.closed).toBe(true);
    expect(sheet.closed).toBe(false); // ← 회귀 지점: 둘 다 닫혔었다
    confirm.unmount();
    expect(h.currentToken).toBe(sheet.token); // 시트 항목은 그대로 살아 있다
    // 남은 모달 항목 1 = 열려 있는 모달 1. 1차 구현은 둘 다 닫고도 항목이 남아 어긋났다.
    expect(h.modalEntriesBehind).toBe(1);
  });

  it('중첩 모달: 위 팝업을 버튼으로 닫아도 아래 시트는 열려 있다', () => {
    const h = new FakeHistory();
    const sheet = openShell(h);
    const confirm = openShell(h);

    confirm.unmount(); // back() → popstate
    sheet.onPop();

    expect(sheet.closed).toBe(false); // ← 회귀 지점: 시트까지 닫혔다
    expect(h.currentToken).toBe(sheet.token);
  });

  it('중첩 모달: 뒤로가기 두 번이면 둘 다 닫히고 라우트는 그대로다', () => {
    const h = new FakeHistory();
    const sheet = openShell(h);
    const confirm = openShell(h);

    h.back();
    sheet.onPop();
    confirm.onPop();
    confirm.unmount();

    h.back();
    sheet.onPop();
    expect(sheet.closed).toBe(true);
    sheet.unmount();
    expect(h.index).toBe(0); // 라우트를 벗어나지 않았다
    expect(h.modalEntriesBehind).toBe(0); // 삼켜지는 뒤로가기가 없다
  });

  it('라우트 이동: 모달 안 링크로 나가면 히스토리를 되돌리지 않는다', () => {
    const h = new FakeHistory();
    const modal = openShell(h);

    h.pushRoute(); // 링크 클릭 → 새 라우트 커밋
    const before = h.index;
    expect(modal.unmount()).toBeUndefined(); // ← 회귀 지점: back()으로 이전 화면에 튕겼다
    expect(h.index).toBe(before); // 새 라우트에 그대로 머문다
  });

  it('라우트 이동 후 뒤로가기는 모달을 열었던 화면으로 돌아간다', () => {
    const h = new FakeHistory();
    const modal = openShell(h);
    h.pushRoute();
    modal.unmount();

    h.back();
    // 묻힌 모달 항목의 주소는 모달을 열었던 그 화면이다 — 사용자가 기대하는 목적지.
    expect(h.currentToken).toBe(modal.token);
  });
});

describe('모달 히스토리 — 화면 이동 오버레이 구분', () => {
  it('모달 표식이 실린 pushState는 화면 이동이 아니다', () => {
    expect(isModalHistoryState({ [MODAL_HISTORY_KEY]: 'abc-1' })).toBe(true);
    expect(isModalHistoryState({ tree: [], key: 'x' })).toBe(false);
    expect(isModalHistoryState(null)).toBe(false);
    expect(isModalHistoryState(undefined)).toBe(false);
    // 값이 문자열이 아니면 우리 표식이 아니다(구버전 항목 `{igModal:true}` 포함).
    expect(isModalHistoryState({ [MODAL_HISTORY_KEY]: true })).toBe(false);
  });

  it('셸이 스스로 되돌린 back은 한 번만 소비된다', () => {
    markModalBack();
    expect(consumeModalBack()).toBe(true);
    expect(consumeModalBack()).toBe(false); // 이후의 진짜 이동을 삼키지 않는다
  });

  it('열린 모달 수로 뒤로가기가 모달 닫기임을 안다', () => {
    expect(hasOpenModal()).toBe(false);
    modalHistoryOpened();
    expect(hasOpenModal()).toBe(true);
    modalHistoryClosed();
    expect(hasOpenModal()).toBe(false);
    modalHistoryClosed(); // 음수로 내려가지 않는다
    expect(hasOpenModal()).toBe(false);
  });

  it('토큰은 셸마다 다르다', () => {
    const a = nextModalToken();
    const b = nextModalToken();
    expect(a).not.toBe(b);
  });
});
