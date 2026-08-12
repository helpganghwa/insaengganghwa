/**
 * 파괴적 wipe 스크립트 공용 — **분류 누락 가드**.
 *
 * wipe 목록은 손으로 관리하는 테이블 이름 배열이라, 새 테이블이 생기면 아무도 모르게 빠진다.
 * 실제로 2026-07-31에 "80개 테이블 vs 목록 차집합"을 수작업 대조해 누락 8종을 보강했는데,
 * 12일 만에 같은 일이 재발했다 — user_titles(0149·0152)·diamond_ledger(0159)가 그 뒤에 생겨
 * 컷오버를 살아남을 상태였다(2026-08-12 감사). 진행도는 전부 지워지는데 칭호 발견 원장만
 * 남으면, 진행도 0인 계정이 "강화 100 달성" 칭호를 달고 출시를 맞는다.
 *
 * 수작업 대조는 또 잊힌다. 스크립트가 스스로 확인하게 만든다 — public 스키마의 모든 테이블은
 * **삭제 또는 보존 둘 중 하나로 분류**돼 있어야 하고, 아니면 실행을 멈춘다.
 * 새 테이블을 만든 사람이 그 자리에서 결정하게 강제하는 것이 목적이다.
 */
import type postgres from 'postgres';

type Sql = ReturnType<typeof postgres>;

/**
 * 두 목록 어디에도 없는 public 테이블 이름 목록(정렬). 빈 배열이면 정상.
 * 호출부는 이 결과가 비지 않으면 --confirm 실행을 중단시킬 것.
 */
export async function unclassifiedTables(
  sql: Sql,
  wipeTables: readonly string[],
  protectedTables: readonly string[],
): Promise<string[]> {
  const known = new Set([...wipeTables, ...protectedTables]);
  const rows = (await sql.unsafe(
    `select tablename from pg_tables where schemaname = 'public' order by tablename`,
  )) as unknown as { tablename: string }[];
  return rows.map((r) => r.tablename).filter((t) => !known.has(t));
}

/**
 * 목록에는 있는데 DB에 없는 이름 — 오타·드랍된 테이블 잔재. delete가 조용히 실패하는 대신
 * 미리 드러낸다(존재하지 않는 테이블 delete는 즉시 에러라 트랜잭션 전체가 롤백된다).
 */
export async function ghostTables(
  sql: Sql,
  wipeTables: readonly string[],
  protectedTables: readonly string[],
): Promise<string[]> {
  const rows = (await sql.unsafe(
    `select tablename from pg_tables where schemaname = 'public'`,
  )) as unknown as { tablename: string }[];
  const live = new Set(rows.map((r) => r.tablename));
  return [...wipeTables, ...protectedTables].filter((t) => !live.has(t)).sort();
}
