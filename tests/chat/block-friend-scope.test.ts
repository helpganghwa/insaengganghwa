import { afterAll, describe, expect, it } from 'vitest';

import { setChatBlock } from '@/lib/game/chat/service';

import { endTestDb, sql, testDb } from '../db';

/**
 * 차단 시 친구 정리 범위(2026-09-21) — 차단은 계정 단위, 친구는 서버 단위.
 * 차단을 누른 서버의 친구만 지워지고 다른 서버의 친구는 남아야 한다.
 * 실재 데이터를 건드리지 않도록 테스트 계정과 아무 관계가 없는 상대를 고르고, 만든 행은 finally에서 지운다.
 */
const USER = process.env.TEST_USER_ID ?? '';
const HERE = 1;
const ELSEWHERE = 9998; // 임시 서버 행(닫힘) — 다른 서버의 친구 관계를 대신한다. 다른 테스트의 9999와 겹치지 않게

describe.skipIf(!USER)('차단 시 친구 정리 범위', () => {
  afterAll(endTestDb);

  it('누른 서버의 친구만 지우고 다른 서버의 친구는 남긴다', async () => {
    const [other] = (await testDb.execute(sql`
      select p.id::text as id from profiles p
       where p.id <> ${USER}::uuid and p.withdrawn_at is null
         and not exists (select 1 from friend_links f
                          where (f.requester_id = p.id and f.addressee_id = ${USER}::uuid)
                             or (f.requester_id = ${USER}::uuid and f.addressee_id = p.id))
         and not exists (select 1 from chat_blocks b
                          where (b.user_id = p.id and b.blocked_user_id = ${USER}::uuid)
                             or (b.user_id = ${USER}::uuid and b.blocked_user_id = p.id))
       limit 1
    `)) as unknown as { id: string }[];
    if (!other) return; // 고를 상대가 없는 환경

    const links = () =>
      testDb.execute(sql`
        select server_id from friend_links
         where requester_id = ${USER}::uuid and addressee_id = ${other.id}::uuid
         order by server_id
      `) as unknown as Promise<{ server_id: number }[]>;

    try {
      // friend_links.server_id는 servers FK — 닫힌 임시 서버를 만들어 쓴다(앞선 실패의 잔여물 먼저 정리).
      await testDb.execute(sql`delete from friend_links where server_id = ${ELSEWHERE}`);
      await testDb.execute(sql`delete from servers where id = ${ELSEWHERE}`);
      await testDb.execute(sql`
        insert into servers (id, name, status) values (${ELSEWHERE}, '차단테스트서버', 'closed')
      `);
      await testDb.execute(sql`
        insert into friend_links (requester_id, addressee_id, server_id, status)
        values (${USER}::uuid, ${other.id}::uuid, ${HERE}, 'accepted'),
               (${USER}::uuid, ${other.id}::uuid, ${ELSEWHERE}, 'accepted')
      `);
      expect((await links()).map((r) => Number(r.server_id))).toEqual([HERE, ELSEWHERE]);

      expect(await setChatBlock(USER, other.id, true, HERE)).toBe('blocked');
      expect((await links()).map((r) => Number(r.server_id))).toEqual([ELSEWHERE]);

      // 차단 해제는 친구를 되살리지 않는다 — 남은 서버의 관계도 그대로다.
      expect(await setChatBlock(USER, other.id, false, HERE)).toBe('unblocked');
      expect((await links()).map((r) => Number(r.server_id))).toEqual([ELSEWHERE]);
    } finally {
      await testDb.execute(sql`
        delete from friend_links
         where requester_id = ${USER}::uuid and addressee_id = ${other.id}::uuid
           and server_id in (${HERE}, ${ELSEWHERE})
      `);
      await testDb.execute(sql`
        delete from chat_blocks where user_id = ${USER}::uuid and blocked_user_id = ${other.id}::uuid
      `);
      await testDb.execute(sql`delete from servers where id = ${ELSEWHERE}`);
    }
  });
});
