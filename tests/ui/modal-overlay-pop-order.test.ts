import { describe, expect, it } from 'vitest';

import { createModalHistory, type HistoryHost } from '@/lib/ui/modal-history';

/**
 * 팝업을 닫으면 화면 이동 로딩 오버레이가 뜨던 버그(2026-09-13, iOS PWA 실기기 제보).
 *
 * popstate 리스너가 둘이다 — `RouteTransitionOverlay`의 판정용과 `modalHistory`의 처리용.
 * 그런데 처리용이 판정용이 읽는 값을 **지운다**(`selfBackAt = 0`, `stack.pop()`). 따라서
 * 처리용이 먼저 돌면 판정용은 이미 소진된 상태를 보고 "화면 이동"으로 잘못 센다.
 *
 * 순서가 뒤집히는 조건은 실제로 존재한다: 오버레이는 (game) 레이아웃에만 있어 /u·/admin 등
 * 다른 라우트 그룹에 다녀오면 언마운트·재마운트되며 리스너를 다시 다는데, modalHistory의
 * 리스너는 모듈 스코프라 그대로 남는다 → 그 뒤로는 영구히 뒤집힌 순서로 돈다.
 */

class FakeBrowser {
  entries: Array<{ href: string; state: unknown }> = [{ href: 'https://g/enhance', state: null }];
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

  userBack(): void {
    this.goBack();
  }

  /** 라우트 이동(Next의 pushState) — 뒤로 갈 화면을 만든다. */
  navigate(href: string): void {
    this.entries = this.entries.slice(0, this.index + 1);
    this.entries.push({ href, state: { __NA: true } });
    this.index += 1;
  }

  private goBack(): void {
    if (this.index === 0) return;
    this.index -= 1;
    const ev = { type: 'popstate' }; // 한 번의 뒤로가기 = 하나의 이벤트 객체(브라우저와 동일)
    for (const h of [...this.handlers]) h(ev);
  }
}

/**
 * @param overlayFirst 오버레이 리스너가 modalHistory보다 먼저 등록됐는가.
 *   true = 앱 첫 진입 그대로. false = 다른 라우트 그룹에 다녀와 오버레이만 다시 단 뒤.
 */
function setup(overlayFirst: boolean) {
  const b = new FakeBrowser();
  const mh = createModalHistory(b.host);
  const shown: string[] = [];
  // RouteTransitionOverlay.onPop과 같은 판정 — isModalPop(ev) = modalHistory.verdictFor(ev).
  const overlayPop = (ev: unknown) => {
    if (mh.verdictFor(ev)) return;
    shown.push('overlay');
  };

  if (overlayFirst) b.host.onPop(overlayPop);
  const handle = mh.open(() => {}); // 모달 열기 — modalHistory가 여기서 리스너를 단다
  if (!overlayFirst) b.host.onPop(overlayPop);

  return { b, mh, handle, shown };
}

describe('팝업 닫기 → 로딩 오버레이 오작동 (리스너 순서 의존)', () => {
  it('오버레이가 먼저 등록된 경우: X 버튼으로 닫아도 안 뜬다', () => {
    const { handle, shown } = setup(true);
    handle.release();
    expect(shown).toEqual([]);
  });

  it('오버레이가 먼저 등록된 경우: 뒤로가기/스와이프로 닫아도 안 뜬다', () => {
    const { b, shown } = setup(true);
    b.userBack();
    expect(shown).toEqual([]);
  });

  it('순서가 뒤집혀도: X 버튼으로 닫을 때 안 뜬다 — 표식을 지우기 전에 판정이 굳는다', () => {
    const { handle, shown } = setup(false);
    handle.release();
    expect(shown).toEqual([]);
  });

  it('순서가 뒤집혀도: 뒤로가기/스와이프로 닫을 때 안 뜬다 — 스택을 비우기 전에 판정이 굳는다', () => {
    const { b, shown } = setup(false);
    b.userBack();
    expect(shown).toEqual([]);
  });

  // 반대 방향 회귀 — 고치면서 **진짜 화면 이동의 로딩까지 삼키면** 안 된다.
  it.each([true, false])('모달이 없을 때의 뒤로가기는 순서와 무관하게 화면 이동으로 센다 (overlayFirst=%s)', (overlayFirst) => {
    const { b, handle, shown } = setup(overlayFirst);
    handle.release(); // 모달을 닫아 둔다 — 이 시점의 오버레이는 뜨지 않아야 한다
    expect(shown).toEqual([]);
    b.navigate('https://g/raid'); // 다른 화면으로 이동
    b.userBack(); // 사용자가 이전 화면으로 나간다 — 이건 진짜 화면 이동이다
    expect(shown).toEqual(['overlay']);
  });
});
