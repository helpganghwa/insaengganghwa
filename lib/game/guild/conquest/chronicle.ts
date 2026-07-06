import 'server-only';

import Anthropic from '@anthropic-ai/sdk';
import { and, desc, eq, lt, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { worldChronicle } from '@/lib/db/schema/guild';
import type { ConquestFinale } from './simulate';

const MODEL_ID = 'claude-sonnet-5';

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
  /** 공격 측 — 그날 각 구역을 공격한(role=attack 배치) 길드(구역×길드 distinct). */
  attacks: { zone: string; region: string; guild: string }[];
  /** 주목할 개인 활약(그날 finale 기준 — 최다 수비/처치). '처치'는 공·수 역할 무관 쓰러뜨린 수. */
  feats: { nickname: string; guild: string; kind: '수비' | '처치'; count: number }[];
};

/** kstDay(YYYY-MM-DD)에 일수 가감 — 날짜 문자열 산술(UTC 정오 기준, DST 무관). */
function addDaysToKstDay(kstDay: string, delta: number): string {
  const d = new Date(`${kstDay}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** 연대기 마커 제거 — {g|이름}/{u|이름}/{z|이름} → 이름(맥락 전달용 평문화). */
function stripMarkers(s: string): string {
  return s.replace(/\{[guz]\|([^}]+)\}+/g, '$1');
}

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
export async function aggregateConquestDay(kstDay: string, serverId: number): Promise<ConquestDaySummary> {
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
    where cb.battle_kst_day = ${kstDay} and cb.server_id = ${serverId}
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
    where z.server_id = ${serverId}
    group by g.name order by zones desc limit 6
  `)) as unknown as { guild: string; zones: number }[];

  // 공격 측 — 그날 공격 배치(role=attack)한 길드(구역×길드 distinct). 누가 공격했는지의 진실 원천.
  const attackRows = (await db.execute(sql`
    select distinct z.name as zone, z.region::text as region, g.name as guild
    from guild_battle_deployments d
    join zones z on z.id = d.zone_id
    join guilds g on g.id = d.guild_id
    where d.battle_kst_day = ${kstDay} and d.server_id = ${serverId} and d.role = 'attack'
  `)) as unknown as { zone: string; region: string; guild: string }[];
  const attacks = attackRows.map((a) => ({ zone: a.zone, region: REGION_KO[a.region] ?? a.region, guild: a.guild }));

  const topSurvive = [...survives.values()].sort((a, b) => b.n - a.n)[0];
  const topKill = [...kills.values()].sort((a, b) => b.n - a.n)[0];
  const feats: ConquestDaySummary['feats'] = [];
  if (topSurvive && topSurvive.n >= 3)
    feats.push({ nickname: topSurvive.nick, guild: topSurvive.guild, kind: '수비', count: topSurvive.n });
  if (topKill && topKill.n >= 3)
    feats.push({ nickname: topKill.nick, guild: topKill.guild, kind: '처치', count: topKill.n });

  return {
    kstDay,
    battleCount: battles.length,
    captures,
    defenses,
    standings: standingsRows,
    attacks,
    feats,
  };
}

