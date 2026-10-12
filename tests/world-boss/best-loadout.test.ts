import { describe, expect, it } from 'vitest';

import { WORLD_BOSS_AVATAR_BONUS, WORLD_BOSS_WEAK_BONUS } from '@/lib/game/guild/balance';
import { type BestAvatar, type BestPiece, avatarKeysOf, pickBestLoadout } from '@/lib/game/world-boss/best-loadout';

const W = WORLD_BOSS_WEAK_BONUS;
const A = WORLD_BOSS_AVATAR_BONUS;
const piece = (ueid: string, slot: BestPiece['slot'], code: string, cp: number, on = false): BestPiece => ({ ueid, slot, code, cp, on });
const none: BestAvatar = { id: null, keys: null, active: true };

describe('pickBestLoadout — 장비 3개 + 대표 아바타 조합', () => {
  it('아바타가 없으면 부위별 가장 센 장비, 지금 장착과 같으면 바꾸지 않는다', () => {
    const pieces = [piece('1', 'weapon', 'w1', 100, true), piece('2', 'weapon', 'w2', 90), piece('3', 'armor', 'a1', 50, true)];
    const plan = pickBestLoadout(pieces, [none], new Set(), W);
    expect(plan.changed).toBe(false);
    expect(plan.picks.weapon?.ueid).toBe('1');
    expect(plan.power).toBe(150);
  });

  it('약점 장비는 보너스를 더해 약한 장비라도 고른다', () => {
    const pieces = [piece('1', 'weapon', 'w1', 100, true), piece('2', 'weapon', 'w2', 60)];
    const plan = pickBestLoadout(pieces, [none], new Set(['w2']), W);
    expect(plan.changed).toBe(true);
    expect(plan.picks.weapon?.ueid).toBe('2');
    expect(plan.power).toBe(60 * (1 + W));
  });

  it('지금 대표가 아닌 아바타가 더 세면 그 아바타로 바꾼다(아바타 매치 보너스)', () => {
    const pieces = [piece('1', 'weapon', 'w1', 100, true), piece('2', 'weapon', 'w2', 80)];
    const cur: BestAvatar = { id: 'p1', keys: { weapon: 'w9' }, active: true };
    const other: BestAvatar = { id: 'p2', keys: { weapon: 'w2' }, active: false };
    const plan = pickBestLoadout(pieces, [cur, other], new Set(), W);
    expect(plan.avatar.id).toBe('p2');
    expect(plan.picks.weapon?.ueid).toBe('2');
    expect(plan.power).toBe(80 * (1 + A));
    expect(plan.changed).toBe(true);
  });

  it('같은 값이면 지금 대표를 유지한다', () => {
    const pieces = [piece('1', 'weapon', 'w1', 100, true)];
    const cur: BestAvatar = { id: 'p1', keys: { weapon: 'w1' }, active: true };
    const other: BestAvatar = { id: 'p2', keys: { weapon: 'w1' }, active: false };
    const plan = pickBestLoadout(pieces, [other, cur], new Set(), W);
    expect(plan.avatar.id).toBe('p1');
    expect(plan.changed).toBe(false);
  });

  it('약점 장비는 어느 커스텀 아바타든 +아바타 보너스라 기본 아바타보다 커스텀을 고른다', () => {
    const pieces = [piece('1', 'weapon', 'w1', 100, true)];
    const custom: BestAvatar = { id: 'p1', keys: { weapon: 'zzz' }, active: false };
    const plan = pickBestLoadout(pieces, [none, custom], new Set(['w1']), W);
    expect(plan.avatar.id).toBe('p1');
    expect(plan.power).toBe(100 * (1 + A + W));
    expect(plan.changed).toBe(true); // 장착은 그대로지만 대표가 바뀐다
  });

  it('후보가 비면 아바타 없음으로 계산한다', () => {
    const plan = pickBestLoadout([piece('1', 'armor', 'a1', 10)], [], new Set(), W);
    expect(plan.avatar.keys).toBeNull();
    expect(plan.changed).toBe(true); // 장착 안 된 장비를 입는다
  });
});

describe('avatarKeysOf', () => {
  it('weaponKey가 없으면 아바타로 치지 않는다', () => {
    expect(avatarKeysOf({ armorKey: 'a' })).toBeNull();
    expect(avatarKeysOf(null)).toBeNull();
    expect(avatarKeysOf({ weaponKey: 'w', armorKey: 'a', accessoryKey: 3 })).toEqual({ weapon: 'w', armor: 'a' });
  });
});
