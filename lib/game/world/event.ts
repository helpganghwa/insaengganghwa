import 'server-only';

import { unstable_cache, revalidateTag } from 'next/cache';
import { and, desc, eq, inArray, isNotNull, notInArray, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { worldEvents, rankingLeaders } from '@/lib/db/schema/world';
import { characters } from '@/lib/db/schema/server';
import { profiles } from '@/lib/db/schema/profiles';
import { guilds, zones } from '@/lib/db/schema/guild';
import { getRankingTop, type LeaderboardMetric } from '@/lib/game/leaderboard/queries';
import { getGuildRanking } from '@/lib/game/guild/queries';
import { logMemberAchievement } from '@/lib/game/guild/achievement';
import { broadcastChat } from '@/lib/game/chat/realtime';

/** 월드 피드 사건 종류. detail 스키마는 각 logWorldEvent 호출부 + WorldLogFeed 렌더 참조. */
export type WorldEventType =
  | 'melee_rank' // 대난투 1~3위 — detail { rank }
  | 'enhance' // 강화 100단위 — detail { item, level }
  | 'transcend' // 개인 최고 초월 기록 갱신(11+, 유저당 수치별 1회) — detail { item, level }
  | 'guild_create' // 길드 결성 — detail { guildName }
  | 'guild_rename' // 길드명 변경(0182) — detail { guildName(새 이름), before }
  | 'guild_disband' // 길드 해산(자발·자동 공통) — detail { guildName, zones: string[] }(중립화된 구역, 연대기 재료)
  | 'zone_neutralized' // (2026-08-30 이전 이력) 방치로 중립화된 구역 — detail { guildName, zones: string[] }. 연대기 전용(월드 피드·채팅 제외)
  | 'zone_abandoned' // 방치 판정 구역(0180, 소유 유지·세금 보너스 제외) — detail { guildName, zones: string[], battleDay }. 연대기 전용
  | 'guild_power_1' // 길드 전투력 1위 교체 — detail { guildName }
  | 'guild_zone_1' // 길드 점령지 1위 교체 — detail { guildName }
  | 'rank_leader' // 랭킹 5종 유저 1위 교체 — detail { metric, value }
  | 'personal_milestone'; // 개인 기록 마일스톤(합산강화/전투력/레이드/대난투) — detail { metric, milestone }

/** 홈 월드 피드 1건 — actor 닉네임·공개코드 해소(프로필 링크 = 코드+서버). */
export type WorldEventEntry = {
  id: string;
  type: string;
  serverId: number;
  actorNickname: string | null;
  actorCode: string | null;
  detail: Record<string, unknown> | null;
  createdAtIso: string;
};

/**
 * 월드 이벤트 1건 기록 — best-effort(실패해도 정산/액션에 영향 없음). 길드원 여부 무관 전체 유저.
 * 마일스톤 지점에서만 호출하므로 빈도 낮음(강화 100단위·초월 10단위·대난투 1~3위·1위 교체 등).
 */
export async function logWorldEvent(
  serverId: number,
  type: WorldEventType,
  detail: Record<string, unknown>,
  opts?: { actorUserId?: string; guildId?: bigint },
): Promise<void> {
  try {
    const [row] = await db
      .insert(worldEvents)
      .values({
        serverId,
        type,
        actorUserId: opts?.actorUserId ?? null,
        guildId: opts?.guildId ?? null,
        detail,
      })
      .returning({ id: worldEvents.id, createdAt: worldEvents.createdAt });
    // 쓰기 시점 캐시 무효화(2026-07-22) — 30초 SWR만으로는 만료 후 첫 진입이 stale을 받고
    // 백그라운드 갱신이라 "티커는 최신인데 상세는 재진입해야 보이는" 불일치가 났다.
    // 이벤트는 저빈도(마일스톤 지점만)라 무효화 비용 무시 가능, limit별 엔트리 전부 동시 갱신.
    try {
      // Next 16 시그니처 — 2번째 인자 = cacheLife 프로필('max' = 구버전 즉시 만료 동작).
      // 서버 태그만 무효화(감사 B7) — 전역 'world-feed'를 치면 서버 1의 사건이 전 서버 피드
      // 캐시를 깨서 서버 수만큼 재조회가 번진다. 전역 태그는 어드민 수동 revalidate 전용.
      revalidateTag(`world-feed:s${serverId}`, 'max');
    } catch {
      /* 요청 컨텍스트 밖(스크립트 등) — 캐시 무효화만 생략 */
    }
    // 전체 채팅 시스템 라인(2026-07-21) — 월드로그에 찍히는 사건을 실시간 브로드캐스트.
    // 마일스톤 지점만이라 빈도 낮음. 실패해도 채팅 폴백(getRecentChat 병합)이 커버.
    if (row) {
      let actorNickname: string | null = null;
      let actorCode: string | null = null;
      if (opts?.actorUserId) {
        const [[c], [pr]] = await Promise.all([
          db
            .select({ nickname: characters.nickname })
            .from(characters)
            .where(and(eq(characters.serverId, serverId), eq(characters.userId, opts.actorUserId)))
            .limit(1),
          db.select({ code: profiles.publicCode }).from(profiles).where(eq(profiles.id, opts.actorUserId)).limit(1),
        ]);
        actorNickname = c?.nickname ?? null;
        actorCode = pr?.code ?? null;
      }
      const entry: WorldEventEntry = {
        id: row.id.toString(),
        type,
        serverId,
        actorNickname,
        actorCode,
        detail,
        createdAtIso: row.createdAt.toISOString(),
      };
      await broadcastChat(serverId, 'sys', entry);
    }
  } catch {
    // best-effort — 기록 실패는 무시.
  }
}

/**
 * 홈 월드 피드 — server_id 최신순 limit건 + actor 닉/코드 일괄 해소.
 * §11.5 — 전 유저가 홈마다 같은 피드를 읽으므로 30초 캐시(피드 지연 ≤30s 허용, 인자별 키).
 * 태그는 서버별(`world-feed:s{N}`) 래퍼로 부착(감사 B7) — unstable_cache 태그는 래퍼 생성
 * 시점 고정이라 서버별 무효화를 하려면 서버마다 래퍼가 필요하다(인스턴스 로컬 메모).
 * 전역 'world-feed' 태그는 어드민 수동 revalidate(전 서버 일괄) 호환용으로 병기.
 */
const feedCacheByServer = new Map<number, typeof getWorldFeedUncached>();

export function getWorldFeed(serverId: number, limit = 40): Promise<WorldEventEntry[]> {
  let fn = feedCacheByServer.get(serverId);
  if (!fn) {
    fn = unstable_cache(getWorldFeedUncached, ['world-feed-v1', `s${serverId}`], {
      revalidate: 30,
      tags: ['world-feed', `world-feed:s${serverId}`],
    });
    feedCacheByServer.set(serverId, fn);
  }
  return fn(serverId, limit);
}

async function getWorldFeedUncached(serverId: number, limit = 40): Promise<WorldEventEntry[]> {
  const rows = await db
    .select({
      id: worldEvents.id,
      type: worldEvents.type,
      actorUserId: worldEvents.actorUserId,
      detail: worldEvents.detail,
      createdAt: worldEvents.createdAt,
    })
    .from(worldEvents)
    // zone_neutralized·zone_abandoned(연대기 전용)는 월드 피드/채팅엔 노출하지 않는다(피드 노이즈 방지).
    .where(and(eq(worldEvents.serverId, serverId), notInArray(worldEvents.type, ['zone_neutralized', 'zone_abandoned'])))
    // 동일 ms 이벤트(cron 연속 insert) 순서 결정성 — id(bigserial 삽입순) 2차키(감사 F4).
    .orderBy(desc(worldEvents.createdAt), desc(worldEvents.id))
    .limit(limit);

  const ids = [...new Set(rows.map((r) => r.actorUserId).filter((v): v is string => !!v))];
  const nameMap = new Map<string, string>();
  const codeMap = new Map<string, string>();
  if (ids.length) {
    const [chars, profs] = await Promise.all([
      db
        .select({ userId: characters.userId, nickname: characters.nickname })
        .from(characters)
        .where(and(eq(characters.serverId, serverId), inArray(characters.userId, ids))),
      db
        .select({ id: profiles.id, code: profiles.publicCode })
        .from(profiles)
        .where(inArray(profiles.id, ids)),
    ]);
    for (const c of chars) nameMap.set(c.userId, c.nickname);
    for (const p of profs) codeMap.set(p.id, p.code);
  }

  return rows.map((r) => ({
    id: r.id.toString(),
    type: r.type,
    serverId,
    actorNickname: r.actorUserId ? (nameMap.get(r.actorUserId) ?? null) : null,
    actorCode: r.actorUserId ? (codeMap.get(r.actorUserId) ?? null) : null,
    detail: (r.detail as Record<string, unknown> | null) ?? null,
    createdAtIso: r.createdAt.toISOString(),
  }));
}

const LEADER_METRICS: LeaderboardMetric[] = ['max', 'sum', 'combat', 'raid', 'melee'];

/**
 * 랭킹 5종 유저 1위 교체 감지(일일 cron) — metric별 현재 1위를 ranking_leaders와 비교해 바뀌면
 * world_events(rank_leader) 기록 후 갱신. 첫 관측(저장 없음)은 기록 없이 시드만(초기 스팸 방지).
 */
export async function runRankingLeaders(serverId: number): Promise<number> {
  const prev = await db
    .select({ metric: rankingLeaders.metric, userId: rankingLeaders.userId, value: rankingLeaders.value })
    .from(rankingLeaders)
    .where(eq(rankingLeaders.serverId, serverId));
  const prevMap = new Map(prev.map((p) => [p.metric, p]));

  let logged = 0;
  for (const metric of LEADER_METRICS) {
    const [leader] = await getRankingTop(metric, serverId, 1);
    if (!leader) continue;
    const before = prevMap.get(metric);
    const changed = before !== undefined && before.userId !== leader.userId;
    const lv = BigInt(leader.value);

    // 칭호 '신기록'(0167) — 유저 교체가 아니라 **값 경신** 기준. 교체만 보면 1위 탈퇴 승계
    // (더 낮은 값)·동률 추월(uuid 타이브레이크)에 오지급되고, 1위 스스로의 경신(가장 정당한
    // 주체)은 영영 못 받는다. 값 null(첫 관측·컬럼 도입 전 시드)은 기록만 하고 지급하지
    // 않는다 — 오픈 직후 일괄 지급 방지. best-effort(실패해도 피드/시드는 진행).
    if (metric === 'max' && before?.value != null && lv > before.value) {
      await db
        .execute(
          sql`insert into user_titles (user_id, server_id, title_code)
              values (${leader.userId}::uuid, ${serverId}, 'new_record')
              on conflict do nothing`,
        )
        .catch((e) => console.warn('[rank-leader] new_record grant failed', e));
    }

    // 1위 교체 피드 — 첫 관측(시드 없음)은 기록 없이 시드만(초기 일괄 스팸 방지).
    if (changed) {
      await logWorldEvent(
        serverId,
        'rank_leader',
        { metric, value: leader.value },
        { actorUserId: leader.userId },
      );
      // 길드원이면 길드 로그에도 노출(월드 로그와 동일 사건). best-effort.
      await logMemberAchievement(leader.userId, serverId, { action: 'achv_rank_leader', detail: { metric } });
      logged += 1;
    }

    // 저장 값은 max 지표만 고수위(high-water) 유지 — 1위 탈퇴로 현 1위 값이 내려가도 "서버
    // 역대 최고"는 남는다(다음 경신은 역대치를 넘어야 함). 나머지 지표 값은 참고용 현재값.
    const storedValue = metric === 'max' && before?.value != null && before.value > lv ? before.value : lv;
    if (before === undefined || changed || before.value !== storedValue) {
      await db
        .insert(rankingLeaders)
        .values({ serverId, metric, userId: leader.userId, value: storedValue })
        .onConflictDoUpdate({
          target: [rankingLeaders.serverId, rankingLeaders.metric],
          set: {
            userId: leader.userId,
            value: storedValue,
            updatedAt: sql`now()`,
            // since(0185) — 유저가 바뀔 때만 리셋(값만 갱신되면 유지). 1위 칭호 “N일”의 근거.
            since: sql`case when ranking_leaders.user_id <> excluded.user_id then now() else ranking_leaders.since end`,
          },
        });
    }
  }
  return logged;
}

/**
 * 길드 전투력·점령지 1위 교체 감지(준실시간 cron) — world_events 피드 자체를 "직전 1위" 상태로
 * 사용(별도 추적 테이블 불필요). 동type 최신 이벤트의 guildId와 현재 1위가 다르면 기록.
 * 길드 수가 적어 첫 관측도 발표(시드 억제 없음). 일일 길드 업적(top3 feed)과는 분리.
 */
export async function runGuildLeaders(serverId: number): Promise<number> {
  // 전투력 1위 + 점령지(소유 구역 수) 1위.
  const power = (await getGuildRanking(serverId, 1))[0] ?? null;
  const [zoneTop] = await db
    .select({ guildId: zones.ownerGuildId, n: sql<number>`count(*)::int` })
    .from(zones)
    .where(and(eq(zones.serverId, serverId), isNotNull(zones.ownerGuildId)))
    .groupBy(zones.ownerGuildId)
    .orderBy(desc(sql`count(*)`))
    .limit(1);

  const targets = [
    ['guild_power_1', power?.id ?? null],
    ['guild_zone_1', zoneTop?.guildId ?? null],
  ] as const;

  let logged = 0;
  for (const [type, guildId] of targets) {
    if (guildId == null) continue;
    // 직전 발표된 1위 = 동type 최신 이벤트의 guildId(피드 = 상태). 같으면 스킵.
    const [last] = await db
      .select({ guildId: worldEvents.guildId })
      .from(worldEvents)
      .where(and(eq(worldEvents.serverId, serverId), eq(worldEvents.type, type)))
      .orderBy(desc(worldEvents.id))
      .limit(1);
    if (last?.guildId === guildId) continue;
    const [g] = await db
      .select({ name: guilds.name })
      .from(guilds)
      .where(eq(guilds.id, guildId))
      .limit(1);
    await logWorldEvent(serverId, type, { guildName: g?.name ?? '길드' }, { guildId });
    logged += 1;
  }
  return logged;
}

/**
 * 길드 1위 유지 추적(0185, 2026-09-03) — 길드 1위 칭호 옆 “N일”의 근거. 15분 크론이 metric별 현재 단독 1위를
 * guild_rank_leaders에 upsert(길드가 바뀌면 since 리셋). 산식은 칭호 판정과 동일:
 *  rank = 명가(level, xp 사전식) · combat = 길드 전투력(getGuildRanking 'combat') · zones = 소유 구역 수 · tax = 세금 곳간(>0).
 * 단독 1위가 없으면(동률·0) 그 metric 행을 지운다(다음에 다시 잡히면 1일째부터).
 */
export async function runGuildLeaderSince(serverId: number): Promise<void> {
  const top = async (q: ReturnType<typeof sql>) =>
    ((await db.execute(q)) as unknown as { id: string | null; tie: boolean | null }[])[0] ?? null;
  const rankTop = await top(sql`
    with r as (select id, level, xp from guilds where server_id = ${serverId} order by level desc, xp desc, id limit 2)
    select (select id::text from r limit 1) as id,
           (select count(*) from r) = 2 and (select level from r limit 1) = (select level from r offset 1) and (select xp from r limit 1) = (select xp from r offset 1) as tie`);
  const combatRows = await getGuildRanking(serverId, 2, 'combat');
  const combatTop = combatRows[0] && (combatRows.length < 2 || Number(combatRows[0].combat ?? 0) > Number(combatRows[1]!.combat ?? 0)) && Number(combatRows[0].combat ?? 0) > 0
    ? String(combatRows[0].id)
    : null;
  const zoneTop = await top(sql`
    with z as (select owner_guild_id as id, count(*)::int as n from zones where server_id = ${serverId} and owner_guild_id is not null group by owner_guild_id order by n desc, owner_guild_id limit 2)
    select (select id::text from z limit 1) as id, (select count(*) from z) = 2 and (select n from z limit 1) = (select n from z offset 1) as tie`);
  const taxTop = await top(sql`
    with t as (select id, tax_pool_diamond as v from guilds where server_id = ${serverId} and tax_pool_diamond > 0 order by tax_pool_diamond desc, id limit 2)
    select (select id::text from t limit 1) as id, (select count(*) from t) = 2 and (select v from t limit 1) = (select v from t offset 1) as tie`);
  const leaders: [string, string | null][] = [
    ['rank', rankTop?.id && !rankTop.tie ? rankTop.id : null],
    ['combat', combatTop],
    ['zones', zoneTop?.id && !zoneTop.tie ? zoneTop.id : null],
    ['tax', taxTop?.id && !taxTop.tie ? taxTop.id : null],
  ];
  for (const [metric, guildId] of leaders) {
    if (guildId == null) {
      await db.execute(sql`delete from guild_rank_leaders where server_id = ${serverId} and metric = ${metric}`);
      continue;
    }
    await db.execute(sql`
      insert into guild_rank_leaders (server_id, metric, guild_id) values (${serverId}, ${metric}, ${BigInt(guildId)})
      on conflict (server_id, metric) do update
        set guild_id = excluded.guild_id, updated_at = now(),
            since = case when guild_rank_leaders.guild_id <> excluded.guild_id then now() else guild_rank_leaders.since end
    `);
  }
}
