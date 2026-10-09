import { describe, expect, it } from 'vitest';

import { worldBossDigestLines } from '@/lib/game/world-boss/chronicle-facts';

const boss = (zone: string, stage = 3) => ({ zone, name: '잿불의 불사조', stage, lootDiamond: stage * 100, lootBoxes: stage * 6 });

describe('연대기 월드보스 줄', () => {
  it('보스가 머무는 구역이 점령되면 전리품째 넘어감, 지키면 계속 쥠 — 보스 없는 구역은 줄이 없다', () => {
    const lines = worldBossDigestLines(
      [{ zone: '왕성', winner: '로제', from: 'Winners' }, { zone: '재의 길목', winner: 'Winners', from: '로제' }],
      [{ zone: '전쟁 토템', owner: 'Winners' }, { zone: '용의 해골', owner: '로제' }],
      [boss('왕성'), boss('전쟁 토템', 0)],
    );
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('「왕성」');
    expect(lines[0]).toContain('3단계 · 쌓인 전리품 💎300 📦18');
    expect(lines[0]).toContain('「로제」 금고로');
    expect(lines[0]).toContain('이전 주인 「Winners」');
    expect(lines[1]).toContain('「전쟁 토템」');
    expect(lines[1]).toContain('아직 0단계');
    expect(lines[1]).toContain('지켜 내');
  });
  it('보스가 없으면 빈 목록, 중립 첫 점령은 이전 주인을 적지 않는다', () => {
    expect(worldBossDigestLines([{ zone: 'a', winner: 'g', from: null }], [], [])).toEqual([]);
    const [l] = worldBossDigestLines([{ zone: 'a', winner: 'g', from: null }], [], [boss('a')]);
    expect(l).not.toContain('이전 주인');
  });
});
