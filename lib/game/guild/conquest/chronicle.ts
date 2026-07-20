import 'server-only';

import Anthropic from '@anthropic-ai/sdk';
import { and, desc, eq, lt, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { worldChronicle } from '@/lib/db/schema/guild';
import { kstDateString } from '@/lib/kst';
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
  /** 점령(소유권 변경) — winner가 prevOwner로부터 빼앗음(prevOwner null=중립 첫 점령).
   * defenders = finale 로스터 중 이전 주인 소속 수(>0이면 교전 끝 함락 — '무혈'로 서술 금지). */
  captures: { zone: string; region: string; winner: string; from: string | null; firstCapture: boolean; defenders: number }[];
  /** 방어 성공(소유 길드 유지). */
  defenses: { zone: string; region: string; owner: string }[];
  /** 영토 순위(그날 이후 보유 구역 수, 상위). */
  standings: { guild: string; zones: number }[];
  /** 공격 측 — 그날 각 구역을 공격한(role=attack 배치) 길드(구역×길드 distinct). */
  attacks: { zone: string; region: string; guild: string }[];
  /** 그날 해산한 길드(world_events guild_disband) — 보유하던 구역이 중립화됨(연대기 서술 재료). */
  disbands: { guildName: string; zones: string[] }[];
  /** 주목할 개인 활약(그날 finale 기준 — 최다 수비/처치). '처치'는 공·수 역할 무관 쓰러뜨린 수. */
  feats: { nickname: string; publicCode: string | null; guild: string; kind: '수비' | '처치'; count: number }[];
};

