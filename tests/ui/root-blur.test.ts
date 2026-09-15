import { beforeEach, describe, expect, it } from 'vitest';

import { ROOT_BLUR_CLASS, acquireRootBlur, rootBlurHolders } from '@/lib/ui/root-blur';

/** 팝업 뒤 흐림 참조 카운트(2026-09-14) — 중첩 팝업에서 마지막 하나가 닫힐 때만 클래스가 내려간다. */
const classes = new Set<string>();
beforeEach(() => {
  classes.clear();
  (globalThis as { document?: unknown }).document = {
    documentElement: { classList: { add: (c: string) => classes.add(c), remove: (c: string) => classes.delete(c) } },
  };
});

describe('acquireRootBlur', () => {
  it('첫 팝업이 켜고 마지막 팝업이 끈다', () => {
    const a = acquireRootBlur();
    expect(classes.has(ROOT_BLUR_CLASS)).toBe(true);
    const b = acquireRootBlur();
    a();
    expect(classes.has(ROOT_BLUR_CLASS)).toBe(true); // b가 아직 열려 있음
    b();
    expect(classes.has(ROOT_BLUR_CLASS)).toBe(false);
    expect(rootBlurHolders()).toBe(0);
  });
  it('해제는 멱등 — 두 번 불러도 카운트가 음수로 가지 않는다', () => {
    const a = acquireRootBlur();
    a();
    a();
    expect(rootBlurHolders()).toBe(0);
    const b = acquireRootBlur();
    expect(classes.has(ROOT_BLUR_CLASS)).toBe(true);
    b();
  });
});
