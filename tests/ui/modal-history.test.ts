import { beforeEach, describe, expect, it } from 'vitest';

import { createModalHistory, isModalHistoryState, MODAL_HISTORY_KEY, type HistoryHost } from '@/lib/ui/modal-history';

/**
 * 모달 뒤로가기 회귀 테스트.
 *
 * 막아야 하는 것 네 가지 — 앞의 셋은 2026-09-11 1차 구현이 낸 회귀, 넷째는 2026-09-12에
 * 프로덕션 실측으로 드러난 것이다.
 *  (a) 중첩 모달에서 뒤로가기 한 번에 두 개가 같이 닫히고 항목이 하나 남았다
 *  (b) 확인 팝업을 화면 버튼으로 닫으면 뒤에 있던 시트까지 닫혔다
 *  (c) 모달 안 링크로 라우트를 옮기면 방금 떠난 화면으로 튕겨 돌아왔다
 *  (d) **Next가 history.state를 덮어쓰면 위 판정이 전부 무너졌다** — 모달을 연 채 서버 액션이나
 *      router.refresh()가 한 번 돌면 표식이 사라진다. 그래서 판정을 history.state에서 떼어냈고,
 *      이 모형은 그 덮어쓰기를 재현해 같은 일이 다시 생기지 않게 고정한다.
 */

/** 브라우저 히스토리 최소 모형 — 항목 스택·현재 위치·popstate. */
class FakeBrowser {
  entries: Array<{ href: string; state: unknown }> = [{ href: 'https://g/inventory', state: null }];
  index = 0;
  private handlers: Array<(ev: unknown) => void> = [];

  readonly host: HistoryHost = {
    href: () => this.entries[this.index]!.href,
    pushState: (state) => {
      this.entries = this.entries.slice(0, this.index + 1);
      this.entries.push({ href: this.entries[this.index]!.href, state });
      this.index += 1;
    },
    back: () => this.goBack(),
    onPop: (h) => {
      this.handlers.push(h);
    },
  };

  /** 사용자가 기기 뒤로가기를 누른 경우. */
  userBack(): void {
    this.goBack();
  }

  private goBack(): void {
    if (this.index === 0) return;
    this.index -= 1;
    const ev = { type: 'popstate' }; // 한 번의 뒤로가기 = 하나의 이벤트 객체(브라우저와 동일)
    for (const h of [...this.handlers]) h(ev);
  }

  /** 라우트 이동(Next의 pushState). */
  navigate(href: string): void {
    this.entries = this.entries.slice(0, this.index + 1);
    this.entries.push({ href, state: { __NA: true } });
    this.index += 1;
  }

  /**
   * Next의 AppRouter가 라우터 상태 갱신마다 하는 replaceState — 최초 로드 이후에는 커스텀
   * state를 보존하지 않는다. 우리가 심은 표식이 여기서 사라진다(2026-09-12 프로덕션 실측).
   */
  routerRefresh(): void {
    this.entries[this.index] = { href: this.entries[this.index]!.href, state: { __NA: true } };
  }

  /** 현재 위치까지 남아 있는 모달 항목 수 — 열려 있는 모달 수와 같아야 한다. */
  modalEntriesBehind(): number {
    return this.entries.slice(1, this.index + 1).filter((e) => isModalHistoryState(e.state)).length;
  }
}

let b: FakeBrowser;
let mh: ReturnType<typeof createModalHistory>;

beforeEach(() => {
  b = new FakeBrowser();
  mh = createModalHistory(b.host);
});

/** 열린 모달 하나 — 실제 셸이 하는 일만 따라 한다. */
function openShell() {
  let closed = false;
  const handle = mh.open(() => {
    closed = true;
  });
  return {
    get closed() {
      return closed;
    },
    /** 화면 버튼·Esc 등으로 닫힘 → 언마운트 정리. */
    unmount() {
      closed = true;
      handle.release();
    },
    /** 부모 라우트가 바뀌어 페이지째 언마운트. */
    unmountByRoute() {
      handle.release();
    },
  };
}

