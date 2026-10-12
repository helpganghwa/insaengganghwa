import { afterAll, describe, expect, it } from 'vitest';

import { CLOSED_ONLY, correctServerFor, hasCharacterOn, loadUserServers } from '@/lib/game/server-guard';
import { canEnterServer, countServers, isServerClosedCached } from '@/lib/game/server-select';

import { endTestDb } from '../db';
import { inRollback, tempServer } from '../helpers/rollback';

/**
 * 닫힌 서버 관문(10-12 결정) — 스테이징에는 닫힌 서버가 없으므로 롤백 트랜잭션 안에 임시 서버·캐릭터를 넣어 재현한다.
 * 관문 함수들은 전역 db만 쓰므로 runWithDb 스코프를 탄다(tests/helpers/rollback.ts).
 */
const USER = process.env.TEST_USER_ID ?? '';

describe.skipIf(!USER)('닫힌 서버 — 캐릭터가 있어도 운영 중인 서버로 치지 않는다', () => {
  afterAll(endTestDb);

  it('관문 세 곳이 closed를 거부하고, 운영 중인 서버가 있으면 그리로 되돌린다', async () => {
    await inRollback(async (tx) => {
      await tempServer(tx, 9101, 'closed', USER);
      expect(await hasCharacterOn(USER, 9101)).toBe(false);
      expect(await canEnterServer(USER, 9101)).toBe(false);
      const us = await loadUserServers(USER);
      expect(us.ids).not.toContain(9101);
      expect(us.closedIds).toContain(9101);
      // 테스트 계정은 서버 1에 캐릭터가 있다 → 닫힌 서버 쿠키면 운영 중인 서버(preferred)로 되돌린다.
      expect(us.preferred).not.toBe(9101);
      expect(await correctServerFor(USER, 9101)).toBe(us.preferred);
    });
  });

  it('열린 임시 서버의 캐릭터는 정상 통과한다(대조군)', async () => {
    await inRollback(async (tx) => {
      await tempServer(tx, 9102, 'open', USER);
      expect(await hasCharacterOn(USER, 9102)).toBe(true);
      expect(await canEnterServer(USER, 9102)).toBe(true);
      expect(await correctServerFor(USER, 9102)).toBeNull();
    });
  });

  it('닫힌 서버에만 캐릭터가 있는 계정은 CLOSED_ONLY — 만들지도 되돌리지도 않는다', async () => {
    await inRollback(async (tx) => {
      // 캐릭터가 하나도 없는 임시 계정 대신, 테스트 계정의 운영 중 캐릭터를 트랜잭션 안에서만 치운다(롤백됨).
      await tx.execute((await import('../db')).sql`delete from characters where user_id = ${USER}::uuid`);
      await tempServer(tx, 9103, 'closed', USER);
      const us = await loadUserServers(USER);
      expect(us.ids).toEqual([]);
      expect(us.closedIds).toEqual([9103]);
      expect(await correctServerFor(USER, 1)).toBe(CLOSED_ONLY);
    });
  });

  it('닫힌 서버는 설정 화면의 서버 수에 세지 않고, 액션 관문 캐시는 닫힘을 읽는다', async () => {
    await inRollback(async (tx) => {
      const before = await countServers();
      await tempServer(tx, 9104, 'closed');
      expect(await countServers()).toBe(before);
      expect(await isServerClosedCached(9104)).toBe(true);
      await tempServer(tx, 9105, 'open');
      expect(await countServers()).toBe(before + 1);
      expect(await isServerClosedCached(9105)).toBe(false);
    });
  });
});
