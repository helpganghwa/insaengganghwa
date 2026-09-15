import { describe, expect, it } from 'vitest';

import { canMove, move, sameOrder } from '@/app/(game)/me/profiles/reorder-plan';

/** 아바타 순서 편집 계획(2026-09-15) — 네 방향 이동·경계·변경 없음 판정. */
const L = ['a', 'b', 'c', 'd'] as const;

describe('move', () => {
  it('앞으로/뒤로는 이웃과 자리를 바꾼다', () => {
    expect(move(L, 'c', 'prev')).toEqual(['a', 'c', 'b', 'd']);
    expect(move(L, 'b', 'next')).toEqual(['a', 'c', 'b', 'd']);
  });
  it('맨 앞으로/맨 뒤로는 끝으로 가고 나머지는 순서를 지킨다', () => {
    expect(move(L, 'c', 'first')).toEqual(['c', 'a', 'b', 'd']);
    expect(move(L, 'b', 'last')).toEqual(['a', 'c', 'd', 'b']);
  });
  it('이미 끝이거나 모르는 id면 입력 배열을 그대로 돌려준다(참조 동일)', () => {
    expect(move(L, 'a', 'prev')).toBe(L);
    expect(move(L, 'a', 'first')).toBe(L);
    expect(move(L, 'd', 'next')).toBe(L);
    expect(move(L, 'd', 'last')).toBe(L);
    expect(move(L, 'zz', 'first')).toBe(L);
  });
  it('입력 배열을 바꾸지 않는다', () => {
    const src = ['a', 'b', 'c'];
    move(src, 'c', 'first');
    expect(src).toEqual(['a', 'b', 'c']);
  });
});

describe('canMove', () => {
  it('맨 앞은 앞으로·맨 앞으로 불가, 맨 뒤는 뒤로·맨 뒤로 불가', () => {
    expect(canMove(L, 'a', 'prev')).toBe(false);
    expect(canMove(L, 'a', 'first')).toBe(false);
    expect(canMove(L, 'a', 'next')).toBe(true);
    expect(canMove(L, 'd', 'last')).toBe(false);
    expect(canMove(L, 'd', 'prev')).toBe(true);
    expect(canMove(['solo'], 'solo', 'first')).toBe(false);
  });
});

describe('sameOrder', () => {
  it('길이와 위치가 전부 같아야 true', () => {
    expect(sameOrder(L, ['a', 'b', 'c', 'd'])).toBe(true);
    expect(sameOrder(L, ['a', 'c', 'b', 'd'])).toBe(false);
    expect(sameOrder(L, ['a', 'b', 'c'])).toBe(false);
  });
});