/** kstDay(YYYY-MM-DD)에 일수 가감 — 날짜 문자열 산술(UTC 정오 기준, DST 무관). */
function addDaysToKstDay(kstDay: string, delta: number): string {
  const d = new Date(`${kstDay}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** 연대기 마커 제거 — {g|이름}/{u|이름}/{z|이름} → 이름(맥락 전달용 평문화). */
function stripMarkers(s: string): string {
  return s.replace(/\{[guz]\|([^}|]+)(?:\|[^}]*)?\}+/g, '$1');
}

/**
 * 모델 JSON 관용 파서 — 모델이 문자열 값 안에 원시 제어문자(실제 줄바꿈 등)를 내보내면
 * JSON.parse가 깨진다(2026-07-18 pregen 3틱 연속 실패: Bad control character/Unterminated string).
 * 1차 그대로 파싱 → 실패 시 문자열 내부의 제어문자만 이스케이프해 재파싱. 실패면 null.
 */
function parseModelJson<T>(raw: string): T | null {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  const s = m[0];
  try {
    return JSON.parse(s) as T;
  } catch {
    let out = '';
    let inStr = false;
    let esc = false;
    for (const ch of s) {
      if (inStr) {
        if (esc) { out += ch; esc = false; continue; }
        if (ch === '\\') { out += ch; esc = true; continue; }
        if (ch === '"') { inStr = false; out += ch; continue; }
        if (ch.charCodeAt(0) < 0x20) {
          out += ch === '\n' ? '\\n' : ch === '\t' ? '\\t' : ch === '\r' ? '' : ' ';
          continue;
        }
        out += ch;
        continue;
      }
      if (ch === '"') inStr = true;
      out += ch;
    }
    try {
      return JSON.parse(out) as T;
    } catch {
      return null;
    }
  }
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
    select z.name as zone, z.region::text as region,
           g.name as winner, cb.finale as finale,
           (select g2.name from conquest_battles cb2
              join guilds g2 on g2.id = cb2.winner_guild_id
              where cb2.zone_id = cb.zone_id and cb2.battle_kst_day < ${kstDay}
              order by cb2.battle_kst_day desc limit 1) as prev_owner,
           exists(select 1 from conquest_battles cb3
              where cb3.zone_id = cb.zone_id and cb3.battle_kst_day < ${kstDay}
                and cb3.winner_guild_id is not null) as had_owner_history
    from conquest_battles cb
    join zones z on z.id = cb.zone_id
    left join guilds g on g.id = cb.winner_guild_id
    where cb.battle_kst_day = ${kstDay} and cb.server_id = ${serverId}
  `)) as unknown as {
    zone: string;
    region: string;
    winner: string | null;
    finale: ConquestFinale | null;
    prev_owner: string | null;
    had_owner_history: boolean;
  }[];

  const captures: ConquestDaySummary['captures'] = [];
  const defenses: ConquestDaySummary['defenses'] = [];
  // 개인 활약 — 그날 전 battle의 finale 합산(유저별 수비 성공·처치).
  const survives = new Map<string, { nick: string; guild: string; n: number }>();
  const kills = new Map<string, { nick: string; guild: string; n: number }>();

  for (const b of battles) {
    if (!b.winner) {
      // 무승부(승자 없음) — 소유 길드가 있으면 '소유 유지'로 방어에 준해 기록(결과 누락 방지).
      if (b.prev_owner) defenses.push({ zone: b.zone, region: REGION_KO[b.region] ?? b.region, owner: b.prev_owner });
      continue;
    }
    const region = REGION_KO[b.region] ?? b.region;
    // 점령/방어는 소유권 이동으로 판정(winner ≠ 직전 소유 길드). captured_at 시각 비교는
    // 공개(reveal)가 전투 다음날 00시(KST)에 찍혀 어느 날짜 기준으로도 전투일과 어긋난다
    // (kstDateString 비교는 항상 불일치 → 전 점령이 방어로 오분류, 07-06 연대기 누락 사건).
    const isCapture = b.winner !== b.prev_owner;
    if (isCapture) {
      captures.push({
        zone: b.zone,
        region,
        winner: b.winner,
        from: b.prev_owner,
        // 소유 이력이 있는데 prev_owner를 못 푼 경우 = 이전 주인 길드가 해산으로 삭제됨 —
        // '첫 점령'이 아니라 '무주지 점령'으로 표기(2026-07-16 점검).
        firstCapture: b.prev_owner == null && !b.had_owner_history,
        // 방어 병력 유무는 defenses(방어 '성공' 목록)가 아니라 finale 로스터로 판정 —
        // 싸우고도 진 방어를 '방어 병력 없음'으로 오표기한 사건(2026-07-17 성문) 방지.
        defenders: b.prev_owner
          ? (b.finale?.roster ?? []).filter((r) => r.guildName === b.prev_owner).length
          : 0,
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

  // 누적 판도 — **as-if-flipped**: 그날 전투의 winner를 소유권에 오버레이해 '공개 후' 기준으로
  // 계산한다. 사전 생성(23시대, 플립 전)에도 정확하고, 공개 후에는 winner=owner라 no-op(멱등).
  const standingsRows = (await db.execute(sql`
    select g.name as guild, count(*)::int as zones
    from zones z
    left join lateral (
      select cb.winner_guild_id from conquest_battles cb
      where cb.zone_id = z.id and cb.server_id = ${serverId}
        and cb.battle_kst_day = ${kstDay} and cb.winner_guild_id is not null
      limit 1
    ) w on true
    join guilds g on g.id = coalesce(w.winner_guild_id, z.owner_guild_id)
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

  const topSurviveE = [...survives.entries()].sort((a, b) => b[1].n - a[1].n)[0];
  const topKillE = [...kills.entries()].sort((a, b) => b[1].n - a[1].n)[0];
  // 인물 publicCode 해소 — 연대기 {u|닉|코드} 링크용(닉네임은 변경 가능, 코드는 불변).
  const featUserIds = [topSurviveE, topKillE].filter((e) => e && e[1].n >= 3).map((e) => e![0]);
  const codeByUser = new Map<string, string>();
  if (featUserIds.length > 0) {
    const codeRows = (await db.execute(sql`
      select id::text as uid, public_code from profiles where id in ${sql`(${sql.join(featUserIds.map((u) => sql`${u}::uuid`), sql`, `)})`}
    `)) as unknown as { uid: string; public_code: string | null }[];
    for (const r of codeRows) if (r.public_code) codeByUser.set(r.uid, r.public_code);
  }
  const feats: ConquestDaySummary['feats'] = [];
  if (topSurviveE && topSurviveE[1].n >= 3)
    feats.push({ nickname: topSurviveE[1].nick, publicCode: codeByUser.get(topSurviveE[0]) ?? null, guild: topSurviveE[1].guild, kind: '수비', count: topSurviveE[1].n });
  if (topKillE && topKillE[1].n >= 3)
    feats.push({ nickname: topKillE[1].nick, publicCode: codeByUser.get(topKillE[0]) ?? null, guild: topKillE[1].guild, kind: '처치', count: topKillE[1].n });

  // 그날 해산(guild_disband) — KST 일자 매칭. 길드 행은 이미 삭제됐으므로 detail 스냅샷이 유일한 소스.
  const disbandRows = (await db.execute(sql`
    select detail from world_events
    where server_id = ${serverId} and type = 'guild_disband'
      and (created_at at time zone 'Asia/Seoul')::date = ${kstDay}::date
  `)) as unknown as { detail: { guildName?: string; zones?: string[] } }[];
  const disbands = disbandRows
    .map((r) => ({ guildName: r.detail?.guildName ?? '길드', zones: r.detail?.zones ?? [] }))
    .filter((d) => d.guildName);

  return {
    kstDay,
    battleCount: battles.length,
    disbands,
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
  - 지역(왕국·드래곤 화산·잊힌 신전·슬라임 늪·오크 부락·타락 천사 부유섬)에는 마커를 쓰지 않는다(일반 텍스트). 지역명은 주어진 이름 그대로 쓴다. 지역명과 같은 이름의 구역이 있어도(예: 구역 '잊힌 신전') 'X 지역'처럼 지역을 말할 때는 마커 없이 — 구역 자체를 가리킬 때만 {z|X}.
  - ★중요★ '점령전 정리'에서 「」로 감싼 이름은 바로 앞의 분류(길드/구역/인물)를 그대로 따른다: '길드 「X」'는 반드시 {g|X}, '구역 「X」'는 반드시 {z|X}, '인물 「X」'는 반드시 {u|X}. 구역 이름을 절대 {g|}(길드)로 쓰지 말 것 — 구역명과 길드명은 서로 다르며 혼동하면 안 된다. 공격의 주어는 '길드', 목적어는 '구역'이다.
- 시각·시간대 표현 금지(정오·아침·저녁·새벽·밤·자정, '종이 울리자' 등).
- 시간을 가리키는 지시어('그날·이날·오늘·그 날·하루·당일' 등)를 쓰지 말 것. 특히 문단·문장을 그런 단어로 시작하지 말고, 바로 사건·길드·구역으로 시작한다. 오늘 일어난 일은 '오늘' 대신 '이번 전투·이번에' 또는 그냥 동사로 서술한다.
- 단, 전날과의 연속성을 말할 때는 '어제·전날·이전'을 써도 된다(흐름 표현용). 이때도 현재 일은 '오늘'이 아니라 '이번에·이번 전투'로 받는다(예: "어제 세 곳에 이어 이번에 두 곳을 더해").
- '인생강화'라는 단어, 이모지·이모티콘 절대 금지. 대륙·세계는 고유명 없이 '대륙' 등으로만 칭한다.
- 주어진 '점령전 정리'만 근거로 쓴다. 없는 사실을 지어내지 않는다.
- **공격한 길드(공격 측)는 반드시 '공격 측' 목록을 그대로 따른다.** 그 목록에 적힌 길드만이 공격한 길드다. 소유 길드(방어 측)가 공격했다고 절대 쓰지 말 것 — 방어 측은 공격을 '받아낸' 쪽이다. '공격 측' 항목 자체가 없으면 공격 주체를 서술하지 말 것.
- **정리에 없는 종류의 사건은 다루지 않는다.** 개인 활약·방어·형세 변화 등 어떤 항목이 정리에 없으면 그 일은 없던 것이다 — 지어내지 말고, **"눈에 띄는 활약은 없었다", "저항은 없었다", "형세 변화는 없었다"처럼 부재를 굳이 언급하지도 말 것**(부재 서술은 기록문 티가 나서 금지). 있는 사건만으로 이야기를 만든다.
- **점령(captures)은 각 구역의 winner(점령 길드)를 그대로 따른다. 서로 다른 길드가 각자 다른 구역을 점령했으면 길드별로 구분해서 쓴다 — 여러 길드의 점령을 한 길드가 모두 한 것처럼 절대 합치지 않는다.** (예: 한 길드가 두 구역, 다른 길드가 한 구역을 점령했으면 둘 다 기록.)
- 방어(defenses)는 '점령'이 아니다(이미 소유한 구역을 '공격 측'의 공격으로부터 지켜낸 것). 점령 수에 포함하지 말고, 방어는 방어로만 서술한다.
- **개인 활약(feats)의 '처치'는 적을 쓰러뜨린 수이며 공격·수비 역할과 무관하다 — 방어 측 인물도 처치가 많을 수 있다. '처치'가 많다는 이유로 그 인물·길드를 공격 측으로 단정하지 말 것**(공격 측은 오직 '공격 측' 목록으로만 판단). '수비'는 공격을 받아내고 버틴 횟수다.
- '최초·처음으로·사상 처음' 같은 최초 주장은 정리에 그렇게 명시된 경우에만 쓴다 — 정리에 '대륙 최초'·'첫 점령' 표기가 없으면 최초라고 단정하지 말 것(정리엔 그날 사실만 있고 과거 전체 이력은 없다).
- '대륙 지배', '천하', '제패' 같은 과장된 총평·결론 금지. 일어난 사실만 적는다.
- 유혈·시신·신체 훼손·고문 등 잔혹한 묘사 금지. 전투와 처치는 '쓰러뜨렸다·밀어냈다·물러났다' 수준의 담담한 표현으로만 서술하고, 피나 상해를 묘사하지 않는다.
- 반드시 JSON만 출력: {"today": "...", "headline": "..."}. JSON 문자열 값 안의 줄바꿈은 반드시 \\n 이스케이프로 쓴다(실제 줄바꿈 문자 금지).
  - today: 역사가가 그날 대륙에서 벌어진 일을 하나의 이야기로 풀어 들려주듯 쓴다. 아래 네 가지를 반드시 이야기 안에 녹이되, 각각을 별개 문단·라벨로 나누지 말고 사건 → 결과 → 그 의미 → 형세로 흐르는 하나의 인과 서사로 이어 쓴다(보고서 항목 나열이 아니라, 처음부터 끝까지 이어지는 한 편의 이야기):
    · 어떤 길드가 어느 구역을 노리고 부딪혔는지 — 전투의 발단과 흐름.
    · 누가 어느 구역을 점령했고 누가 막아냈는지 — 점령과 방어를 구분해서.
    · 무엇이 승패를 갈랐고 누가 활약했는지 — 개인 활약(feats)과 전투가 갈린 지점.
    · 그래서 이번 전투 이후 대륙의 형세가 어떻게 되었는지 — 영토 순위·기세(과장 없이 사실만).
    문단은 이야기 흐름에 따라 자연스럽게 나눈다(2~4문단, 어느 문단도 한 파트만 전담하지 않게 — 사건과 결과가 한 문단에서 이어지거나 활약이 결과 서술에 섞여도 좋다). 문단 사이는 빈 줄(\\n\\n)로 구분. 라벨('주요사건:' 등) 금지. 어느 문단도 '그날·이날·오늘' 같은 시간 지시어로 시작하지 말고 바로 길드·구역·사건으로 시작한다.
    사건 배치: 같은 길드·같은 지역의 이야기는 한 곳에 모아 서술한다(한 세력의 서사 중간에 다른 세력 이야기를 끼워 흐름을 끊지 말 것). '■ 역사적 사건' 이정표가 있으면 그 사건을 서사의 정점으로 배치하고, 그 지역과 관련된 점령·방어는 이정표 대목에 함께 묶는다.
  - headline: 핵심 사건을 한 줄로 압축(25자 내외, 마커 포함, 말하듯이). 점령 길드가 여럿이면 가장 많이 점령한 쪽 위주로 쓰되 다른 길드의 점령도 가능하면 담는다. 예: "{g|천둥길드}가 {z|왕성} 등 세 곳을 휩쓸었다". 정세가 크게 바뀐 날이 아니면 빈 문자열("")로 둔다.`;

/** 그날 사건이 '큰 사건'인지 — 점령(영토 변동) 또는 주목할 개인 활약이 있으면 기록 대상('오늘' 스토리). */
function isNotable(s: ConquestDaySummary): boolean {
  return s.captures.length > 0 || s.feats.length > 0 || s.disbands.length > 0;
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
  // 구역별 상세 — 이전 소유주(빼앗음)·첫 점령을 명시해 AI가 소유권 이동을 서술할 수 있게 한다
  // (2026-07-06 피드백: SECOND가 안녕하세요 구역을 빼앗았는데 '빼앗음' 표현이 누락).
  const capAnno = (zone: string): string => {
    const c = summary.captures.find((x) => x.zone === zone);
    if (!c) return '';
    // 경합 — 같은 구역을 노린 다른 공격 길드(승자 제외). 있으면 '무혈 접수'가 아니라
    // 공격자끼리의 전투 끝에 차지한 것(2026-07-16 점검: 무방비+다중 공격 오서술 방지).
    const rivals = [...new Set(summary.attacks.filter((a) => a.zone === zone && a.guild !== c.winner).map((a) => a.guild))];
    const rivalNote = rivals.length > 0 ? ` — 길드 「${rivals.join('」, 「')}」 와(과) 경합해 승리` : '';
    if (c.from) {
      // 교전 유무는 finale 로스터 기반 defenders로 판정 — defenses(방어 성공 목록)로 판정하면
      // '싸우고도 진 방어'가 전부 '방어 병력 없음'이 된다(2026-07-17 성문 오서술 사건).
      const defNote =
        c.defenders > 0
          ? ` — 이전 주인 「${c.from}」 이(가) 수비수 ${c.defenders}명으로 맞서 싸웠으나 패배(교전 있었음 — 무혈·무저항 아님)`
          : ` — 이전 주인 「${c.from}」 은(는) 방어 병력 없음`;
      return `(길드 「${c.from}」 로부터 빼앗음${defNote}${rivalNote})`;
    }
    return c.firstCapture ? `(중립지 첫 점령${rivalNote})` : `(무주지 점령${rivalNote})`;
  };
  // 구역마다 소속 지역 명시(2026-07-18) — 없으면 모델이 지역을 추측해 여러 지역에 걸친 점령을
  // 한 지역으로 묶는다(실사례: 신전·늪·오크·왕국 4개 지역 6곳을 '왕국 전역에서'로 오서술).
  const regionOf = (zone: string) => summary.captures.find((x) => x.zone === zone)?.region ?? '';
  const capLines =
    [...capByGuild.entries()]
      .map(([g, zs]) => `· 길드 「${g}」 이(가) 구역 ${zs.map((z) => `「${z}」(${regionOf(z)} 지역)${capAnno(z)}`).join(', ')} 을(를) 점령 (총 ${zs.length}곳)`)
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
  // ── 지형 형세(지도 분석) — 인접 그래프로 길드 영토의 연결 조각 수 변화(분단/통합/비지) 감지
  // (2026-07-06 피드백: 점령으로 상대 영토가 둘로 쪼개지는 형세를 지도 보듯 서술하게). ──
  const zoneRows = (await db.execute(sql`
    select z.id::int as id, z.name, z.region::text as region, g.name as owner
    from zones z left join guilds g on g.id = z.owner_guild_id
    where z.server_id = ${serverId}
  `)) as unknown as { id: number; name: string; region: string; owner: string | null }[];
  const adjRows = (await db.execute(sql`
    select za.zone_a::int as a, za.zone_b::int as b
    from zone_adjacency za join zones z on z.id = za.zone_a
    where z.server_id = ${serverId}
  `)) as unknown as { a: number; b: number }[];
  const idByName = new Map(zoneRows.map((z) => [z.name, z.id]));
  const nbr = new Map<number, number[]>();
  for (const e of adjRows) {
    nbr.set(e.a, [...(nbr.get(e.a) ?? []), e.b]);
    nbr.set(e.b, [...(nbr.get(e.b) ?? []), e.a]);
  }
  const compCount = (ownerOf: Map<number, string | null>, guild: string): { comps: number; zones: number } => {
    const mine = new Set([...ownerOf.entries()].filter(([, o]) => o === guild).map(([id]) => id));
    const seen = new Set<number>();
    let comps = 0;
    for (const start of mine) {
      if (seen.has(start)) continue;
      comps++;
      const stack = [start];
      while (stack.length) {
        const cur = stack.pop()!;
        if (seen.has(cur)) continue;
        seen.add(cur);
        for (const nx of nbr.get(cur) ?? []) if (mine.has(nx) && !seen.has(nx)) stack.push(nx);
      }
    }
    return { comps, zones: mine.size };
  };
  // after = 그날 전투 반영 후 상태 — DB 소유권에 captures(winner)를 **오버레이**해 계산.
  // 사전 생성(23시대, 플립 전)엔 DB가 아직 '이전' 상태라 오버레이가 필수이고, 공개 후 실행이면
  // DB=winner라 no-op(멱등). before = after에서 오늘 점령을 되돌린 상태.
  const afterOwner = new Map<number, string | null>(zoneRows.map((z) => [z.id, z.owner]));
  for (const c of summary.captures) {
    const zid = idByName.get(c.zone);
    if (zid !== undefined) afterOwner.set(zid, c.winner);
  }
  const beforeOwner = new Map(afterOwner);
  for (const c of summary.captures) {
    const zid = idByName.get(c.zone);
    if (zid !== undefined) beforeOwner.set(zid, c.from);
  }
  const topoGuilds = new Set<string>();
  for (const c of summary.captures) { topoGuilds.add(c.winner); if (c.from) topoGuilds.add(c.from); }
  const topoLines = [...topoGuilds]
    .map((g) => {
      const b = compCount(beforeOwner, g);
      const a = compCount(afterOwner, g);
      if (a.zones === 0 && b.zones > 0) return `· 길드 「${g}」: 마지막 구역까지 잃어 영토 소멸`;
      if (a.comps > b.comps && a.zones < b.zones)
        return b.comps === 1
          ? `· 길드 「${g}」: 하나로 이어져 있던 영토가 구역 상실로 ${a.comps}개 조각으로 갈라짐(분단 — 이 변화가 핵심 이야깃거리)`
          : `· 길드 「${g}」: 구역 상실로 영토가 ${b.comps}→${a.comps}개 조각으로 더 갈라짐(분단)`;
      // b.zones>0 필수 — 첫 점령(0→1)은 '기존 영토와 떨어진 비지'가 아니라 데뷔다(기존 영토가 없음).
      // 이 가드가 없으면 첫 구역이 "기존 세력권과 이어지지 않은 홀로 떨어진 조각"으로 오서술됨(2026-07-07 사건).
      if (a.comps > b.comps && b.zones > 0)
        return `· 길드 「${g}」: 새 점령지가 기존 영토와 떨어진 새 거점(비지) — 전략적 확장일 수 있음(약점 단정 금지)`;
      // 조각 수 감소의 원인 구분(2026-07-16 라이브 오서술) — 상실로 줄어든 것은 '통합'이 아니다.
      // CBT가 왕성·대성당을 잃어 3→2조각이 됐는데 "이어붙였다"로 서술된 사건.
      if (a.comps < b.comps && a.zones < b.zones)
        return `· 길드 「${g}」: 구역 상실로 영토가 줄어 ${a.comps}개 조각만 남음(⚠ 연결/통합된 것이 아님 — '이어붙였다'류 서술 금지)`;
      // 득실 혼합(얻고 잃어 보유 수 동일)의 조각 감소도 성과가 아니다(2026-07-19 FIRST —
      // 고립지를 잃어 조각이 준 것을 "하나로 이어지는 성과"로 포장한 사건).
      if (a.comps < b.comps && a.zones === b.zones)
        return `· 길드 「${g}」: 구역을 얻고 잃으며 남은 영토가 ${a.comps}개 조각으로 모임(⚠ 상실이 낀 변화 — '성과·통합'으로 포장 금지, 득실을 중립 서술)`;
      if (a.comps < b.comps && b.comps > 1) return `· 길드 「${g}」: 점령으로 흩어져 있던 영토가 ${a.comps}개 조각으로 이어짐(통합)`;
      return null;
    })
    .filter((s): s is string => s !== null)
    .join('\n');

  // ── '전체' 연표 등재 판정 — 판도 이정표(1위 교체·지역 완전 장악·영토 소멸·판도 데뷔)와
  // 기록적 개인 활약만 역사로 남긴다. 일상 확장(하루 몇 곳 점령·단순 탈취)은 '오늘' 스토리에만
  // (2026-07-07 결정: 연표가 '각각 한 곳씩 접수' 류 일지로 채워지는 것 방지). ──
  const countsOf = (ownerOf: Map<number, string | null>): Map<string, number> => {
    const m = new Map<string, number>();
    for (const o of ownerOf.values()) if (o) m.set(o, (m.get(o) ?? 0) + 1);
    return m;
  };
  // 유일 최다 보유 길드 — 동수 공동 1위는 null(교체로 치지 않음).
  const leaderOf = (counts: Map<string, number>): string | null => {
    let best: string | null = null;
    let bestN = 0;
    let tie = false;
    for (const [g, n] of counts) {
      if (n > bestN) { best = g; bestN = n; tie = false; }
      else if (n === bestN) tie = true;
    }
    return tie ? null : best;
  };
  const beforeCounts = countsOf(beforeOwner);
  const afterCounts = countsOf(afterOwner);
  const milestones: string[] = [];
  const prevLeader = leaderOf(beforeCounts);
  const nextLeader = leaderOf(afterCounts);
  if (prevLeader && nextLeader && prevLeader !== nextLeader)
    milestones.push(`· 길드 「${nextLeader}」 이(가) 영토 1위에 올라섬(직전 1위 「${prevLeader}」)`);
  const regionZoneIds = new Map<string, number[]>();
  for (const z of zoneRows) regionZoneIds.set(z.region, [...(regionZoneIds.get(z.region) ?? []), z.id]);
  // 전투 전 이미 성립해 있던 지역 석권 — '최초/N번째' 판단 근거를 사실표에 명시
  // (2026-07-19: 왕국 석권이 이미 있는데 오크 부락을 '대륙 최초'로 오서술한 사건).
  const priorSweeps: string[] = [];
  for (const [region, ids] of regionZoneIds) {
    const owners = new Set(ids.map((id) => beforeOwner.get(id) ?? null));
    if (owners.size !== 1) continue;
    const g = [...owners][0];
    if (g) priorSweeps.push(`${REGION_KO[region] ?? region}=「${g}」`);
  }
  for (const [region, ids] of regionZoneIds) {
    const owners = new Set(ids.map((id) => afterOwner.get(id) ?? null));
    if (owners.size !== 1) continue;
    const g = [...owners][0];
    // 그날 새로 성립한 완전 장악만(전날부터 이미 전 구역 소유였으면 제외).
    if (g && !ids.every((id) => beforeOwner.get(id) === g)) {
      const firstNote =
        priorSweeps.length > 0
          ? ` (이미 성립한 지역 석권 있음: ${priorSweeps.join(', ')} — '대륙 최초' 아님, ${priorSweeps.length + 1}번째)`
          : ' (대륙 최초의 지역 석권)';
      milestones.push(`· 길드 「${g}」 이(가) ${REGION_KO[region] ?? region} 전체 ${ids.length}곳을 장악${firstNote}`);
    }
  }
  for (const g of new Set([...beforeCounts.keys(), ...afterCounts.keys()])) {
    const b = beforeCounts.get(g) ?? 0;
    const a = afterCounts.get(g) ?? 0;
    if (b > 0 && a === 0) milestones.push(`· 길드 「${g}」 영토 소멸(마지막 구역 상실)`);
    if (b === 0 && a > 0)
      milestones.push(
        beforeCounts.size === 0
          ? `· 길드 「${g}」 이(가) 대륙 최초로 구역을 점령`
          : `· 길드 「${g}」 이(가) 첫 구역을 확보하며 판도에 등장`,
      );
  }
  for (const d of summary.disbands) {
    if (d.zones.length > 0) milestones.push(`· 길드 「${d.guildName}」 해산 — 보유하던 ${d.zones.length}개 구역이 주인을 잃음`);
  }
  const specialFeat = summary.feats.some((f) => f.count >= 5);

  // 빈 섹션은 digest에서 **통째로 제외**(2026-07-12 피드백) — '· (없음)' 플레이스홀더를
  // 먹이면 모델이 성실하게 "눈에 띄는 활약은 없었다"류 부재 서술을 생성해 템플릿 티가 난다.
  // 안 보여주면 못 쓴다 + baseContent의 부재 서술 금지 규칙이 이중 방어.
  const digestSections: string[] = [];
  if (summary.attacks.length > 0) digestSections.push(`■ 공격 측(구역을 공격한 길드):\n${atkLines}`);
  if (summary.captures.length > 0) digestSections.push(`■ 신규 점령(길드별):\n${capLines}`);
  if (summary.defenses.length > 0)
    digestSections.push(`■ 방어(점령 아님 — 소유 길드가 위 공격을 막아냄):\n${defLines}`);
  if (summary.feats.length > 0) digestSections.push(`■ 개인 활약:\n${featLines}`);
  if (topoLines) digestSections.push(`■ 지형 형세(지도 분석 — 형세 서술 근거):\n${topoLines}`);
  if (summary.disbands.length > 0)
    digestSections.push(
      `■ 길드 해산(이 길드들은 오늘 해체됨 — 보유 구역은 주인 없는 땅이 됨):\n` +
        summary.disbands
          .map((d) => `· 길드 「${d.guildName}」 해산${d.zones.length > 0 ? ` — 구역 ${d.zones.map((z) => `「${z}」`).join(', ')} 이(가) 중립화` : ''}`)
          .join('\n'),
    );
  if (milestones.length > 0) digestSections.push(`■ 역사적 사건(연표 등재 사유):\n${milestones.join('\n')}`);
  const digest = `[점령전 정리 — 이 귀속을 그대로 따를 것]\n` + digestSections.join('\n');

  // ── 연속성 맥락(참고용) — 오늘의 사실은 위 정리만 따르되, 흐름·판도는 아래를 참고해 이어 쓴다. ──
  // 현재 영토 현황(누적 점령 결과) — '정세' 문단 근거.
  const standLines =
    summary.standings
      .map((s) => {
        const t = compCount(afterOwner, s.guild);
        // 조각 상시 표기 제거(2026-07-16) — 매일 먹이면 변화 없어도 '아직 하나가 아니다'류
        // 반복·부정 서술 발생. 조각은 지형 형세의 '변화 신호'가 있을 때만 서술 재료(원 의도).
        return `· 길드 「${s.guild}」: ${s.zones}곳 보유`;
      })
      .join('\n') || '· (보유 길드 없음)';

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

  const bigChange = milestones.length > 0 || specialFeat;
  // ── 이름 집합(검증·교정·강제 공용) — summary가 아는 정답. ──
  const guildNames = new Set<string>();
  const zoneNames = new Set<string>();
  for (const c of summary.captures) { guildNames.add(c.winner); zoneNames.add(c.zone); }
  for (const a of summary.attacks) { guildNames.add(a.guild); zoneNames.add(a.zone); }
  for (const d of summary.defenses) { guildNames.add(d.owner); zoneNames.add(d.zone); }
  for (const f of summary.feats) guildNames.add(f.guild);
  for (const s of summary.standings) guildNames.add(s.guild);
  // 이름 집합을 당일 참여자로 한정하면 **과거 맥락으로 언급된 길드**(전날 축출된 길드 등)가
  // 위반 감지·교정·강제 마킹을 전부 비껴가 평문 노출된다(2026-07-10 '1ST' 사건 — 모델이
  // 지난 역사 서술에서 마커를 빼먹음). 서버 전체 길드·구역 이름을 집합에 추가해 커버.
  const allGuildRows = (await db.execute(
    sql`select name from guilds where server_id = ${serverId}`,
  )) as unknown as { name: string }[];
  for (const g of allGuildRows) guildNames.add(g.name);
  for (const z of zoneRows) zoneNames.add(z.name);
  const userNames = new Set<string>(summary.feats.map((f) => f.nickname));

  // 마커 닫는 중괄호 겹침({g|신화}}) 정규화 — 마커 뒤 여분 } 제거(저장 깔끔).
  const fixBraces = (s: string) => s.replace(/(\{[guz]\|[^}]+)\}{2,}/g, '$1}');
  // 결정론 마커 교정 — {g|이름}인데 구역명에만 있으면 {z|}로, 반대도(동명이면 모델 출력 유지).
  const correctMarkers = (s: string) =>
    s.replace(/\{([gz])\|([^}]+)\}/g, (mm, t: string, name: string) => {
      const n = name.trim();
      const isG = guildNames.has(n);
      const isZ = zoneNames.has(n);
      if (t === 'g' && isZ && !isG) return `{z|${name}}`;
      if (t === 'z' && isG && !isZ) return `{g|${name}}`;
      return mm;
    });
  const wrapOutsideMarkers = (text: string, find: string, repl: string): string =>
    text
      .split(/(\{[guz]\|[^}]+\}+)/g)
      .map((seg, i) => (i % 2 === 1 ? seg : seg.replaceAll(find, repl)))
      .join('');
  // 지역명과 동명인 구역(예: 잊힌 신전)의 '지역 언급' 보호 — "X 지역"은 구역이 아니라 지역이라
  // 마커 대상이 아니다(2026-07-19: '{z|잊힌 신전} 지역'으로 오마킹된 사건). 검사·백스톱 공용.
  const REGION_NAMES = Object.values(REGION_KO);
  const stripRegionMentions = (s: string): string =>
    REGION_NAMES.reduce((acc, r) => acc.replaceAll(`${r} 지역`, ''), s);
  // 검증 — 알려진 이름이 마커 밖(평문·「」)에 등장하면 위반. 재시도 피드백/백스톱 판단 공용.
  const findViolations = (s: string): string[] => {
    const plain = stripRegionMentions(
      s
        .split(/(\{[guz]\|[^}]+\}+)/g)
        .filter((_, i) => i % 2 === 0)
        .join(''),
    );
    return [...new Set([...guildNames, ...userNames, ...zoneNames])].filter(
      (n) => n.length >= 2 && plain.includes(n),
    );
  };
  // 마커 누락 강제(2026-07-05 사건: 본문 전체 마커 0, 「이름」 평문 노출) — 재시도로도 남은
  // 위반을 결정론 마킹. 기존 마커 보존, 동명(두 종류 이상에 존재)은 종류 판정 불가라 스킵(재시도
  // 단계에서 AI가 문맥으로 해소하는 것이 1차 방어), 긴 이름 우선(부분 문자열 오마킹 방지).
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
    // 'X 지역'(지역 언급)은 감싸지 않게 센티널로 보호 후 복원.
    let out = s;
    const sentinels = new Map<string, string>();
    REGION_NAMES.forEach((r, i) => {
      const key = `R${i}`;
      sentinels.set(key, `${r} 지역`);
      out = out.replaceAll(`${r} 지역`, key);
    });
    for (const { k, n } of items) {
      out = wrapOutsideMarkers(out, `「${n}」`, `{${k}|${n}}`);
      out = wrapOutsideMarkers(out, n, `{${k}|${n}}`);
    }
    for (const [key, orig] of sentinels) out = out.replaceAll(key, orig);
    return out;
  };
  // {u|닉} → {u|닉|코드} — 렌더 링크용 불변 publicCode 주입(닉변·재취득에도 안전).
  const codeByNick = new Map(summary.feats.filter((f) => f.publicCode).map((f) => [f.nickname, f.publicCode!]));
  const enrichUserMarkers = (s: string): string =>
    s.replace(/\{u\|([^}|]+)\}/g, (mm, n: string) => {
      const code = codeByNick.get(n.trim());
      return code ? `{u|${n.trim()}|${code}}` : mm;
    });

  const baseContent =
    `${kstDay} 점령전 기록.\n\n${digest}\n\n${context}\n\n` +
    `공격한 길드는 '공격 측' 목록만 따라라 — 소유(방어) 길드가 공격했다고 쓰지 말 것. 방어 측은 공격을 받아낸 쪽이다. '처치'가 많은 인물도 방어 측일 수 있으니 처치 수로 공격 측을 단정하지 말 것.\n` +
    `위 '신규 점령(길드별)'을 정확히 따라라 — 한 길드의 점령을 다른 길드로 옮기거나 여러 길드 점령을 한 길드로 합치지 말 것. 방어는 점령으로 세지 말 것.\n` +
    `[현재 영토 현황]·[어제 점령전 결과]·[지난 역사]는 흐름·판도 참고용이다. 오늘의 사실(점령/방어/활약)은 반드시 '[점령전 정리]'만 따르고, 어제·과거의 점령을 오늘 것으로 적지 말 것.\n` +
    `정리에 없는 항목(개인 활약·방어·형세 등)은 그 화제를 아예 다루지 말 것 — "~는 없었다"류 부재 언급 금지(있는 사건만으로 서사).\n` +
    `이야기 끝의 '형세'(정세) 대목은 '[현재 영토 현황]'(누적 보유 구역 수)을 반영하고, 어제·지난 역사와 자연스럽게 이어지도록 연속성 있게 맺는다. 현재 일은 '오늘' 대신 '이번에·이번 전투'로 받는다(예: "어제 세 곳에 이어 이번에 두 곳을 더해 현재 다섯 곳을 보유").\n` +
    `'되찾다·탈환·수복·다시' 같은 재획득 표현 금지 — 정리에는 직전 소유만 있고 그 이전 소유 이력은 없다. 공격 길드가 과거에 그 구역을 가졌었는지 알 수 없으므로 항상 '빼앗다·차지하다·가져가다'로만 쓴다(2026-07-18 잿빛 첨석 오서술).\n` +
    `구역의 소속 지역은 정리의 '(X 지역)' 표기만 따른다 — 여러 지역에 걸친 점령을 한 지역 이름으로 묶지 말 것('왕국 전역에서'는 전부 왕국 지역일 때만, 여러 지역에 걸치면 '대륙 전역에서').\n` +
    `'신규 점령'에 '~로부터 빼앗음'이 붙은 구역은 소유권 이동을 분명히 이야기하라 — 이전 주인 길드를 언급하고, '방어 병력 없음'이면 그 사실 자체를 서사로 쓴다(무혈 입성·비워진 성을 접수 등). 반대로 '수비수 N명으로 맞서 싸웠으나 패배'가 붙은 구역은 실제 교전 끝에 함락된 것이다 — 이런 구역을 '지키는 병력이 없었다'·무혈·무저항으로 쓰면 안 되고, 저항을 뚫고 차지한 것으로 서술한다. '지형 형세'의 분단·통합·비지 신호가 있으면 지도를 보며 형세를 짚는 사관처럼 형세 대목에 녹여라(예: "이 한 수로 상대 영토는 남북으로 갈라졌다") 신호가 없으면 조각·분산 이야기를 꺼내지 말고, 영토가 나뉘어 있음을 '약점·미완성'으로 단정하지 말 것(여러 거점은 전략일 수 있음)..\n` +
          `today는 역사가가 그날의 일을 하나의 이야기로 풀어 들려주듯 쓴다 — 사건→결과→그 의미→형세를 별개 문단·라벨로 쪼개지 말고 인과로 이어지는 단일 서사로. 문단은 흐름에 따라 자연스럽게(2~4문단), '그날·이날·오늘' 같은 시간 지시어로 문단을 시작하지 말 것.\n` +
    (bigChange
      ? `이번 전투는 역사에 남는 날 — headline은 '■ 역사적 사건'${milestones.length === 0 ? '(기록적 개인 활약)' : ''}을 중심으로 핵심 한 줄을 쓴다. 이정표가 '지역 전체 장악'이면 구역 수 나열('6곳 장악')이 아니라 지배 선언으로 쓴다(예: "{g|길드명}, 왕국 전역을 지배하다"). 본문에서도 그 이정표를 구체적으로 짚는다 — 어느 구역을 마지막으로 그 지역 전부가 깃발 아래 놓였는지.\n`
      : `이번 전투는 역사에 남을 날이 아님 — headline은 반드시 빈 문자열("")로 둔다.\n`) +
    `마커: 길드={g|}, 인물={u|}, 개별 구역(zone)={z|}. 지역은 마커 없이. 모든 길드/인물/구역 이름은 등장할 때마다 반드시 마커로 감싼다(「」 따옴표 금지). **어제·지난 역사 등 과거 맥락으로 언급하는 이름도 예외 없이 마커** — 예: 전날 밀려난 길드 'X'를 회상하며 언급할 때도 {g|X}.\n\n` +
    `위 규칙대로 JSON({today, headline})만 출력하라.`;

  // ── 생성 + 검증 재시도(최대 3회) — 위반(마커 없는 이름)을 피드백으로 재생성 유도. ──
  // 재시도로도 남으면 enforceMarkers가 결정론 백스톱(동명 모호만 최종 잔존 가능, warn).
  const messages: { role: 'user' | 'assistant'; content: string }[] = [
    { role: 'user', content: baseContent },
  ];
  let today = '';
  let headline = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await client().messages.create({
      model: MODEL_ID,
      // 대규모 전투일(다구역 서술)에 1100이 부족해 JSON이 잘림(2026-07-20 실측) — 여유 상향.
      max_tokens: 2200,
      // Sonnet 5는 thinking 미지정 시 adaptive 기본(2026 변경) — 짧은 예산이 thinking에
      // 소진돼 본문이 비는 사고 방지(7/20 연대기 pregen 전량 실패). 명시 비활성.
      thinking: { type: 'disabled' },
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages,
    });
    const block = res.content.find((b) => b.type === 'text');
    const raw = block && 'text' in block ? block.text : '';
    // 파싱 실패도 재시도 소재(2026-07-18) — 종전엔 즉시 throw라 한 번의 깨진 JSON이 생성 전체를 무산시켰다.
    const parsed = parseModelJson<{ today?: string; headline?: string }>(raw);
    if (!parsed) {
      // 빈 응답 진단(2026-07-21) — raw가 비면 파싱 이전 문제(중단 사유·블록 구성)를 남긴다.
      console.warn(
        `[chronicle] 응답 진단 stop=${res.stop_reason} blocks=[${res.content.map((b) => b.type).join(',')}] rawLen=${raw.length}`,
      );
      if (attempt === 2) throw new Error(`CHRONICLE_PARSE_FAIL: ${raw.slice(0, 200)}`);
      console.warn(`[chronicle] JSON 파싱 실패 → 재생성(attempt ${attempt + 1})`);
      messages.push(
        { role: 'assistant', content: raw },
        {
          role: 'user',
          content:
            '출력이 유효한 JSON이 아니다. 문자열 값 안의 줄바꿈은 반드시 \\n으로 이스케이프해서, 같은 내용을 JSON({today, headline})만으로 다시 출력하라.',
        },
      );
      continue;
    }
    const candT = correctMarkers(fixBraces((parsed.today ?? '').trim()));
    const candH = bigChange ? correctMarkers(fixBraces((parsed.headline ?? '').trim())) : '';
    const viol = [...new Set([...findViolations(candT), ...findViolations(candH)])];
    if (viol.length === 0 || attempt === 2) {
      if (viol.length > 0) {
        console.warn(`[chronicle] 마커 위반 잔존(재시도 소진) — enforce 백스톱 적용: ${viol.join(', ')}`);
      }
      today = enrichUserMarkers(enforceMarkers(candT));
      headline = enrichUserMarkers(enforceMarkers(candH));
      break;
    }
    console.warn(`[chronicle] 마커 위반 ${viol.length}건 → 재생성(attempt ${attempt + 1}): ${viol.join(', ')}`);
    messages.push(
      { role: 'assistant', content: raw },
      {
        role: 'user',
        content:
          `다음 이름이 마커 없이(평문 또는 「」로) 등장했다: ${viol.join(', ')}\n` +
          `길드는 {g|이름}, 인물은 {u|이름}, 개별 구역은 {z|이름}으로 — 위 이름의 모든 등장 위치를 종류에 맞는 마커로 감싸서, 같은 내용을 처음부터 끝까지 다시 JSON({today, headline})으로만 출력하라.`,
      },
    );
  }
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
  /** '어제' — 그 직전 기록일의 긴 스토리(없으면 null). */
  yesterday: string | null;
  /** '어제' 기록일(YYYY-MM-DD) — 어제 리플레이 스크립트 로드용. */
  yesterdayDay: string | null;
  /** '전체' — 큰 사건이 있던 날들의 (날짜·한 줄) 리스트(최신순). */
  list: { kstDay: string; headline: string }[];
};

