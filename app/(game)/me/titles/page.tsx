import { sql } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { withTimeout } from '@/lib/db/with-timeout';
import { getActiveServerId } from '@/lib/game/servers';
import { kstDateString } from '@/lib/kst';
import { TITLE_DEFS } from '@/lib/game/titles/defs';
import { TITLE_SECRET_BY_CODE } from '@/lib/game/titles/defs.server';
import { discoverTitles, isHiddenPendingTitle } from '@/lib/game/titles/judge';

import { TitlesClient, type TitleRow } from './TitlesClient';

/**
 * 칭호 목록 — 노출 정책(TITLES.md §3.5): 칭호의 **이름은 공개**, 조건은 **발견한 것만**
 * 서버가 내려준다. 미발견 조건은 payload에 아예 싣지 않는다.
 * 진입 시 lazy 발견 판정(discoverTitles) — 도전과제와 같은 상태 파생 철학.
 *
 * 예외 하나 — 판정이 아직 없는 칭호(PENDING)는 미보유 시 이름도 내리지 않는다. 얻을 수 없는
 * 것을 "아직 못 얻은 것"과 같은 모습으로 두면 분모만 채우고 게이지가 닿지 않는다(judge.ts
 * isHiddenPendingTitle). 판정이 붙는 순간 그대로 목록에 나타난다.
 */
export default async function TitlesPage() {
  const userId = await getSessionUserId();
  const serverId = await getActiveServerId();
  if (!userId) return null;

  const r = await withTimeout(
    (async () => {
      // 멱등 발견 판정 — active 동봉 반환(지표 수집 1회로 발견+활성 모두 해결)
      const { active } = await discoverTitles(userId, serverId);
      const [ledger, rep] = await Promise.all([
        db.execute(sql`
          select title_code, earned_at from user_titles where user_id=${userId}::uuid and server_id=${serverId}
        `) as unknown as Promise<{ title_code: string; earned_at: Date }[]>,
        db.execute(sql`
          select representative_title_code as code,
                 (select z.name from zones z where z.executor_user_id=${userId}::uuid and z.server_id=${serverId}
                  order by z.captured_at desc nulls last limit 1) as zone,
                 (select z.region::text from zones z where z.executor_user_id=${userId}::uuid and z.server_id=${serverId}
                  order by z.captured_at desc nulls last limit 1) as zone_region
          from characters where user_id=${userId}::uuid and server_id=${serverId}
        `) as unknown as Promise<{ code: string | null; zone: string | null; zone_region: string | null }[]>,
      ]);
      return { ledger, active, rep: rep[0] };
    })(),
    5000,
    'titles.page',
  ).catch(() => null);

  const ledger = new Map((r?.ledger ?? []).map((l) => [l.title_code, l.earned_at]));
  const active = r?.active ?? new Set<string>();

  // 판정이 아직 없는 칭호(PENDING)는 **보유하지 않았다면** 목록에서 뺀다 — 목록에 있으면
  // "아직 못 얻은 것"과 구분되지 않은 채 분모에 들어가, 발견 게이지가 채워질 수 없게 된다.
  // 보유분(선발대 등)은 그대로 보인다(isHiddenPendingTitle 주석).
  const rows: TitleRow[] = TITLE_DEFS.filter(
    (d) => !isHiddenPendingTitle(d.code, ledger.has(d.code)),
  ).map((d) => {
    const earnedAt = ledger.get(d.code) ?? null;
    const discovered = earnedAt !== null;
    const isConditional = d.kind === 'conditional';
    return {
      code: d.code,
      // 발견한 것만 조건 공개 — 미발견은 서버에서부터 내려보내지 않는다(비노출 원칙).
      cond: discovered ? (TITLE_SECRET_BY_CODE.get(d.code)?.cond ?? '') : null,
      discovered,
      // 발견일 — 목록엔 표시하지 않고 상세 팝업에서만 노출(사용자 확정). KST 표기(§3.8).
      earnedAt: earnedAt ? kstDateString(new Date(earnedAt)) : null,
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
