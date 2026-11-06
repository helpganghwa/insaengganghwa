import { sql, type SQL } from 'drizzle-orm';

import { TITLE_DEFS } from '@/lib/game/titles/defs';

/**
 * 칭호 랭킹 값(업데이트 18, 2026-11-06) — 발견한 칭호 개수. 칭호 화면 목록과 같은 기준이 되도록
 * 지금 정의된 칭호 코드(TITLE_DEFS)만 센다(없어진 옛 코드가 원장에 남아 있어도 세지 않는다).
 * 영구·조건부·숨김·잠긴 칭호 모두 '발견'이면 1개(사용자 결정: 발견 기준 전부).
 * 스냅샷(snapshot.ts)과 증분(incremental.ts)이 같은 식을 쓴다 — 두 경로 값이 항상 같아야 한다.
 */
// PG 배열 리터럴 문자열 하나로 넘긴다 — drizzle은 JS 배열을 ($1,$2,…) 튜플로 펼쳐 ::text[] 캐스트가 깨진다(snapshot.ts 주석).
const CODES_LITERAL = `{${TITLE_DEFS.map((d) => d.code).join(',')}}`;
if (TITLE_DEFS.some((d) => !/^[a-z0-9_]+$/.test(d.code))) throw new Error('title code must be [a-z0-9_]');

/** 한 유저·서버의 발견 칭호 수(int). userExpr·serverExpr는 컬럼(sql.raw) 또는 파라미터(sql`${v}::uuid`). */
export function titleCountSql(userExpr: SQL, serverExpr: SQL): SQL {
  return sql`(select count(*) from user_titles ut
    where ut.user_id = ${userExpr} and ut.server_id = ${serverExpr}
      and ut.title_code = any(${CODES_LITERAL}::text[]))::int`;
}

/** 서버 전체 유저별 발견 칭호 수 — 시간별 재계산용(유저별 상관 서브쿼리 대신 한 번의 묶음 스캔). 지금 캐릭터가 있는 유저만. */
export function titleCountsByServerSql(serverId: number): SQL {
  return sql`select ut.user_id::text as user_id, count(*)::int as value
    from user_titles ut
    join characters c on c.user_id = ut.user_id and c.server_id = ut.server_id
    where ut.server_id = ${serverId} and ut.title_code = any(${CODES_LITERAL}::text[])
    group by ut.user_id`;
}