/** 세계지도 하단 표시용 — 오늘(최신 스토리) + 전체(날짜별 헤드라인 리스트). */
export async function getChronicle(serverId: number): Promise<ChronicleData> {
  // 읽기 게이트(kst_day < 오늘 KST) — 연대기는 23시대에 **사전 생성**되고(정산 직후), 노출은
  // 자정에 시계 기준으로 자동 개방된다(크론 지터 0, 정각 공개). 전투일 D의 행은 D 23시대에
  // 존재하지만 D+1 00:00:00부터 보인다. 사전 생성 실패 시 00시대 크론 백필이 생성하며,
  // 그 행은 kst_day=어제라 즉시 노출(기존 동작과 동일한 우아한 강등).
  const rows = await db
    .select({
      kstDay: worldChronicle.kstDay,
      todayText: worldChronicle.todayText,
      headline: worldChronicle.headline,
    })
    .from(worldChronicle)
    .where(and(eq(worldChronicle.serverId, serverId), lt(worldChronicle.kstDay, kstDateString(new Date()))))
    .orderBy(sql`${worldChronicle.kstDay} desc`)
    .limit(120);
  return {
    today: rows[0]?.todayText ?? null,
    // '어제' 탭(2026-07-17 추가) — 최신 공개일의 직전 기록 전문.
    yesterday: rows[1]?.todayText ?? null,
    yesterdayDay: rows[1] ? String(rows[1].kstDay) : null,
    // '전체' 연표 — 헤드라인이 있는 날(정세가 크게 바뀐 날)만 노출.
    list: rows
      .filter((r) => r.headline && r.headline.trim().length > 0)
      .map((r) => ({ kstDay: String(r.kstDay), headline: r.headline })),
  };
}