const SYSTEM_PROMPT = `너는 대륙의 정복 전쟁을 듣는 이에게 들려주는 이야기꾼이다. 길드들이 구역을 두고 벌인 일을 말하듯이 풀어 전한다.

규칙:
- 한국어. 듣는 사람에게 전말을 차근차근 들려주듯 자연스러운 구어체. 다만 과장·감탄 남발·영웅 서사시·미사여구 도배는 금지(담담하되 말하듯).
- 이름은 종류별 마커로 감싼다(강조용). 마커 안에는 이름 토큰만 넣고, 조사·'전역'·'일대' 같은 수식어는 마커 밖에 둔다.
  마커는 여는 중괄호 1개 + 닫는 중괄호 1개로 끝낸다(겹쳐 쓰지 말 것: {z|왕성}} 금지, {z|왕성} 만):
  - 길드 이름 → {g|이름}
  - 인물(사용자) 이름 → {u|이름}
  - 개별 구역 이름 → {z|이름}   (예: {z|왕성}, {z|대성당}, {z|성문})
  - 지역(왕국·드래곤 화산·잊힌 신전·슬라임 늪·오크 부락·타락 천사 부유섬)에는 마커를 쓰지 않는다(일반 텍스트). 지역명은 주어진 이름 그대로 쓴다.
  - ★중요★ '점령전 정리'에서 「」로 감싼 이름은 바로 앞의 분류(길드/구역/인물)를 그대로 따른다: '길드 「X」'는 반드시 {g|X}, '구역 「X」'는 반드시 {z|X}, '인물 「X」'는 반드시 {u|X}. 구역 이름을 절대 {g|}(길드)로 쓰지 말 것 — 구역명과 길드명은 서로 다르며 혼동하면 안 된다. 공격의 주어는 '길드', 목적어는 '구역'이다.
- 시각·시간대 표현 금지(정오·아침·저녁·새벽·밤·자정, '종이 울리자' 등).
- 시간을 가리키는 지시어('그날·이날·오늘·그 날·하루·당일' 등)를 쓰지 말 것. 특히 문단·문장을 그런 단어로 시작하지 말고, 바로 사건·길드·구역으로 시작한다. 오늘 일어난 일은 '오늘' 대신 '이번 전투·이번에' 또는 그냥 동사로 서술한다.
- 단, 전날과의 연속성을 말할 때는 '어제·전날·이전'을 써도 된다(흐름 표현용). 이때도 현재 일은 '오늘'이 아니라 '이번에·이번 전투'로 받는다(예: "어제 세 곳에 이어 이번에 두 곳을 더해").
- '인생강화'라는 단어, 이모지·이모티콘 절대 금지. 대륙·세계는 고유명 없이 '대륙' 등으로만 칭한다.
- 주어진 '점령전 정리'만 근거로 쓴다. 없는 사실을 지어내지 않는다.
- **공격한 길드(공격 측)는 반드시 '공격 측' 목록을 그대로 따른다.** 그 목록에 적힌 길드만이 공격한 길드다. 소유 길드(방어 측)가 공격했다고 절대 쓰지 말 것 — 방어 측은 공격을 '받아낸' 쪽이다. '공격 측'이 비어 있으면 누가 공격했는지 단정하지 말고 막연히 쓰지 말 것.
- **점령(captures)은 각 구역의 winner(점령 길드)를 그대로 따른다. 서로 다른 길드가 각자 다른 구역을 점령했으면 길드별로 구분해서 쓴다 — 여러 길드의 점령을 한 길드가 모두 한 것처럼 절대 합치지 않는다.** (예: 한 길드가 두 구역, 다른 길드가 한 구역을 점령했으면 둘 다 기록.)
- 방어(defenses)는 '점령'이 아니다(이미 소유한 구역을 '공격 측'의 공격으로부터 지켜낸 것). 점령 수에 포함하지 말고, 방어는 방어로만 서술한다.
- **개인 활약(feats)의 '처치'는 적을 쓰러뜨린 수이며 공격·수비 역할과 무관하다 — 방어 측 인물도 처치가 많을 수 있다. '처치'가 많다는 이유로 그 인물·길드를 공격 측으로 단정하지 말 것**(공격 측은 오직 '공격 측' 목록으로만 판단). '수비'는 공격을 받아내고 버틴 횟수다.
- '대륙 지배', '천하', '제패' 같은 과장된 총평·결론 금지. 일어난 사실만 적는다.
- 반드시 JSON만 출력: {"today": "...", "headline": "..."}.
  - today: 역사가가 그날 대륙에서 벌어진 일을 하나의 이야기로 풀어 들려주듯 쓴다. 아래 네 가지를 반드시 이야기 안에 녹이되, 각각을 별개 문단·라벨로 나누지 말고 사건 → 결과 → 그 의미 → 형세로 흐르는 하나의 인과 서사로 이어 쓴다(보고서 항목 나열이 아니라, 처음부터 끝까지 이어지는 한 편의 이야기):
    · 어떤 길드가 어느 구역을 노리고 부딪혔는지 — 전투의 발단과 흐름.
    · 누가 어느 구역을 점령했고 누가 막아냈는지 — 점령과 방어를 구분해서.
    · 무엇이 승패를 갈랐고 누가 활약했는지 — 개인 활약(feats)과 전투가 갈린 지점.
    · 그래서 이번 전투 이후 대륙의 형세가 어떻게 되었는지 — 영토 순위·기세(과장 없이 사실만).
    문단은 이야기 흐름에 따라 자연스럽게 나눈다(2~4문단, 어느 문단도 한 파트만 전담하지 않게 — 사건과 결과가 한 문단에서 이어지거나 활약이 결과 서술에 섞여도 좋다). 문단 사이는 빈 줄(\\n\\n)로 구분. 라벨('주요사건:' 등) 금지. 어느 문단도 '그날·이날·오늘' 같은 시간 지시어로 시작하지 말고 바로 길드·구역·사건으로 시작한다.
  - headline: 핵심 사건을 한 줄로 압축(25자 내외, 마커 포함, 말하듯이). 점령 길드가 여럿이면 가장 많이 점령한 쪽 위주로 쓰되 다른 길드의 점령도 가능하면 담는다. 예: "{g|천둥길드}가 {z|왕성} 등 세 곳을 휩쓸었다". 정세가 크게 바뀐 날이 아니면 빈 문자열("")로 둔다.`;

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
  serverId: number,
): Promise<{ created: boolean; reason?: string }> {
  const [existing] = await db
    .select({ kstDay: worldChronicle.kstDay })
    .from(worldChronicle)
    .where(and(eq(worldChronicle.serverId, serverId), eq(worldChronicle.kstDay, kstDay)))
    .limit(1);
  if (existing) return { created: false, reason: 'already' };

  const summary = await aggregateConquestDay(kstDay, serverId);
  if (!isNotable(summary)) return { created: false, reason: 'no-event' };

  // 길드별로 미리 그룹핑한 명확한 요약 — 모델이 captures를 한 길드로 합치지 않게(정확 귀속).
  const capByGuild = new Map<string, string[]>();
  for (const c of summary.captures) {
    const arr = capByGuild.get(c.winner) ?? [];
    arr.push(c.zone);
    capByGuild.set(c.winner, arr);
  }
  // 모든 항목에 (길드)/(구역) 라벨을 붙여 모델이 둘을 혼동·오마킹하지 않게(구역명을 길드로 쓰는 버그 방지).
  const capLines =
    [...capByGuild.entries()]
      .map(([g, zs]) => `· 길드 「${g}」 이(가) 구역 ${zs.map((z) => `「${z}」`).join(', ')} 을(를) 점령 (총 ${zs.length}곳)`)
      .join('\n') || '· (신규 점령 없음)';
  // 공격 측(role=attack) — 누가 어느 구역을 공격했는지. 구역별로 길드 묶음(공격 길드 정확 귀속).
  const atkByZone = new Map<string, string[]>();
  for (const a of summary.attacks) {
    const arr = atkByZone.get(a.zone) ?? [];
    arr.push(a.guild);
    atkByZone.set(a.zone, arr);
  }
  // 주어-목적어 순서 명시: "길드 「G」 이(가) 구역 「Z」 을(를) 공격" — zone:guild 콜론 포맷이 주어 오독을 유발했음.
  const atkLines =
    [...atkByZone.entries()]
      .map(([z, gs]) => `· 길드 「${[...new Set(gs)].join('」, 「')}」 이(가) 구역 「${z}」 을(를) 공격`)
      .join('\n') || '· (공격 측 없음)';
  const defLines =
    summary.defenses.map((d) => `· 길드 「${d.owner}」 이(가) 구역 「${d.zone}」 을(를) 방어`).join('\n') ||
    '· (방어 없음)';
  // 활약 문구를 자명하게: '처치'=적 N명 쓰러뜨림(공·수 무관), '수비'=공격 N회 받아내고 버팀.
  const featLines =
    summary.feats
      .map((f) =>
        f.kind === '처치'
          ? `· 인물 「${f.nickname}」 (소속 길드 「${f.guild}」): 적 ${f.count}명 처치(공·수 역할 무관, 쓰러뜨린 수)`
          : `· 인물 「${f.nickname}」 (소속 길드 「${f.guild}」): 공격 ${f.count}회 받아내고 버팀(수비)`,
      )
      .join('\n') || '· (없음)';
  const digest =
    `[점령전 정리 — 이 귀속을 그대로 따를 것]\n` +
    `■ 공격 측(구역을 공격한 길드):\n${atkLines}\n` +
    `■ 신규 점령(길드별):\n${capLines}\n` +
    `■ 방어(점령 아님 — 소유 길드가 위 공격을 막아냄):\n${defLines}\n` +
    `■ 개인 활약:\n${featLines}`;

  // ── 연속성 맥락(참고용) — 오늘의 사실은 위 정리만 따르되, 흐름·판도는 아래를 참고해 이어 쓴다. ──
  // 현재 영토 현황(누적 점령 결과) — '정세' 문단 근거.
  const standLines =
    summary.standings.map((s) => `· 길드 「${s.guild}」: ${s.zones}곳 보유`).join('\n') || '· (보유 길드 없음)';

  // 어제 점령전 결과(있으면) — 전날과의 연속성.
  const prevDay = addDaysToKstDay(kstDay, -1);
  const y = await aggregateConquestDay(prevDay, serverId);
  const yCapByGuild = new Map<string, string[]>();
  for (const c of y.captures) {
    const arr = yCapByGuild.get(c.winner) ?? [];
    arr.push(c.zone);
    yCapByGuild.set(c.winner, arr);
  }
  const yCapLines = [...yCapByGuild.entries()].map(([g, zs]) => `· ${g}: ${zs.join(', ')}`).join('\n');
  const yDefLines = y.defenses.map((d) => `· ${d.owner}: ${d.zone} 방어`).join('\n');
  const yesterdayBlock =
    y.battleCount === 0
      ? `· (어제 점령전 없음)`
      : `■ 점령:\n${yCapLines || '· (없음)'}\n■ 방어:\n${yDefLines || '· (없음)'}`;

  // 어제까지 누적 역사 연표(헤드라인) — 마커 제거한 평문, 최신순.
  const histRows = await db
    .select({ kstDay: worldChronicle.kstDay, headline: worldChronicle.headline })
    .from(worldChronicle)
    .where(
      and(
        eq(worldChronicle.serverId, serverId),
        lt(worldChronicle.kstDay, kstDay),
        sql`length(${worldChronicle.headline}) > 0`,
      ),
    )
    .orderBy(desc(worldChronicle.kstDay))
    .limit(20);
  const histLines = histRows.map((h) => `· ${String(h.kstDay)}: ${stripMarkers(h.headline)}`).join('\n');
  const context =
    `[현재 영토 현황 — '정세' 문단 근거(누적 점령 결과)]\n${standLines}\n\n` +
    `[어제(${prevDay}) 점령전 결과 — 연속성 참고용]\n${yesterdayBlock}\n\n` +
    `[지난 역사 — 어제까지 누적, 흐름 참고용]\n${histLines || '· (이전 기록 없음)'}`;

  const bigChange = isBigChange(summary);
  const res = await client().messages.create({
    model: MODEL_ID,
    max_tokens: 1100,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [
      {
        role: 'user',
        content:
          `${kstDay} 점령전 기록.\n\n${digest}\n\n${context}\n\n` +
          `공격한 길드는 '공격 측' 목록만 따라라 — 소유(방어) 길드가 공격했다고 쓰지 말 것. 방어 측은 공격을 받아낸 쪽이다. '처치'가 많은 인물도 방어 측일 수 있으니 처치 수로 공격 측을 단정하지 말 것.\n` +
          `위 '신규 점령(길드별)'을 정확히 따라라 — 한 길드의 점령을 다른 길드로 옮기거나 여러 길드 점령을 한 길드로 합치지 말 것. 방어는 점령으로 세지 말 것.\n` +
          `[현재 영토 현황]·[어제 점령전 결과]·[지난 역사]는 흐름·판도 참고용이다. 오늘의 사실(점령/방어/활약)은 반드시 '[점령전 정리]'만 따르고, 어제·과거의 점령을 오늘 것으로 적지 말 것.\n` +
          `이야기 끝의 '형세'(정세) 대목은 '[현재 영토 현황]'(누적 보유 구역 수)을 반영하고, 어제·지난 역사와 자연스럽게 이어지도록 연속성 있게 맺는다. 현재 일은 '오늘' 대신 '이번에·이번 전투'로 받는다(예: "어제 세 곳에 이어 이번에 두 곳을 더해 현재 다섯 곳을 보유").\n` +
          `today는 역사가가 그날의 일을 하나의 이야기로 풀어 들려주듯 쓴다 — 사건→결과→그 의미→형세를 별개 문단·라벨로 쪼개지 말고 인과로 이어지는 단일 서사로. 문단은 흐름에 따라 자연스럽게(2~4문단), '그날·이날·오늘' 같은 시간 지시어로 문단을 시작하지 말 것.\n` +
          (bigChange
            ? `이번 전투는 정세가 크게 바뀐 경우 — headline에 핵심 사건 한 줄을 쓴다.\n`
            : `이번 전투는 정세가 크게 바뀐 경우가 아님 — headline은 반드시 빈 문자열("")로 둔다.\n`) +
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
  // 결정론 마커 교정 — 코드가 아는 정답(길드/구역 이름)으로 LLM 오마킹 보정.
  // {g|이름}인데 이름이 구역명에만 있으면 {z|}로, {z|이름}인데 길드명에만 있으면 {g|}로 강제.
  // 동명(길드명=구역명)이면 모델 출력 유지(어느 쪽인지 코드도 불가). cf. 2026-06-20 '기사 연무장' 버그.
  const guildNames = new Set<string>();
  const zoneNames = new Set<string>();
  for (const c of summary.captures) { guildNames.add(c.winner); zoneNames.add(c.zone); }
  for (const a of summary.attacks) { guildNames.add(a.guild); zoneNames.add(a.zone); }
  for (const d of summary.defenses) { guildNames.add(d.owner); zoneNames.add(d.zone); }
  for (const f of summary.feats) guildNames.add(f.guild);
  for (const s of summary.standings) guildNames.add(s.guild);
  const correctMarkers = (s: string) =>
    s.replace(/\{([gz])\|([^}]+)\}/g, (mm, t: string, name: string) => {
      const n = name.trim();
      const isG = guildNames.has(n);
      const isZ = zoneNames.has(n);
      if (t === 'g' && isZ && !isG) return `{z|${name}}`;
      if (t === 'z' && isG && !isZ) return `{g|${name}}`;
      return mm;
    });
  // 마커 누락 강제(2026-07-05 사건: 본문 전체 마커 0, 「이름」 평문 노출) — LLM 준수에
  // 의존하지 않고 코드가 아는 이름을 결정론적으로 마킹. 기존 마커 구간은 보존, 동명
  // (길드=구역 등 두 종류에 존재)은 종류 판정 불가라 건너뜀. 긴 이름 우선(부분 문자열 오마킹 방지).
  const userNames = new Set<string>(summary.feats.map((f) => f.nickname));
  const wrapOutsideMarkers = (text: string, find: string, repl: string): string =>
    text
      .split(/(\{[guz]\|[^}]+\}+)/g)
      .map((seg, i) => (i % 2 === 1 ? seg : seg.replaceAll(find, repl)))
      .join('');
  const enforceMarkers = (s: string): string => {
    const ambiguous = new Set(
      [...guildNames, ...zoneNames, ...userNames].filter(
        (n) =>
          Number(guildNames.has(n)) + Number(zoneNames.has(n)) + Number(userNames.has(n)) > 1,
      ),
    );
    const items = [
      ...[...guildNames].map((n) => ({ k: 'g' as const, n })),
      ...[...userNames].map((n) => ({ k: 'u' as const, n })),
      ...[...zoneNames].map((n) => ({ k: 'z' as const, n })),
    ]
      .filter((it) => it.n.length >= 2 && !ambiguous.has(it.n))
      .sort((a, b) => b.n.length - a.n.length);
    let out = s;
    for (const { k, n } of items) {
      out = wrapOutsideMarkers(out, `「${n}」`, `{${k}|${n}}`);
      out = wrapOutsideMarkers(out, n, `{${k}|${n}}`);
    }
    return out;
  };
  const today = enforceMarkers(correctMarkers(fixBraces((parsed.today ?? '').trim())));
  // 헤드라인('전체' 연표)은 정세가 크게 바뀐 날만 — 아니면 빈 문자열(연표 미노출).
  const headline = bigChange
    ? enforceMarkers(correctMarkers(fixBraces((parsed.headline ?? '').trim())))
    : '';
  if (!today) throw new Error('CHRONICLE_EMPTY');
  if (bigChange && !headline) throw new Error('CHRONICLE_EMPTY');

  await db
    .insert(worldChronicle)
    .values({
      serverId, kstDay, todayText: today, headline })
    .onConflictDoNothing({ target: [worldChronicle.serverId, worldChronicle.kstDay] });
  return { created: true };
}

export type ChronicleData = {
  /** '오늘' — 최신 기록일의 긴 스토리(없으면 null). */
  today: string | null;
  /** '전체' — 큰 사건이 있던 날들의 (날짜·한 줄) 리스트(최신순). */
  list: { kstDay: string; headline: string }[];
};

/** 세계지도 하단 표시용 — 오늘(최신 스토리) + 전체(날짜별 헤드라인 리스트). */
export async function getChronicle(serverId: number): Promise<ChronicleData> {
  const rows = await db
    .select({
      kstDay: worldChronicle.kstDay,
      todayText: worldChronicle.todayText,
      headline: worldChronicle.headline,
    })
    .from(worldChronicle)
    .where(eq(worldChronicle.serverId, serverId))
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
