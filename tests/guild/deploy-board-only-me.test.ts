import { afterAll, describe, expect, it } from 'vitest';

import { getDeployBoard } from '@/lib/game/guild/queries';

import { endTestDb, sql, testDb } from '../db';

/**
 * 배치 정보 공개 범위가 '권한자만'일 때 일반 길드원에게는 **본인 행만** 읽힌다(0204) — 읽기 전용.
 * 남의 배치를 읽었다가 지우는 방식이 아니라 처음부터 읽지 않는다는 것이 핵심이라, 실제 조회 결과로 확인한다.
 */
const SERVER_ID = 1;

describe.skipIf(!process.env.TEST_USER_ID)('배치 보드 — 본인 행만 읽기', () => {
  afterAll(endTestDb);

  it('onlyUserId를 주면 그 사람 한 줄과 그 사람의 전투력만 돌아온다', async () => {
    const [g] = (await testDb.execute(sql`
      select gm.guild_id::text as gid, min(gm.user_id::text) as uid, count(*)::int as n
        from guild_members gm
        join characters c on c.user_id = gm.user_id and c.server_id = gm.server_id
       where gm.server_id = ${SERVER_ID}
       group by gm.guild_id having count(*) >= 2 order by count(*) desc limit 1
    `)) as unknown as { gid: string; uid: string; n: number }[];
    if (!g) return; // 두 명 이상인 길드가 없는 환경 — 확인할 것이 없다

    const full = await getDeployBoard(BigInt(g.gid), SERVER_ID);
    expect(full.members.length).toBe(g.n);

    const mine = await getDeployBoard(BigInt(g.gid), SERVER_ID, { onlyUserId: g.uid });
    expect(mine.members.map((m) => m.uid)).toEqual([g.uid]);
    expect(Object.keys(mine.combat)).toEqual([g.uid]);
    // 구역 목록(픽커)은 제한과 무관하다 — 배치하려면 필요하다.
    expect(mine.zones.length).toBe(full.zones.length);
  }, 30_000);
});
