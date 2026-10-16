import { describe, expect, it } from 'vitest';

import { createModalHistory, type HistoryHost } from '@/lib/ui/modal-history';

/**
 * 한 번에 여러 팝업을 닫을 때 히스토리 항목이 남던 버그(2026-10-16, 길드 등급 변경 사용자 제보).
 * 시트(아래) + 확인 팝업(위)을 확정으로 함께 닫으면, 아래 시트는 "위에 남이 있다"며 되돌리지 않고 위 팝업은 한 칸만
 * 되돌려 시트 항목이 남았다 — 변경을 n번 하면 뒤로가기가 n번 삼켜졌다.
 */
class FakeBrowser {
  entries: Array<{ href: string; state: unknown }> = [{ href: 'https://g/guild', state: null }];
  index = 0;
  private handlers: Array<(ev: unknown) => void> = [];
  readonly host: HistoryHost = {
    href: () => this.entries[this.index]!.href,
    pushState: (state) => {
      this.entries = this.entries.slice(0, this.index + 1);
      this.entries.push({ href: this.entries[this.index]!.href, state });
      this.index += 1;
    },
    back: (n = 1) => this.goBack(n),
    onPop: (h) => {
      this.handlers.push(h);
    },
  };
  userBack(): void {
    this.goBack(1);
  }
  navigate(href: string): void {
    this.entries = this.entries.slice(0, this.index + 1);
    this.entries.push({ href, state: { __NA: true } });
    this.index += 1;
  }
  private goBack(n: number): void {
    if (this.index === 0) return;
    this.index = Math.max(0, this.index - n);
    const ev = { type: 'popstate' };
    for (const h of [...this.handlers]) h(ev);
  }
}

describe('모달 history — 여러 팝업을 한 번에 닫기', () => {
  it('시트 + 확인 팝업을 확정으로 함께 닫으면(아래부터 정리) 두 칸 모두 되돌아온다, 여러 번 해도 쌓이지 않는다', () => {
    const b = new FakeBrowser();
    const mh = createModalHistory(b.host);
    b.navigate('https://g/guild/members'); // index 1 = 길드원 화면
    for (let round = 0; round < 3; round++) {
      let sheetOpen = true;
      let confirmOpen = true;
      const sheet = mh.open(() => (sheetOpen = false));
      const confirm = mh.open(() => (confirmOpen = false));
      expect(b.index).toBe(3);
      // React 커밋: 형제 순서대로 정리 — 시트(아래)가 먼저, 확인 팝업(위)이 나중.
      sheet.release();
      confirm.release();
      expect(b.index).toBe(1);
      expect(mh.depth()).toBe(0);
      expect(sheetOpen && confirmOpen).toBe(true); // 버튼으로 닫은 것 — close 콜백은 호출되지 않는다
    }
    b.userBack();
    expect(b.index).toBe(0); // 뒤로가기 한 번에 길드 홈으로 — 삼켜지는 항목이 없다
  });

  it('정리 순서가 반대(위부터)여도 같다', () => {
    const b = new FakeBrowser();
    const mh = createModalHistory(b.host);
    b.navigate('https://g/guild/members');
    const sheet = mh.open(() => {});
    const confirm = mh.open(() => {});
    confirm.release();
    sheet.release();
    expect(b.index).toBe(1);
    expect(mh.depth()).toBe(0);
  });

  it('아래 시트만 먼저 떠나고 위 팝업을 뒤로가기로 닫으면, 그 뒤로가기가 시트 항목까지 정리한다', () => {
    const b = new FakeBrowser();
    const mh = createModalHistory(b.host);
    b.navigate('https://g/guild/members');
    let confirmOpen = true;
    const sheet = mh.open(() => {});
    mh.open(() => (confirmOpen = false));
    sheet.release(); // 덮인 채 떠남 — 되돌리지 못하고 세어 둔다
    expect(b.index).toBe(3);
    b.userBack(); // 확인 팝업 닫힘 + 시트 항목 한 칸 더
    expect(confirmOpen).toBe(false);
    expect(b.index).toBe(1);
    expect(mh.depth()).toBe(0);
  });

  it('라우트가 바뀐 뒤의 정리는 되돌리지 않는다(덮인 항목 수도 버린다)', () => {
    const b = new FakeBrowser();
    const mh = createModalHistory(b.host);
    b.navigate('https://g/guild/members');
    const sheet = mh.open(() => {});
    const confirm = mh.open(() => {});
    b.navigate('https://g/profile'); // 팝업 안 링크로 이동
    sheet.release();
    confirm.release();
    expect(b.entries[b.index]!.href).toBe('https://g/profile');
    // 다음 팝업은 정상 한 칸.
    const next = mh.open(() => {});
    const at = b.index;
    next.release();
    expect(b.index).toBe(at - 1);
  });
});
