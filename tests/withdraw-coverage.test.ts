import { readFileSync } from 'node:fs';

import { afterAll, describe, expect, it } from 'vitest';

import { WITHDRAW_PRESERVED } from '@/lib/game/account/withdraw';

import { endTestDb, sql, testDb } from './db';

/**
 * 탈퇴 삭제 목록의 분류 누락 가드 — 컷오버 가드(scripts/cutover-tables.ts)와 같은 원리.
 *
 * 수동 테이블 목록은 새 테이블이 생기면 아무도 모르게 빠진다. 실제로 두 번 일어났다:
 * 컷오버(07-31 전수 대조가 12일 만에 재발, 0782e935)와 탈퇴(user_titles·challenge_claims 등
 * 6종 잔존 — 재가입 유저의 도전과제 보상이 전부 막히는 실피해, 2026-08-13 감사).
 *
 * 이 테스트는 public 스키마의 모든 테이블이 (탈퇴가 건드리는 집합) ∪ (사유와 함께 보존
 * 선언된 집합)에 들어가는지 검사한다. 새 테이블을 만든 사람이 그 자리에서 분류하게 강제한다.
 *
 * 삭제 집합은 withdraw.ts 소스에서 추출한다 — 함수를 실행해 관측하려면 실제 계정을 파괴해야
 * 하므로(공유 스테이징) 소스 파싱이 차악이다. raw SQL 템플릿의 `delete from X` / `update X set`
 * 패턴만 쓰는 파일이라 안정적이고, 패턴이 깨지면 이 테스트가 미분류로 먼저 드러낸다.
 */
describe('withdrawAccount — public 테이블 전수 분류', () => {
  afterAll(async () => {
    await endTestDb();
  });

  it('모든 테이블이 삭제되거나 사유와 함께 보존 선언돼 있다', async () => {
    const src = readFileSync('lib/game/account/withdraw.ts', 'utf8');
    const touched = new Set<string>();
    for (const m of src.matchAll(/delete from ([a-z_0-9]+)/g)) touched.add(m[1]!);
    for (const m of src.matchAll(/update ([a-z_0-9]+) set/g)) touched.add(m[1]!);

    const rows = (await testDb.execute(
      sql`select tablename from pg_tables where schemaname = 'public' order by tablename`,
    )) as unknown as { tablename: string }[];
    const all = rows.map((r) => r.tablename);

    const unclassified = all.filter((t) => !touched.has(t) && !(t in WITHDRAW_PRESERVED));
    expect(
      unclassified,
      `탈퇴 분류 누락 — 삭제문을 추가하거나 WITHDRAW_PRESERVED에 사유와 함께 등재할 것: ${unclassified.join(', ')}`,
    ).toEqual([]);

    // 반대 방향 — 보존 선언과 삭제문이 겹치면 목록이 거짓말을 한다(support_inquiries처럼
    // update만 하는 항목은 예외적으로 양쪽에 있을 수 있어 delete와의 교집합만 본다).
    const deleted = new Set<string>();
    for (const m of src.matchAll(/delete from ([a-z_0-9]+)/g)) deleted.add(m[1]!);
    const both = Object.keys(WITHDRAW_PRESERVED).filter((t) => deleted.has(t));
    expect(both, `보존 선언인데 삭제문도 있는 테이블: ${both.join(', ')}`).toEqual([]);

    // 보존 선언이 실존 테이블을 가리키는지 — 오타·드랍 잔재 방지.
    const live = new Set(all);
    const ghosts = Object.keys(WITHDRAW_PRESERVED).filter((t) => !live.has(t));
    expect(ghosts, `보존 선언인데 DB에 없는 테이블: ${ghosts.join(', ')}`).toEqual([]);
  });
});
