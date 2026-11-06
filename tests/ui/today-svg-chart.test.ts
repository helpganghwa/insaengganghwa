import { describe, expect, it } from 'vitest';

import { liftColor, niceAxis, smoothPath, tickLabel } from '@/app/(game)/today/svg-chart';

/** /today 손수 SVG 차트(2026-11-06 업데이트 18) — echarts에서 옮겨 온 계산이 종전 그림과 같은 값을 내는지. */
describe('today svg-chart', () => {
  it('값 축 눈금은 echarts nice와 같다(0 포함, splitNumber 5)', () => {
    expect(niceAxis(15.9)).toEqual({ min: 0, max: 18, interval: 3 }); // 종전 실측: 0~18시간, 3 간격
    expect(niceAxis(68.4)).toEqual({ min: 0, max: 70, interval: 10 });
    expect(niceAxis(0)).toEqual({ min: 0, max: 1, interval: 0.2 });
    expect(tickLabel(0.6000000001, 0.2)).toBe('0.6');
    expect(tickLabel(1200, 200)).toBe('1,200');
  });
  it('강조 색은 echarts liftColor(채널 ×1.1 내림)', () => {
    expect(liftColor('#34d399')).toBe('rgb(57,232,168)');
    expect(liftColor('#f87171')).toBe('rgb(255,124,124)');
  });
  it('곡선은 null을 건너 잇고, 점이 하나면 시작점만', () => {
    expect(smoothPath([[0, 0], null, [10, 10]], 0.3)).toBe('M0,0C0,0,10,10,10,10');
    expect(smoothPath([[5, 5]], 0.3)).toBe('M5,5');
    expect(smoothPath([null, null], 0.3)).toBe('');
  });
});
