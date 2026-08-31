import { afterAll, describe, expect, it } from 'vitest';

import { aggregateConquestDay } from '@/lib/game/guild/conquest/chronicle';

import { testDb, sql, endTestDb } from '../db';

/**
 * 연대기 사실표의 개명(guild_rename)·해산(guild_disband) 조회 창 검증(2026-08-31).
 * 연대기는 23시에 사전생성되므로 창은 자정이 아니라 [전날 23:00, 당일 23:00) KST —
 * 23:00~24:00 사이 사건이 어느 연대기에도 못 실리는 구멍의 회귀 방지.
 */
const SV = 30010; // 격리 스크래치 서버(다른 테스트 SV=30000과 무충돌)
const DAY = '2020-01-02';
const NEXT_DAY = '2020-01-03';

async function cleanup(): Promise<void> {
  await testDb.execute(sql`delete from world_events where server_id = ${SV}`);
}

afterAll(async () => {
  await cleanup();
  await endTestDb();
});

describe('연대기 개명/해산 조회 창 [전날 23:00, 당일 23:00) KST', () => {
  it('전날 23시 이후 사건은 당일 연대기에, 당일 23시 이후 사건은 다음 날 연대기에 실린다', async () => {
    await cleanup();
    // 개명 3건: 전날 23:30(→DAY), 당일 22:00(→DAY), 당일 23:30(→NEXT_DAY)
    await testDb.execute(sql`
      insert into world_events (server_id, type, detail, created_at) values
      (${SV}, 'guild_rename', ${JSON.stringify({ guildName: 'B1', before: 'A1' })}::jsonb, '2020-01-01T23:30:00+09:00'),
      (${SV}, 'guild_rename', ${JSON.stringify({ guildName: 'B2', before: 'A2' })}::jsonb, '2020-01-02T22:00:00+09:00'),
      (${SV}, 'guild_rename', ${JSON.stringify({ guildName: 'B3', before: 'A3' })}::jsonb, '2020-01-02T23:30:00+09:00'),
      (${SV}, 'guild_disband', ${JSON.stringify({ guildName: 'D1', zones: [] })}::jsonb, '2020-01-02T23:30:00+09:00')
    `);

    const day = await aggregateConquestDay(DAY, SV);
    expect(day.renames.map((r) => r.after).sort()).toEqual(['B1', 'B2']);
    expect(day.disbands).toHaveLength(0); // 23:30 해산은 다음 날 몫

    const next = await aggregateConquestDay(NEXT_DAY, SV);
    expect(next.renames.map((r) => r.after)).toEqual(['B3']);
    expect(next.disbands.map((d) => d.guildName)).toEqual(['D1']);
  });

  it('before/after가 비면 사실표에서 제외된다(깨진 이벤트 방어)', async () => {
    await cleanup();
    await testDb.execute(sql`
      insert into world_events (server_id, type, detail, created_at) values
      (${SV}, 'guild_rename', ${JSON.stringify({ guildName: 'OnlyAfter' })}::jsonb, '2020-01-02T12:00:00+09:00')
    `);
    const day = await aggregateConquestDay(DAY, SV);
    expect(day.renames).toHaveLength(0);
  });
});
