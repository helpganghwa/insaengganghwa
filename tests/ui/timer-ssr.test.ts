import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ConquestCardStatus } from '@/app/(game)/ConquestCardStatus';

/**
 * 타이머 화면의 **서버 렌더 결과**를 고정한다(2026-09-14).
 *
 * 왜 이 테스트가 있는가: 카운트다운을 하이드레이션 안전하게 만드는 흔한 방법은 "마운트 전 null"인데,
 * 그러면 SSR HTML에 숫자가 없어 **JS가 도착할 때까지 빈 자리가 실제로 보인다**(모바일에서 수백 ms~수 초).
 * useLayoutEffect도 이미 그려진 첫 페인트는 되돌리지 못한다. 그래서 서버 시각을 prop(nowIso)으로 받아
 * 초기값으로 쓴다 — SSR에 숫자가 있고, 하이드레이션도 같은 문자열에서 같은 숫자를 만들어 불일치가 없다.
 *
 * 누군가 이 초기값을 다시 null로 되돌리면 여기서 깨진다.
 */
describe('카운트다운 SSR — 폴백이 아니라 실제 남은 시간이 그려진다', () => {
  const base = {
    inProgress: false,
    serverId: 1,
    chronicleDay: null,
    chronicleHeadline: null,
  };

  it('서버 시각 기준 남은 시간이 SSR HTML에 들어간다', () => {
    const html = renderToStaticMarkup(
      createElement(ConquestCardStatus, {
        ...base,
        targetMs: Date.parse('2026-09-14T14:00:00.000Z'), // 목표
        nowIso: '2026-09-14T11:23:00.000Z', // 서버 렌더 시각 → 2시간 37분 남음
      }),
    );
    expect(html).toContain('2시간 37분');
    // 폴백만 남으면(= 초기값이 null이면) 이 문자열이 없다.
    expect(html).not.toBe('다음 점령전까지');
  });

  it('폰 시계와 무관하게 서버 시각을 따른다 — 하이드레이션도 같은 값이 나온다', () => {
    const render = () =>
      renderToStaticMarkup(
        createElement(ConquestCardStatus, {
          ...base,
          targetMs: Date.parse('2026-09-14T14:00:00.000Z'),
          nowIso: '2026-09-14T13:58:30.000Z', // 1분 30초 남음
        }),
      );
    const a = render();
    const b = render(); // 다른 시각에 다시 렌더해도 prop이 같으면 결과가 같아야 한다
    expect(a).toContain('1분 30초');
    expect(a).toBe(b);
  });

  it('깨진 시각이 와도 화면이 죽지 않고 폴백으로 내려간다', () => {
    const html = renderToStaticMarkup(
      createElement(ConquestCardStatus, { ...base, targetMs: Date.now() + 60_000, nowIso: 'not-a-date' }),
    );
    expect(html).toContain('다음 점령전까지');
  });
});
