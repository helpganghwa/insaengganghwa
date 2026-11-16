import { afterAll, describe, expect, it } from 'vitest';

import { getTitleBriefsByUsers } from '@/lib/game/friends';
import { getGuildBriefsByUsers } from '@/lib/game/guild';
import { TITLE_BY_CODE } from '@/lib/game/titles/defs';

import { endTestDb, sql, testDb } from '../db';

/** 친구 목록 대표 칭호(11-16) — 스테이징에서 영구형 대표 칭호를 단 사람을 골라 그대로 나오는지, 없는 사람은 null인지 읽기만 한다. */
describe.skipIf(!process.env.TEST_USER_ID)('친구 목록 대표 칭호(DB 읽기)', () => {
  afterAll(async () => {
    await endTestDb();
  });

  it('영구형 대표 칭호는 그대로, 대표가 없으면 null', async () => {
    const rows = (await testDb.execute(sql`
      select user_id::text as uid, representative_title_code as code from characters
       where server_id = 1 and representative_title_code is not null order by user_id limit 200`)) as unknown as { uid: string; code: string }[];
    const perm = rows.find((r) => TITLE_BY_CODE.get(r.code)?.kind === 'permanent');
    const [none] = (await testDb.execute(sql`
      select user_id::text as uid from characters where server_id = 1 and representative_title_code is null limit 1`)) as unknown as { uid: string }[];
    expect(perm, '영구형 대표 칭호를 단 스테이징 캐릭터가 있어야 한다').toBeTruthy();
    const ids = [perm!.uid, none!.uid];
    const guilds = await getGuildBriefsByUsers(ids, 1);
    const m = await getTitleBriefsByUsers(ids, 1, guilds);
    expect(m.get(perm!.uid)?.titleCode).toBe(perm!.code);
    expect(m.get(none!.uid)?.titleCode).toBeNull();
  }, 30_000);
});
