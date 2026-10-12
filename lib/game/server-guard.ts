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
 *
 * 닫힌 서버(2026-10-12 결정: 진입 차단 + 다른 서버로 안내) — `closed`는 크론 순회에서 빠져 점령전·대난투·
 * 정산이 멈춘 서버다. 캐릭터가 있어도 **운영 중인 서버로 치지 않는다**: 쓰기·결제·전환 관문이 모두 거부하고,
 * 레이아웃은 운영 중인 서버에 캐릭터가 있으면 그리로 되돌리고, 닫힌 서버에만 있으면 안내 화면(/server-closed)으로 보낸다.
 */

/** 캐릭터가 **닫힌 서버에만** 있다 — 만들지도 돌려보내지도 말고 운영 종료 안내로. */
export const CLOSED_ONLY = 'closed_only' as const;
/** 교정 결과: 숫자=그 서버로 되돌림, null=교정 불필요(정상 또는 신규라 만들어도 됨), CLOSED_ONLY=안내 화면. */
export type ServerCorrection = number | null | typeof CLOSED_ONLY;

/** 내 캐릭터가 있는 서버 목록 + 돌아갈 곳(계정에 기록된 마지막 서버 우선). */
export type UserServers = {
  /** 캐릭터가 있고 **운영 중인**(open·full) 서버 id(오름차순). 닫힌 서버는 빠진다. */
  ids: number[];
  /** 돌려보낼 서버 — last_server_id에 캐릭터가 있으면 그것, 없으면 가장 낮은 id. 운영 중인 서버에 캐릭터가 없으면 null. */
  preferred: number | null;
  /** 캐릭터는 있지만 닫힌(closed) 서버 id(오름차순) — 들어갈 수 없고, 안내 화면이 이름을 보여 준다. */
  closedIds: number[];
};

export async function loadUserServers(userId: string): Promise<UserServers> {
  // 1왕복 — 캐릭터가 있는 서버와 계정의 마지막 서버, 그 서버의 상태를 함께 읽는다.
  const rows = (await db.execute(sql`
    select c.server_id::int as sid,
           (c.server_id = p.last_server_id) as is_last,
           (s.status = 'closed') as is_closed
      from characters c
      join profiles p on p.id = c.user_id
      join servers s on s.id = c.server_id
     where c.user_id = ${userId}::uuid
     order by c.server_id
  `)) as unknown as { sid: number; is_last: boolean; is_closed: boolean }[];
  const live = rows.filter((r) => !r.is_closed);
  const ids = live.map((r) => r.sid);
  const last = live.find((r) => r.is_last)?.sid;
  return {
    ids,
    preferred: last ?? ids[0] ?? null,
    closedIds: rows.filter((r) => r.is_closed).map((r) => r.sid),
  };
}

/**
 * 이 서버에서 행동해도 되는가 — **캐릭터가 있는 운영 중인 서버만 통과**(닫힌 서버는 캐릭터가 있어도 거부).
 * 쓰기 경로(길드 가입·친구 요청·결제·서버 전환)에서 쿠키 위조와 닫힌 서버 진입을 막는다. 레이드는 이미 같은 검사를 갖고 있다
 * (`lib/game/raid/join.ts` NO_CHARACTER_ON_SERVER) — 그 패턴을 다른 도메인으로 넓힌 것.
 */
export async function hasCharacterOn(userId: string, serverId: number): Promise<boolean> {
  const rows = (await db.execute(sql`
    select 1
      from characters c
      join servers s on s.id = c.server_id
     where c.user_id = ${userId}::uuid and c.server_id = ${serverId} and s.status <> 'closed'
     limit 1
  `)) as unknown as unknown[];
  return rows.length > 0;
}

/**
 * 쿠키가 가리키는 서버를 못 쓸 때 돌아갈 서버.
 *  - null: 이 서버가 정상이거나, 어느 서버에도 캐릭터가 없는 신규(그 서버에 만드는 것이 정상 동작).
 *  - 숫자: **만들지 말고** 그 서버로 되돌려야 한다.
 *  - CLOSED_ONLY: 캐릭터가 닫힌 서버에만 있다 — 만들지도 되돌리지도 말고 안내 화면으로(새 캐릭터는 본인이 고른다).
 */
export async function correctServerFor(userId: string, activeServerId: number): Promise<ServerCorrection> {
  const { ids, preferred, closedIds } = await loadUserServers(userId);
  if (ids.includes(activeServerId)) return null; // 정상
  if (ids.length > 0) return preferred; // 운영 중인 다른 서버에 있다 — 되돌린다
  if (closedIds.length > 0) return CLOSED_ONLY; // 닫힌 서버에만 있다
  return null; // 신규 — 지금 서버에 만드는 것이 맞다
}

/**
 * 트랜잭션 안에서 "그 서버가 닫혔는가" — 닫힌 서버 자산 완전 동결(2026-10-12 결정 ⑤)용.
 * 지갑 지급·차감과 id로 대상 행을 받는 경로(강화 등록·장착·우편 단건 수령)가 **대상 행의 서버**로 확인한다
 * (쿠키 서버가 아니다 — 쿠키는 열린 서버에 두고 닫힌 서버의 장비·우편 id를 넣는 경우를 막는다).
 */
export async function isServerClosedIn(dbx: Pick<typeof db, 'execute'>, serverId: number): Promise<boolean> {
  const rows = (await dbx.execute(sql`select 1 as ok from servers where id = ${serverId} and status = 'closed' limit 1`)) as unknown as unknown[];
  return rows.length > 0;
}
