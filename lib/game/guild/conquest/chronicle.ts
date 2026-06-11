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

// 지역 풀네임(줄임말 금지) — 세계지도 REGION 라벨과 일치.
const REGION_KO: Record<string, string> = {
  volcano: '드래곤 화산',
  temple: '잊힌 신전',
  swamp: '슬라임 늪',
  orc: '오크 부락',
  kingdom: '왕국',
  angel: '타락 천사 부유섬',
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

const SYSTEM_PROMPT = `너는 대륙의 정복 전쟁을 듣는 이에게 들려주는 이야기꾼이다. 그날 길드들이 구역을 두고 벌인 일을 말하듯이 풀어 전한다.

규칙:
- 한국어. 듣는 사람에게 그날의 전말을 차근차근 들려주듯 자연스러운 구어체. 다만 과장·감탄 남발·영웅 서사시·미사여구 도배는 금지(담담하되 말하듯).
- 이름은 종류별 마커로 감싼다(강조용). 마커 안에는 이름 토큰만 넣고, 조사·'전역'·'일대' 같은 수식어는 마커 밖에 둔다.
  마커는 여는 중괄호 1개 + 닫는 중괄호 1개로 끝낸다(겹쳐 쓰지 말 것: {z|왕성}} 금지, {z|왕성} 만):
  - 길드 이름 → {g|이름}
  - 인물(사용자) 이름 → {u|이름}
  - 개별 구역 이름 → {z|이름}   (예: {z|왕성}, {z|대성당}, {z|성문})
  - 지역(왕국·드래곤 화산·잊힌 신전·슬라임 늪·오크 부락·타락 천사 부유섬)에는 마커를 쓰지 않는다(일반 텍스트). 지역명은 주어진 이름 그대로 쓴다.
- 시각·시간대 표현 금지(정오·아침·저녁·새벽·밤·자정, '종이 울리자' 등). 날짜·하루 단위 서술만 허용.
- '인생강화'라는 단어, 이모지·이모티콘 절대 금지. 대륙·세계는 고유명 없이 '대륙' 등으로만 칭한다.
- 주어진 '그날 사건'만 근거로 쓴다. 없는 사실을 지어내지 않는다.
- **점령(captures)은 각 구역의 winner(점령 길드)를 그대로 따른다. 서로 다른 길드가 각자 다른 구역을 점령했으면 길드별로 구분해서 쓴다 — 여러 길드의 점령을 한 길드가 모두 한 것처럼 절대 합치지 않는다.** (예: 한 길드가 두 구역, 다른 길드가 한 구역을 점령했으면 둘 다 기록.)
- 방어(defenses)는 '점령'이 아니다(이미 소유한 구역을 지켜낸 것). 점령 수에 포함하지 말고, 방어는 방어로만 서술한다.
- '대륙 지배', '천하', '제패' 같은 과장된 총평·결론 금지. 그날 일어난 사실만 적는다.
- 반드시 JSON만 출력: {"today": "...", "headline": "..."}.
  - today: 그날의 이야기를 정확히 4개 문단으로 나눠 쓴다. 문단 사이는 빈 줄(\\n\\n)로 구분. 각 문단은 2~4문장, 말하듯이. 문단마다 '주요사건:' 같은 라벨을 붙이지 말고 내용만 자연스럽게 쓴다. 네 문단의 순서와 역할은 고정:
    1) 주요 사건 — 그날 어떤 길드가 어느 구역을 노리고 부딪혔는지, 전투의 시작과 흐름.
    2) 결과 — 누가 어느 구역을 점령했고 누가 막아냈는지(점령/방어 구분).
    3) 평가 — 개인 활약(feats)·전투가 어떻게 갈렸는지·승패를 가른 지점.
    4) 정세 — 그날 이후 대륙의 형세(영토 순위·기세). 과장 없이 사실만.
  - headline: 그날을 한 줄로 압축한 핵심 사건(25자 내외, 마커 포함, 말하듯이). 점령 길드가 여럿이면 가장 많이 점령한 쪽 위주로 쓰되 다른 길드의 점령도 가능하면 담는다. 예: "{g|천둥길드}가 {z|왕성} 등 세 곳을 휩쓸었다". 정세가 크게 바뀐 날이 아니면 빈 문자열("")로 둔다.`;

/** 그날 사건이 '큰 사건'인지 — 점령(영토 변동) 또는 주목할 개인 활약이 있으면 기록 대상('오늘' 스토리). */
function isNotable(s: ConquestDaySummary): boolean {
  return s.captures.length > 0 || s.feats.length > 0;
}

/**
 * '전체'(헤드라인) 기록 대상 — 대륙의 정세가 크게 바뀌거나 특별한 기록이 있는 날만.
 *  · 길드 간 영토 탈취(from!=null: 한 길드가 다른 길드 구역을 빼앗음 = 전선 이동)
 *  · 하루 2곳 이상 점령(대규모 변동)
 *  · 특별한 개인 활약(단일 전투 다수 처치/수비 — 임계 5회 이상)
 *  단발 중립 점령·소소한 방어만 있는 날은 '오늘'엔 남되 '전체' 연표엔 올리지 않는다.
 */
function isBigChange(s: ConquestDaySummary): boolean {
  const takenFromGuild = s.captures.some((c) => c.from != null);
  const multiCapture = s.captures.length >= 2;
  const specialFeat = s.feats.some((f) => f.count >= 5);
  return takenFromGuild || multiCapture || specialFeat;
}

/**
 * 그날 연대기 생성·저장(멱등) — 그날 점령전 요약을 AI가 기록.
 * 이미 그날 행이 있으면 skip. 큰 사건 없으면 기록 안 함(별일 없는 날). KEY 없으면 throw.
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

  const summary = await aggregateConquestDay(kstDay);
  if (!isNotable(summary)) return { created: false, reason: 'no-event' };

  // 길드별로 미리 그룹핑한 명확한 요약 — 작은 모델이 captures를 한 길드로 합치지 않게(정확 귀속).
  const capByGuild = new Map<string, string[]>();
  for (const c of summary.captures) {
    const arr = capByGuild.get(c.winner) ?? [];
    arr.push(c.zone);
    capByGuild.set(c.winner, arr);
  }
  const capLines =
    [...capByGuild.entries()].map(([g, zs]) => `· ${g}: ${zs.join(', ')} (총 ${zs.length}곳 점령)`).join('\n') ||
    '· (신규 점령 없음)';
  const defLines = summary.defenses.map((d) => `· ${d.owner}: ${d.zone} 방어`).join('\n') || '· (방어 없음)';
  const featLines = summary.feats.map((f) => `· ${f.nickname}(${f.guild}) ${f.kind} ${f.count}회`).join('\n') || '· (없음)';
  const digest =
    `[그날 점령전 정리 — 이 귀속을 그대로 따를 것]\n` +
    `■ 신규 점령(길드별):\n${capLines}\n■ 방어(점령 아님):\n${defLines}\n■ 개인 활약:\n${featLines}`;

  const bigChange = isBigChange(summary);
  const res = await client().messages.create({
    model: MODEL_ID,
    max_tokens: 1100,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [
      {
        role: 'user',
        content:
          `그날(${kstDay}) 점령전.\n\n${digest}\n\n` +
          `위 '신규 점령(길드별)'을 정확히 따라라 — 한 길드의 점령을 다른 길드로 옮기거나 여러 길드 점령을 한 길드로 합치지 말 것. 방어는 점령으로 세지 말 것.\n` +
          `today는 정확히 4문단(주요사건→결과→평가→정세), 각 문단 라벨 없이 말하듯이.\n` +
          (bigChange
            ? `오늘은 정세가 크게 바뀐 날 — headline에 핵심 사건 한 줄을 쓴다.\n`
            : `오늘은 정세가 크게 바뀐 날이 아님 — headline은 반드시 빈 문자열("")로 둔다.\n`) +
          `마커: 길드={g|}, 인물={u|}, 개별 구역(zone)={z|}. 지역은 마커 없이.\n\n` +
          `위 규칙대로 JSON({today, headline})만 출력하라.`,
      },
    ],
  });
  const block = res.content.find((b) => b.type === 'text');
  const raw = block && 'text' in block ? block.text : '';
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) throw new Error(`CHRONICLE_PARSE_FAIL: ${raw.slice(0, 200)}`);
  const parsed = JSON.parse(m[0]) as { today?: string; headline?: string };
  // 마커 닫는 중괄호 겹침({g|신화}}) 정규화 — 마커 뒤 여분 } 제거(저장 깔끔).
  const fixBraces = (s: string) => s.replace(/(\{[guz]\|[^}]+)\}{2,}/g, '$1}');
  const today = fixBraces((parsed.today ?? '').trim());
  // 헤드라인('전체' 연표)은 정세가 크게 바뀐 날만 — 아니면 빈 문자열(연표 미노출).
  const headline = bigChange ? fixBraces((parsed.headline ?? '').trim()) : '';
  if (!today) throw new Error('CHRONICLE_EMPTY');
  if (bigChange && !headline) throw new Error('CHRONICLE_EMPTY');

  await db
    .insert(worldChronicle)
    .values({ kstDay, todayText: today, headline })
    .onConflictDoNothing({ target: worldChronicle.kstDay });
  return { created: true };
}

export type ChronicleData = {
  /** '오늘' — 최신 기록일의 긴 스토리(없으면 null). */
  today: string | null;
  /** '전체' — 큰 사건이 있던 날들의 (날짜·한 줄) 리스트(최신순). */
  list: { kstDay: string; headline: string }[];
};

/** 세계지도 하단 표시용 — 오늘(최신 스토리) + 전체(날짜별 헤드라인 리스트). */
export async function getChronicle(): Promise<ChronicleData> {
  const rows = await db
    .select({
      kstDay: worldChronicle.kstDay,
      todayText: worldChronicle.todayText,
      headline: worldChronicle.headline,
    })
    .from(worldChronicle)
    .orderBy(sql`${worldChronicle.kstDay} desc`)
    .limit(120);
  return {
    today: rows[0]?.todayText ?? null,
    // '전체' 연표 — 헤드라인이 있는 날(정세가 크게 바뀐 날)만 노출.
    list: rows
      .filter((r) => r.headline && r.headline.trim().length > 0)
      .map((r) => ({ kstDay: String(r.kstDay), headline: r.headline })),
  };
}
