import 'server-only';

import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';

/**
 * 활성 서버 관문(2026-09-21 2서버 전수조사 ④).
 *
 * `getActiveServerId()`는 `srv` 쿠키를 그대로 믿는다 — 요청마다 DB를 때리지 않기 위한 의도된
 * 설계다(CLAUDE §11.4). 대신 쿠키가 **내 캐릭터가 없는 서버**를 가리킬 때의 뒷수습이 없어서,
 * 쿠키 유실(새 기기·저장소 삭제)이나 위조가 곧바로 사고가 됐다:
 *  - 유실: 쿠키가 없으면 1서버로 떨어지고, 레이아웃 자가복구가 거기 **새 캐릭터를 만들어** 버린다.
 *    2서버만 하던 사람에게는 진행도가 통째로 사라진 것으로 보이고, 캐릭터를 지울 수단이 없다.
 *  - 위조: 없는 서버에서 길드 가입·친구 요청 같은 쓰기가 통과해 유령 행이 남는다(③에서 함께 차단).
 *
 * 그래서 "쓰기 직전"과 "캐릭터를 만들기 직전"에만 이 관문을 통과시킨다. 읽기 경로는 그대로 둔다
 * (틀린 서버를 보는 것은 빈 화면일 뿐 데이터가 상하지 않는다).
 */

/** 내 캐릭터가 있는 서버 목록 + 돌아갈 곳(계정에 기록된 마지막 서버 우선). */
export type UserServers = {
  /** 캐릭터가 있는 서버 id(오름차순). */
  ids: number[];
  /** 돌려보낼 서버 — last_server_id에 캐릭터가 있으면 그것, 없으면 가장 낮은 id. 캐릭터가 없으면 null. */
  preferred: number | null;
};

export async function loadUserServers(userId: string): Promise<UserServers> {
  // 1왕복 — 캐릭터가 있는 서버와 계정의 마지막 서버를 함께 읽는다.
  const rows = (await db.execute(sql`
    select c.server_id::int as sid, (c.server_id = p.last_server_id) as is_last
      from characters c
      join profiles p on p.id = c.user_id
     where c.user_id = ${userId}::uuid
     order by c.server_id
  `)) as unknown as { sid: number; is_last: boolean }[];
  const ids = rows.map((r) => r.sid);
  const last = rows.find((r) => r.is_last)?.sid;
  return { ids, preferred: last ?? ids[0] ?? null };
}

/**
 * 이 서버에서 행동해도 되는가 — **캐릭터가 있는 서버만 통과**.
 * 쓰기 경로(길드 가입·친구 요청 등)에서 쿠키 위조를 막는다. 레이드는 이미 같은 검사를 갖고 있다
 * (`lib/game/raid/join.ts` NO_CHARACTER_ON_SERVER) — 그 패턴을 다른 도메인으로 넓힌 것.
 */
export async function hasCharacterOn(userId: string, serverId: number): Promise<boolean> {
  const rows = (await db.execute(sql`
    select 1 from characters where user_id = ${userId}::uuid and server_id = ${serverId} limit 1
  `)) as unknown as unknown[];
  return rows.length > 0;
}

/**
 * 쿠키가 가리키는 서버를 못 쓸 때 돌아갈 서버 — 없으면 null(=이 계정은 아직 캐릭터가 없다).
 * `null`이면 그 서버에 캐릭터를 만드는 것이 정상 동작이고, 숫자가 나오면 **만들지 말고 되돌려야** 한다.
 */
export async function correctServerFor(userId: string, activeServerId: number): Promise<number | null> {
  const { ids, preferred } = await loadUserServers(userId);
  if (ids.length === 0) return null; // 신규 — 지금 서버에 만드는 것이 맞다
  if (ids.includes(activeServerId)) return null; // 정상
  return preferred;
}
