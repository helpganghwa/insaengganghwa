import { afterAll, describe, expect, it } from 'vitest';

import { correctServerFor, hasCharacterOn, loadUserServers } from '@/lib/game/server-guard';
import { FriendError, sendRequest } from '@/lib/game/friends';
import { GuildError } from '@/lib/game/guild/errors';
import { joinGuild } from '@/lib/game/guild/join';
import { requestOrJoinGuild } from '@/lib/game/guild/join-requests';

import { endTestDb, sql, testDb } from '../db';

/**
 * 활성 서버 관문(2026-09-21 ②③④) — 쿠키가 내 캐릭터가 없는 서버를 가리킬 때 쓰기를 막는다.
 * 스테이징에는 1서버만 있으므로, "없는 서버"는 실재하지 않는 id(9999)로 대신한다.
 * 길드 테스트만 임시 행을 만들고 finally에서 반드시 지운다.
 */
const USER = process.env.TEST_USER_ID ?? '';
const SERVER_ID = 1;
const ABSENT_SERVER = 9999; // 어떤 캐릭터도 없는 서버

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return null;
  } catch (e) {
    if (e instanceof GuildError || e instanceof FriendError) return e.code;
    return `THROWN:${String(e)}`;
  }
};

describe.skipIf(!USER)('크로스서버 관문', () => {
  afterAll(endTestDb);

  it('내 캐릭터가 있는 서버만 통과한다', async () => {
    expect(await hasCharacterOn(USER, SERVER_ID)).toBe(true);
    expect(await hasCharacterOn(USER, ABSENT_SERVER)).toBe(false);
  });

  it('캐릭터가 있는 서버는 교정하지 않고, 없는 서버는 돌아갈 곳을 알려준다', async () => {
    const { ids, preferred } = await loadUserServers(USER);
    expect(ids).toContain(SERVER_ID);
    expect(preferred).not.toBeNull();
    // 정상 — 교정 불필요.
    expect(await correctServerFor(USER, SERVER_ID)).toBeNull();
    // 없는 서버 — 캐릭터가 있는 서버로 되돌린다(여기서 null이면 레이아웃이 캐릭터를 새로 만든다).
    expect(await correctServerFor(USER, ABSENT_SERVER)).toBe(preferred);
  });

  it('캐릭터가 아예 없는 계정은 교정 대상이 아니다 — 그 서버에 만드는 것이 맞다', async () => {
    const [row] = (await testDb.execute(sql`
      select p.id::text as id from profiles p
       where p.withdrawn_at is null
         and not exists (select 1 from characters c where c.user_id = p.id)
       limit 1
    `)) as unknown as { id: string }[];
    if (!row) return; // 반쪽 계정이 없는 환경 — 확인할 것이 없다
    expect(await correctServerFor(row.id, SERVER_ID)).toBeNull();
  });

  it('친구 요청 — 내 캐릭터가 없는 서버에서는 보낼 수 없다', async () => {
    const [other] = (await testDb.execute(sql`
      select user_id::text as id from characters
       where server_id = ${SERVER_ID} and user_id <> ${USER}::uuid limit 1
    `)) as unknown as { id: string }[];
    if (!other) return;
    // 발신자 가드 — 종전에는 대상만 확인해 유령 요청이 통과했다.
    expect(await code(sendRequest(USER, ABSENT_SERVER, other.id))).toBe('NO_CHARACTER_ON_SERVER');
  });

  it('길드 — 다른 서버 길드에는 가입도 신청도 할 수 없다', async () => {
    const name = `관문테스트${Date.now() % 1000000}`;
    // 이전 실행이 중간에 죽어 남긴 잔여부터 치운다(공유 스테이징 DB — 로그인 화면에 칩으로 보인다).
    await testDb.execute(sql`delete from guilds where server_id = ${ABSENT_SERVER}`);
    await testDb.execute(sql`delete from servers where id = ${ABSENT_SERVER}`);
    // guilds.server_id는 servers FK라 임시 서버 행이 필요하다. status='closed'로 넣어
    // 크론 순회(openServerIds = open+full)에 걸리지 않게 하고, finally에서 지운다.
    await testDb.execute(sql`
      insert into servers (id, name, status) values (${ABSENT_SERVER}, '관문테스트서버', 'closed')
      on conflict (id) do nothing
    `);
    const [g] = (await testDb.execute(sql`
      insert into guilds (name, leader_user_id, server_id, join_policy)
      values (${name}, ${USER}::uuid, ${ABSENT_SERVER}, 'open')
      returning id::text as id
    `)) as unknown as { id: string }[];
    const gid = BigInt(g!.id);
    try {
      // 자유가입 길드 — 즉시 가입 경로.
      expect(await code(joinGuild({ userId: USER, guildId: gid }))).toBe('NO_CHARACTER_ON_SERVER');
      expect(await code(requestOrJoinGuild({ userId: USER, guildId: gid }))).toBe(
        'NO_CHARACTER_ON_SERVER',
      );
      // 승인제로 바꿔 신청 경로도 막히는지 — 두 분기 모두 assertJoinable을 탄다.
      await testDb.execute(sql`update guilds set join_policy = 'approval' where id = ${gid}`);
      expect(await code(requestOrJoinGuild({ userId: USER, guildId: gid }))).toBe(
        'NO_CHARACTER_ON_SERVER',
      );
      // 막혔으니 멤버·신청 행이 남지 않아야 한다.
      const left = (await testDb.execute(sql`
        select 1 from guild_members where guild_id = ${gid}
        union all select 1 from guild_join_requests where guild_id = ${gid}
      `)) as unknown as unknown[];
      expect(left.length).toBe(0);
    } finally {
      await testDb.execute(sql`delete from guild_members where guild_id = ${gid}`);
      await testDb.execute(sql`delete from guild_join_requests where guild_id = ${gid}`);
      await testDb.execute(sql`delete from guilds where id = ${gid}`);
      await testDb.execute(sql`delete from servers where id = ${ABSENT_SERVER}`);
    }
  });
});
