import 'server-only';

import Anthropic from '@anthropic-ai/sdk';
import { eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { worldChronicle } from '@/lib/db/schema/guild';
import type { ConquestFinale } from './simulate';

const MODEL_ID = 'claude-haiku-4-5-20251001';

let _client: Anthropic | null = null;
function client(): Anthropic {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY missing');
  return (_client ??= new Anthropic({ apiKey: key }));
}

/** 그날 점령전 요약 — AI 입력용 구조화 신호(점령/방어/최초점령/영토순위/개인 활약). */
export type ConquestDaySummary = {
  kstDay: string;
  battleCount: number;
  /** 점령(소유권 변경) — winner가 prevOwner로부터 빼앗음(prevOwner null=중립 첫 점령). */
  captures: { zone: string; region: string; winner: string; from: string | null; firstCapture: boolean }[];
  /** 방어 성공(소유 길드 유지). */
  defenses: { zone: string; region: string; owner: string }[];
  /** 영토 순위(그날 이후 보유 구역 수, 상위). */
  standings: { guild: string; zones: number }[];
  /** 주목할 개인 활약(그날 finale 기준 — 최다 수비/공격). */
  feats: { nickname: string; guild: string; kind: '수비' | '공격'; count: number }[];
};

const REGION_KO: Record<string, string> = {
  volcano: '화산',
  temple: '신전',
  swamp: '늪지',
  orc: '오크',
  kingdom: '왕국',
  angel: '천사',
};

/** 그날(kstDay) 점령전 결과를 집계 — 사건 없으면 battleCount 0. */
export async function aggregateConquestDay(kstDay: string): Promise<ConquestDaySummary> {
  const battles = (await db.execute(sql`
    select z.name as zone, z.region::text as region, z.captured_at as captured_at,
           g.name as winner, cb.finale as finale,
           (select g2.name from conquest_battles cb2
              join guilds g2 on g2.id = cb2.winner_guild_id
              where cb2.zone_id = cb.zone_id and cb2.battle_kst_day < ${kstDay}
              order by cb2.battle_kst_day desc limit 1) as prev_owner
    from conquest_battles cb
    join zones z on z.id = cb.zone_id
    left join guilds g on g.id = cb.winner_guild_id
    where cb.battle_kst_day = ${kstDay}
  `)) as unknown as {
    zone: string;
    region: string;
    captured_at: Date | null;
    winner: string | null;
    finale: ConquestFinale | null;
    prev_owner: string | null;
  }[];

  const captures: ConquestDaySummary['captures'] = [];
  const defenses: ConquestDaySummary['defenses'] = [];
  // 개인 활약 — 그날 전 battle의 finale 합산(유저별 수비 성공·처치).
  const survives = new Map<string, { nick: string; guild: string; n: number }>();
  const kills = new Map<string, { nick: string; guild: string; n: number }>();

  for (const b of battles) {
    if (!b.winner) continue;
    const region = REGION_KO[b.region] ?? b.region;
    const capturedToday =
      b.captured_at != null &&
      new Date(b.captured_at).toISOString().slice(0, 10) === kstDay;
    if (capturedToday) {
      captures.push({
        zone: b.zone,
        region,
        winner: b.winner,
        from: b.prev_owner,
        firstCapture: b.prev_owner == null,
      });
    } else {
      defenses.push({ zone: b.zone, region, owner: b.winner });
    }
    const f = b.finale;
    if (f?.roster && f.events) {
      for (const [a, t, , hp] of f.events) {
        if (hp <= 0) {
          const ru = f.roster[a];
          if (ru) {
            const e = kills.get(ru.userId) ?? { nick: ru.nickname, guild: ru.guildName, n: 0 };
            e.n += 1;
            kills.set(ru.userId, e);
          }
        } else {
          const rt = f.roster[t];
          if (rt) {
            const e = survives.get(rt.userId) ?? { nick: rt.nickname, guild: rt.guildName, n: 0 };
            e.n += 1;
            survives.set(rt.userId, e);
          }
        }
      }
    }
  }

  const standingsRows = (await db.execute(sql`
    select g.name as guild, count(*)::int as zones
    from zones z join guilds g on g.id = z.owner_guild_id
    group by g.name order by zones desc limit 6
  `)) as unknown as { guild: string; zones: number }[];

  const topSurvive = [...survives.values()].sort((a, b) => b.n - a.n)[0];
  const topKill = [...kills.values()].sort((a, b) => b.n - a.n)[0];
  const feats: ConquestDaySummary['feats'] = [];
  if (topSurvive && topSurvive.n >= 3)
    feats.push({ nickname: topSurvive.nick, guild: topSurvive.guild, kind: '수비', count: topSurvive.n });
  if (topKill && topKill.n >= 3)
    feats.push({ nickname: topKill.nick, guild: topKill.guild, kind: '공격', count: topKill.n });

  return {
    kstDay,
    battleCount: battles.length,
    captures,
    defenses,
    standings: standingsRows,
    feats,
  };
}

const SYSTEM_PROMPT = `너는 판타지 대륙 '인생강화'의 연대기 사관이다. 길드들이 매일 정오 구역을 두고 다투는 정복 전쟁의 역사를 기록한다.

규칙:
- 한국어. 판타지 연대기/서사 톤. 담백하거나 일상적인 말투 금지.
- 길드 이름과 구역 이름을 그대로 인용해 생동감을 준다.
- 짧고 강렬하게. 과장된 미사여구 남발 금지. 밝음·기개와 비장함을 균형 있게(밝음 우세).
- 주어진 '그날 사건'만 근거로 쓴다. 사건이 없으면 고요한 하루로 담담히 적는다.
- 반드시 JSON만 출력: {"today": "...", "full": "..."}.
  - today: 그날의 정세 브리핑 2~4문장.
  - full: '이전 연대기'를 이어받아 그날 사건을 더해 갱신한 통합 서사. 오래된 사건은 압축·전설화하고 최근은 구체적으로. 전체 8~14문장 이내로 유지(무한히 늘리지 말 것).`;

/**
 * 그날 연대기 생성·저장(멱등) — 직전 통합 서사 + 그날 점령전 요약을 AI가 이어 써 갱신.
 * 이미 그날 행이 있으면 skip. ANTHROPIC_API_KEY 없으면 throw.
 */
export async function generateAndStoreChronicle(
  kstDay: string,
): Promise<{ created: boolean; reason?: string }> {
  const [existing] = await db
    .select({ kstDay: worldChronicle.kstDay })
    .from(worldChronicle)
    .where(eq(worldChronicle.kstDay, kstDay))
    .limit(1);
  if (existing) return { created: false, reason: 'already' };

  const [prev] = await db
    .select({ full: worldChronicle.fullNarrative })
    .from(worldChronicle)
    .orderBy(sql`${worldChronicle.kstDay} desc`)
    .limit(1);
  const prevNarrative = prev?.full ?? '(아직 기록된 역사가 없다. 이번이 첫 장이다.)';

  const summary = await aggregateConquestDay(kstDay);

  const res = await client().messages.create({
    model: MODEL_ID,
    max_tokens: 900,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [
      {
        role: 'user',
        content: `이전 연대기:\n${prevNarrative}\n\n그날(${kstDay}) 점령전 사건(JSON):\n${JSON.stringify(summary)}\n\n위 규칙대로 JSON({today, full})만 출력하라.`,
      },
    ],
  });
  const block = res.content.find((b) => b.type === 'text');
  const raw = block && 'text' in block ? block.text : '';
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) throw new Error(`CHRONICLE_PARSE_FAIL: ${raw.slice(0, 200)}`);
  const parsed = JSON.parse(m[0]) as { today?: string; full?: string };
  const today = (parsed.today ?? '').trim();
  const full = (parsed.full ?? '').trim();
  if (!today || !full) throw new Error('CHRONICLE_EMPTY');

  await db
    .insert(worldChronicle)
    .values({ kstDay, todayText: today, fullNarrative: full })
    .onConflictDoNothing({ target: worldChronicle.kstDay });
  return { created: true };
}

/** 최신 연대기(오늘/전체) — 세계지도 하단 표시용. 없으면 null. */
export async function getLatestChronicle(): Promise<{ todayText: string; fullNarrative: string } | null> {
  const [r] = await db
    .select({ todayText: worldChronicle.todayText, fullNarrative: worldChronicle.fullNarrative })
    .from(worldChronicle)
    .orderBy(sql`${worldChronicle.kstDay} desc`)
    .limit(1);
  return r ?? null;
}