describe('모달 뒤로가기', () => {
  it('단일 모달: 뒤로가기로 닫히고 항목이 남지 않는다', () => {
    const m = openShell();
    expect(b.index).toBe(1);

    b.userBack();
    expect(m.closed).toBe(true);
    m.unmount(); // 이미 소비됐으므로 되돌리지 않는다
    expect(b.index).toBe(0);
    expect(b.modalEntriesBehind()).toBe(0);
  });

  it('단일 모달: 화면 버튼으로 닫으면 쌓아 둔 항목을 걷어낸다', () => {
    const m = openShell();
    m.unmount();
    expect(b.index).toBe(0);
    expect(b.modalEntriesBehind()).toBe(0);
    expect(mh.depth()).toBe(0);
  });

  it('중첩 모달: 뒤로가기 한 번은 위 팝업만 닫는다', () => {
    const sheet = openShell();
    const confirm = openShell();

    b.userBack();
    expect(confirm.closed).toBe(true);
    expect(sheet.closed).toBe(false); // ← 회귀 지점
    confirm.unmount();
    expect(b.modalEntriesBehind()).toBe(1); // 남은 항목 1 = 열려 있는 모달 1
    expect(mh.depth()).toBe(1);
  });

  it('중첩 모달: 위 팝업을 버튼으로 닫아도 아래 시트는 열려 있다', () => {
    const sheet = openShell();
    const confirm = openShell();

    confirm.unmount(); // 우리가 부른 back()이 popstate를 만든다
    expect(sheet.closed).toBe(false); // ← 회귀 지점
    expect(mh.depth()).toBe(1);
    expect(b.modalEntriesBehind()).toBe(1);
  });

  it('중첩 모달: 뒤로가기 두 번이면 둘 다 닫히고 라우트는 그대로다', () => {
    const sheet = openShell();
    const confirm = openShell();

    b.userBack();
    confirm.unmount();
    b.userBack();
    expect(sheet.closed).toBe(true);
    sheet.unmount();
    expect(b.index).toBe(0);
    expect(b.modalEntriesBehind()).toBe(0);
  });

  it('라우트 이동: 모달 안 링크로 나가면 히스토리를 되돌리지 않는다', () => {
    const m = openShell();
    b.navigate('https://g/challenges');
    const before = b.index;
    m.unmountByRoute();
    expect(b.index).toBe(before); // ← 회귀 지점: 되돌리면 떠난 화면으로 튕긴다
    expect(mh.depth()).toBe(0);
  });

  it('라우트 이동 후 뒤로가기는 모달을 열었던 화면으로 돌아간다', () => {
    const m = openShell();
    b.navigate('https://g/challenges');
    m.unmountByRoute();

    b.userBack();
    expect(b.host.href()).toBe('https://g/inventory');
  });

  describe('Next가 history.state를 덮어써도 (2026-09-12 실측)', () => {
    it('뒤로가기가 여전히 모달만 닫는다', () => {
      const m = openShell();
      b.routerRefresh(); // 모달을 연 채 서버 액션·router.refresh()
      b.userBack();
      expect(m.closed).toBe(true);
      m.unmount();
      expect(b.index).toBe(0);
    });

    it('버튼으로 닫을 때 쌓아 둔 항목이 그대로 걷힌다', () => {
      const m = openShell();
      b.routerRefresh();
      m.unmount();
      expect(b.index).toBe(0); // ← 표식 기반 판정이었다면 여기서 항목이 남아 뒤로가기가 삼켜졌다
      expect(mh.depth()).toBe(0);
    });

    it('중첩 상태에서도 아래 시트가 살아남는다', () => {
      const sheet = openShell();
      const confirm = openShell();
      b.routerRefresh();

      b.userBack();
      expect(confirm.closed).toBe(true);
      expect(sheet.closed).toBe(false); // ← 표식 기반 판정이었다면 둘 다 닫혔다
    });
  });

  it('모달이 열려 있는 동안에는 뒤로가기를 화면 이동으로 세지 않는다', () => {
    expect(mh.hasOpen()).toBe(false);
    const m = openShell();
    expect(mh.hasOpen()).toBe(true);
    m.unmount();
    expect(mh.hasOpen()).toBe(false);
  });

  it('셸이 스스로 되돌리는 동안에는 오버레이가 이동으로 세지 않는다', () => {
    const m = openShell();
    expect(mh.isSelfBack()).toBe(false);
    m.unmount();
    // release가 back()을 부르고 그 popstate가 즉시 소비되므로 표식은 남지 않는다.
    expect(mh.isSelfBack()).toBe(false);
    expect(mh.hasOpen()).toBe(false);
  });
});

describe('오버레이 필터', () => {
  it('모달이 쌓는 항목만 화면 이동에서 제외한다', () => {
    expect(isModalHistoryState({ [MODAL_HISTORY_KEY]: true })).toBe(true);
    expect(isModalHistoryState({ __NA: true, tree: [] })).toBe(false);
    expect(isModalHistoryState(null)).toBe(false);
    expect(isModalHistoryState(undefined)).toBe(false);
  });
});
