import 'server-only';

import { unstable_cache } from 'next/cache';
import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { withTimeout } from '@/lib/db/with-timeout';

/**
 * "지금 인생강화는" 사회적 증거 통계. /login·/u 프로필 카드 전용.
 *
 * 두 종류:
 *  - totalUsers: 전체 가입 유저 수(`profiles` 행 수). 천천히 변해 90s 캐시면 충분.
 *  - totals: `enhancement_logs` 누적 성공/유지/하락. 'mega'는 'success'에 합산(GDD §3.2).
 *    ⚠ 전수 집계는 **읽기 경로에서 돌리지 않는다** — 실측(81일)에서 95,625회 · 평균 57.6ms로
 *    DB 실행시간의 15.8%를 먹는 단일 1위였다. 앞에 unstable_cache(10분)가 있었는데도 캐시가
 *    인스턴스 단위로 갈려 기대치의 8배가 DB까지 내려왔다. 지금은 크론이 enhance_totals 한 행에
 *    10분마다 채우고(refreshEnhanceTotals) 읽기는 그 행만 본다(0198).
 */
export type EnhanceLive = {
  /** null = 조회 실패 — 카드가 "0명"이 아니라 "—"로 그린다. */
  totalUsers: number | null;
  /** null = 아직 스냅샷 없음/조회 실패 — 카드가 0이 아니라 "—"로 그린다. */
  success: number | null;
  hold: number | null;
  down: number | null;
};

async function rawTotalUsers(): Promise<number> {
  const rows = (await db.execute(sql`
    select count(*)::bigint as c from profiles
  `)) as unknown as { c: string | bigint }[];
  return Number(rows[0]?.c ?? 0);
}

/** 트랜잭션 자문 락 id — enhance_totals 전수 집계 전용(다른 용도와 겹치지 않는 임의 상수). */
const ADVISORY_LOCK_ID = 198_0001;

type Totals = Omit<EnhanceLive, 'totalUsers'>;
const NO_TOTALS: Totals = { success: null, hold: null, down: null };

/** 스냅샷 한 행 읽기 — 없으면 null(카드가 "—"로 그린다). 인덱스 없이도 1행이라 상수 비용. */
async function rawEnhanceTotals(): Promise<Totals> {
  const rows = (await db.execute(sql`
    select success::text, hold::text, down::text from enhance_totals where id = 1
  `)) as unknown as { success: string; hold: string; down: string }[];
  const r = rows[0];
  if (!r) return NO_TOTALS;
  return { success: Number(r.success), hold: Number(r.hold), down: Number(r.down) };
}

/**
 * 스냅샷 갱신 — 크론에서만 호출(warm, 10분 간격). 전수 집계는 여기 한 곳에만 남는다.
 * 반환: 갱신했으면 true, 아직 신선해 건너뛰었으면 false.
 */
export async function refreshEnhanceTotals(maxAgeMs = 10 * 60_000): Promise<boolean> {
  const secs = Math.round(maxAgeMs / 1000);
  // 신선도 확인·중복 방지 락·집계를 **한 트랜잭션**에 담는다(7차 검수).
  //
  // ⚠ 세션 락(pg_try_advisory_lock)은 여기서 쓰면 안 된다 — 런타임 DB가 pgbouncer 트랜잭션
  // 풀러라 문장마다 백엔드가 갈릴 수 있어, 해제가 "이 락의 소유자가 아니다"로 실패하고 락이
  // 남는다(실측). 남은 락은 이후 모든 갱신을 영구히 막는다. 트랜잭션 락은 커밋·롤백에 자동
  // 해제되고 한 트랜잭션 = 한 커넥션이라 풀러에서도 안전하다.
  //
  // 락이 필요한 이유: 신선도 확인과 집계 사이가 비원자라, 집계가 1분을 넘기면 매분 새 warm이
  // "낡음"으로 보고 또 전수 스캔을 띄운다 — 207MB 테이블을 동시에 여러 번 훑으며 커넥션을
  // 점유하고, 하필 DB가 이미 아픈 상황에서 증폭 방향으로 작동한다.
  return db.transaction(async (tx) => {
    const [lock] = (await tx.execute(
      sql`select pg_try_advisory_xact_lock(${ADVISORY_LOCK_ID}) as got`,
    )) as unknown as { got: boolean }[];
    if (!lock?.got) return false; // 이미 누가 돌고 있다

    // 락을 잡은 뒤 다시 본다 — 기다리는 동안 앞 실행이 끝냈을 수 있다.
    const [fresh] = (await tx.execute(sql`
      select 1 from enhance_totals
      where id = 1 and computed_at > now() - ${sql.raw(`interval '${secs} seconds'`)}
    `)) as unknown as unknown[];
    if (fresh) return false;

    await tx.execute(sql`
      insert into enhance_totals (id, success, hold, down, computed_at)
      select 1,
        coalesce(sum(case when result in ('success','mega') then 1 else 0 end), 0),
        coalesce(sum(case when result = 'hold' then 1 else 0 end), 0),
        coalesce(sum(case when result = 'down' then 1 else 0 end), 0),
        now()
      from enhancement_logs
      on conflict (id) do update set
        success = excluded.success, hold = excluded.hold,
        down = excluded.down, computed_at = excluded.computed_at
    `);
    return true;
  });
}

// 전체 유저 수 90s — 천천히 변해 캐시 충분. count(*)이라 비용 낮음.
const cachedTotalUsers = unstable_cache(rawTotalUsers, ['stats:total-users'], {
  revalidate: 90,
  tags: ['stats'],
});

// 누적 60s — 스냅샷 자체가 10분 주기라 읽기 캐시는 왕복만 줄이면 된다(값은 어차피 안 변함).
const cachedEnhanceTotals = unstable_cache(rawEnhanceTotals, ['stats:enhance-totals'], {
  revalidate: 60,
  tags: ['stats'],
});

export async function getEnhanceLive(): Promise<EnhanceLive> {
  const [totalUsers, totals] = await Promise.all([
    // 실패 시 0이 아니라 null — "0명 인생강화중"은 비로그인 첫 화면에 나가는 사회적 증거가
    // 정반대 신호를 보내는 것이다(7차 검수: 같은 카드의 나머지 셋만 고치고 여기를 빠뜨렸다).
    withTimeout(cachedTotalUsers(), 1500, 'stats.totalUsers').catch(() => null),
    // 실패 시 0이 아니라 null — 0은 "강화가 한 번도 없었다"는 거짓말이라 카드가 "—"로 그린다.
    withTimeout(cachedEnhanceTotals(), 3000, 'stats.enhanceTotals').catch(() => NO_TOTALS),
  ]);
  return { totalUsers, ...totals };
}
