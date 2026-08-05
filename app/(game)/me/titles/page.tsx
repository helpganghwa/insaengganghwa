import { sql } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { withTimeout } from '@/lib/db/with-timeout';
import { getActiveServerId } from '@/lib/game/servers';
import { TITLE_DEFS } from '@/lib/game/titles/defs';
import { TITLE_SECRET_BY_CODE } from '@/lib/game/titles/defs.server';
import { activeConditionals, discoverTitles } from '@/lib/game/titles/judge';

import { TitlesClient, type TitleRow } from './TitlesClient';

/**
 * 칭호 목록 — 노출 정책(TITLES.md §3.5): 전 칭호의 **이름은 항상 공개**, 조건은
 * **발견한 것만** 서버가 내려준다. 미발견 조건은 payload에 아예 싣지 않는다.
 * 진입 시 lazy 발견 판정(discoverTitles) — 도전과제와 같은 상태 파생 철학.
 */
export default async function TitlesPage() {
  const userId = await getSessionUserId();
  const serverId = await getActiveServerId();
  if (!userId) return null;

  const r = await withTimeout(
    (async () => {
      await discoverTitles(userId, serverId); // 멱등 — 새 달성분 원장 기록
      const [ledger, active, rep] = await Promise.all([
        db.execute(sql`
          select title_code, earned_at from user_titles where user_id=${userId}::uuid
        `) as unknown as Promise<{ title_code: string; earned_at: Date }[]>,
        activeConditionals(userId, serverId),
        db.execute(sql`
          select representative_title_code as code,
                 (select z.name from zones z where z.executor_user_id=${userId}::uuid and z.server_id=${serverId}
                  order by z.captured_at desc nulls last limit 1) as zone,
                 (select z.region::text from zones z where z.executor_user_id=${userId}::uuid and z.server_id=${serverId}
                  order by z.captured_at desc nulls last limit 1) as zone_region
          from profiles where id=${userId}::uuid
        `) as unknown as Promise<{ code: string | null; zone: string | null; zone_region: string | null }[]>,
      ]);
      return { ledger, active, rep: rep[0] };
    })(),
    5000,
    'titles.page',
  ).catch(() => null);

  const ledger = new Map((r?.ledger ?? []).map((l) => [l.title_code, l.earned_at]));
  const active = r?.active ?? new Set<string>();

  const rows: TitleRow[] = TITLE_DEFS.map((d) => {
    const earnedAt = ledger.get(d.code) ?? null;
    const discovered = earnedAt !== null;
    const isConditional = d.kind === 'conditional';
    return {
      code: d.code,
      // 발견한 것만 조건 공개 — 미발견은 서버에서부터 내려보내지 않는다(비노출 원칙).
      cond: discovered ? (TITLE_SECRET_BY_CODE.get(d.code)?.cond ?? '') : null,
      discovered,
      earnedAt: earnedAt ? new Date(earnedAt).toISOString().slice(0, 10) : null,
      activeNow: discovered && (!isConditional || active.has(d.code)),
    };
  });

  return (
    <TitlesClient
      rows={rows}
      representative={r?.rep?.code ?? null}
      executorZone={r?.rep?.zone ?? null}
      executorZoneRegion={r?.rep?.zone_region ?? null}
    />
  );
}
