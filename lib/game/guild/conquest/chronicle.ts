import 'server-only';

import Anthropic from '@anthropic-ai/sdk';
import { and, desc, eq, lt, sql } from 'drizzle-orm';

import { winnerNameFragments } from './winner-name';
import { db } from '@/lib/db/client';
import { worldChronicle, type ChronicleGuildRef } from '@/lib/db/schema/guild';
import { kstDateString } from '@/lib/kst';
import { parseChronicleSegments, pastContextZoneKeysRaw } from '@/app/(game)/guild/map/chronicle-tokens';
import { REGION_META, type Region } from '@/lib/game/guild/region-meta';
import type { ConquestFinale } from './simulate';
import { factIssues, headlineIssues, type FactCheckContext } from './chronicle-facts';
import { acquireChronicleLock } from './chronicle-lock';
import { daysBetween, holdingSince, koDate, lastWipeDay, ownersBefore, replayOwnership, sweepPeriods, type OwnershipEvent } from './chronicle-history';
import { CHRONICLE_FEEDBACK, type ChronicleFeedbackKey, type ChronicleImproveModel, type ChronicleReviewNote } from './chronicle-options';

// 연대기 모델(2026-09-10 재확인) — 사실 오류는 chronicle-facts.ts 검증기가 재생성 피드백으로 잡고,
// 문체는 직전 검수 완료본을 참고로 준다. 모델을 올리는 것보다 이 두 장치가 확실해 기존 모델을 유지한다
// (상위 모델은 환경별 접근 권한이 달라 하루 한 번뿐인 생성이 통째로 실패할 위험도 있다).
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
   * defenders = finale 로스터 중 이전 주인 소속 수(>0이면 교전 끝 함락 — '무혈'로 서술 금지).
   * deployedDefenders = 그중 **배치로 세운** 수비(role=defend). 0인데 defenders>0이면 **집행관 자동 방어뿐**이다
   * — 이 둘을 섞어 두면 사실표가 '수비수 N명으로 맞서 싸웠으나 패배'만 내보내고, 프롬프트 규칙이 그걸
   * '저항을 뚫고 함락'으로 쓰라고 강제해 모델이 **'수비를 세워 맞섰으나'라는 없는 사실**을 쓴다
   * (2026-09-13 검은 첨봉: 케케케 배치 0·집행관 예수만 자동 방어였는데 "수비를 세워 맞섰으나"로 나갔다). */
  captures: { zone: string; region: string; winner: string; from: string | null; firstCapture: boolean; defenders: number; deployedDefenders: number }[];
  /** 방어 성공(소유 길드 유지). defenders/deployedDefenders는 captures와 같은 기준(집행관 단독 방어 구분용). */
  defenses: { zone: string; region: string; owner: string; defenders: number; deployedDefenders: number }[];
  /** 영토 순위(그날 이후 보유 구역 수, 상위). */
  standings: { guild: string; zones: number }[];
  /** 공격 측 — 그날 각 구역을 공격한(role=attack 배치) 길드(구역×길드 distinct). */
  attacks: { zone: string; region: string; guild: string }[];
  /** 그날 해산한 길드(world_events guild_disband) — 보유하던 구역이 중립화됨(연대기 서술 재료). */
  disbands: { guildName: string; zones: string[] }[];
  /** (2026-08-30 이전 이력) 방치로 중립화된 구역 — world_events zone_neutralized. 이전 소유 길드별 상실 구역(전투 아님). */
  neutralized: { guildName: string; zones: string[] }[];
  /** 그날 길드명 변경(world_events guild_rename, KST 일자) — 이후 사건은 새 이름, 이전 발행분은 옛 이름 유지(0182). */
  renames: { before: string; after: string }[];
  /** 방치 판정 구역(0180 — 소유 유지, 다음 정산까지 세금 보너스 제외). 길드별 구역명. */
  abandoned: { guildName: string; zones: string[] }[];
  /**
   * 주목할 개인 활약(그날 finale 기준 — 최다 수비/처치).
   *  - '처치' = 쓰러뜨린 수(공·수 역할 무관).
   *  - '수비' = **서로 다른 공격자 수**(2026-09-10 변경). 종전엔 피격 횟수라 1대1로 세 라운드 버틴 것도
   *    3이 되어 "세 차례 공격을 받아냈다"는 과장이 나왔고, 끝내 탈락한 사람도 집계에 남았다
   *    (09-10 검수: 뉴비·냐옹 모두 공격자 1명). 이제 **끝까지 살아남은 사람의 서로 다른 공격자 수**만 센다.
   */
  /** fell — 그날 전투에서 끝내 쓰러졌는지(true)·끝까지 살아남았는지(false)·모름(null, 이전 전투 기록). 09-17 추가. */
  feats: { nickname: string; publicCode: string | null; guild: string; kind: '수비' | '처치'; count: number; zones: string[]; fell: boolean | null }[];
  /**
   * 열세 방어(2026-09-10) — 수비 인원이 공격 인원보다 적은데 **지켜낸** 전투. 사람 단위 활약이 과장되기 쉬운 자리를
   * 팀 단위 사실로 대신한다(09-09 그을린 고목: 셋이 일곱을 막아냄). 인원은 crowds와 같은 기준으로
   * 로스터에서 세고 **집행관 자동 방어를 섞어 센다**. 인원수 서술이 허용되는 전투는 crowds와 여기뿐이다.
   */
  underdogDefenses: { zone: string; region: string; owner: string; defenders: number; attackers: { guild: string; n: number }[]; attackerTotal: number }[];
  /**
   * 열세 점령(2026-09-13) — 수비보다 **적은 인원**으로 들어가 구역을 빼앗은 전투. 열세 방어의 반대편이고
   * 똑같이 극적인데 종전엔 인원수 서술이 막혀 "수비를 세웠지만 넘어갔다"로만 나갔다
   * (09-13 잿더미 폐허: 로제 하나가 수비 둘을 모두 베고 차지, 황금 회랑: 하나가 셋을 전멸).
   */
  underdogCaptures: { zone: string; region: string; winner: string; from: string | null; attackers: number; defenders: number }[];
  /**
   * 사람이 몰린 전투(2026-09-10) — finale 로스터 CROWD_MIN명 이상인 구역 중 **가장 많이 몰린 한 곳만**(사용자 확정:
   * 여러 곳이면 최고 인원 한 곳만 언급). 그날 큰 싸움의 규모를 서술할 재료다.
   * 셋이 일곱을 막아낸 날의 그 숫자를 연대기가 볼 수 없어 추가했다(09-09 그을린 고목).
   * defenders = 소유 길드 소속 수, attackers = 그 외 길드별 수. 둘 다 **집행관 자동 방어를 섞어서 센다**
   * (리플레이에는 함께 싸우는 것으로 보이므로 글에서만 나누면 읽는 사람이 헷갈린다 — 사용자 확정).
   */
  crowds: { zone: string; region: string; owner: string | null; defenders: number; attackers: { guild: string; n: number }[]; total: number; held: boolean }[];
};

/** 복귀 공백이 이 일수 이하면 '오랫동안'류 표현을 막는다(09-17 민초: 하루 비었다 돌아옴). */
export const COMEBACK_SHORT_GAP_DAYS = 3;

/** 인원수를 넘길 최소 참가자 수 — 이보다 작은 전투는 규모를 서술할 거리가 아니다. 기준은 실측 보고 조정. */
export const CROWD_MIN = 5;
/**
 * 개인 활약 최소치 — 처치는 쓰러뜨린 수, 수비는 **서로 다른 공격자 수**(2026-09-10).
 * 3으로 두면 "여럿에게 집중 표적이 되고도 살아남은" 사람만 남는다. 1대1 반복 피격은 이제 1이라 걸리지 않는다.
 */
export const FEAT_MIN = 3;
/**
 * 하루에 이름을 올릴 수 있는 최대 인원(2026-09-13) — 넓히되 이름 행렬이 되지 않게.
 * 다섯이면 그날 정말 눈에 띄는 활약만 남고, 여섯 번째부터는 "둘 쓰러뜨림"이 줄줄이 붙는다.
 */
export const FEAT_MAX = 5;
/** '단독 전멸·분전 후 전사'가 성립하려면 상대가 최소 몇 명이어야 하는가 — 1대1은 활약이 아니다. */
export const DRAMA_MIN_FOES = 2;

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

// 지역 풀네임(줄임말 금지) — 세계지도와 **단일 출처(REGION_META)** 공유. 자체 복제 금지(드리프트 방지).
const regionKo = (r: string): string => REGION_META[r as Region]?.label ?? r;
const REGION_KO_VALUES = Object.values(REGION_META).map((m) => m.label);

/** 그날(kstDay) 점령전 결과를 집계 — 사건 없으면 battleCount 0. */
export async function aggregateConquestDay(kstDay: string, serverId: number): Promise<ConquestDaySummary> {
  const wn = await winnerNameFragments();
  const battles = (await db.execute(sql`
    select z.name as zone, z.region::text as region,
           ${wn.winner('g', 'cb')} as winner, cb.finale as finale,
           -- 이전 소유(from) = 전투 이력의 마지막 승자. 단, 그 이후 방치 중립화(zone_neutralized)가
           -- 더 최근이면 현재 '중립'이므로 null(주인 없는 땅)로 본다. 중립화를 무시하면 이미 방치로 잃은
           -- 구역을 '옛 소유 길드로부터 빼앗음'으로 오서술한다(2026-07-25 검수 발견).
           (case
              when (select max(we.detail->>'battleDay')
                      from world_events we, jsonb_array_elements_text(we.detail->'zones') zn
                      where we.server_id = ${serverId} and we.type = 'zone_neutralized'
                        and zn = z.name and (we.detail->>'battleDay') < ${kstDay})
                   >= coalesce((select max(cb4.battle_kst_day)::text from conquest_battles cb4
                        where cb4.zone_id = cb.zone_id and cb4.battle_kst_day < ${kstDay}
                          and ${wn.hasWinner('cb4')}), '')
              then null
              -- 승자 이름 = 현재 길드명, 해산했으면 스냅샷(0201). join guilds만 쓰면 해산 길드의 승리가 빠져 그 전 주인이 튀어나온다.
              else (select ${wn.winner('g2', 'cb2')} from conquest_battles cb2
                      left join guilds g2 on g2.id = cb2.winner_guild_id
                      where cb2.zone_id = cb.zone_id and cb2.battle_kst_day < ${kstDay}
                        and ${wn.hasWinner('cb2')}
                      order by cb2.battle_kst_day desc limit 1)
           end) as prev_owner,
           exists(select 1 from conquest_battles cb3
              where cb3.zone_id = cb.zone_id and cb3.battle_kst_day < ${kstDay}
                and ${wn.hasWinner('cb3')}) as had_owner_history,
           -- 배치로 세운 수비 수(role=defend) — 집행관 자동 방어는 배치 행이 없어 여기 안 잡힌다.
           -- finale 로스터 기반 defenders와의 차이가 곧 '집행관만 맞선 전투'다.
           (select count(*)::int from guild_battle_deployments d
              where d.zone_id = cb.zone_id and d.battle_kst_day = ${kstDay}
                and d.server_id = ${serverId} and d.role = 'defend') as deployed_defenders,
           -- 참가자 보완(2026-09-17) — finale.units가 없는 이전 전투용. 공개 전(published_at null)이면 구역의
           -- 현재 집행관이 곧 그 전투의 자동 방어자다(공개 뒤엔 교체될 수 있어 쓰지 않는다).
           z.id::int as zone_id,
           cb.published_at is null as unrevealed,
           z.executor_user_id::text as executor,
           (select g5.name from guilds g5 where g5.id = z.owner_guild_id) as db_owner
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
    deployed_defenders: number;
    zone_id: number;
    unrevealed: boolean;
    executor: string | null;
    db_owner: string | null;
  }[];

  // 그날 배치 전부 — finale.units가 없는 이전 전투의 참가자 정본(finale는 마지막 N라운드만 담는다).
  // 닉네임은 여기서 읽지 않는다 — 배치만 있고 finale에 없는 사람은 처치·활약이 없어 이름이 쓰이지 않고,
  // characters 조인은 역사 페이지의 읽기 전용 역할(history_reader)에 권한이 없어 하루 API가 통째로 죽었다(09-18 스테이징).
  const depRows = (await db.execute(sql`
    select d.zone_id::int as zone_id, d.user_id::text as uid, g.name as guild
    from guild_battle_deployments d
    left join guilds g on g.id = d.guild_id
    where d.battle_kst_day = ${kstDay} and d.server_id = ${serverId}
  `)) as unknown as { zone_id: number; uid: string; guild: string | null }[];

  /**
   * 전투 참가자(2026-09-17) — 인원수·처치·생존의 정본.
   *  - finale.units(09-17 이후 전투): 전투 전체 집계 그대로.
   *  - 이전 전투: 배치 ∪ finale 등장 인물 ∪ (공개 전이면) 현재 집행관. 처치는 finale 구간만 알 수 있어
   *    최소치이고, finale 밖에서 쓰러진 사람의 생사는 모른다(fell=null).
   * 종전엔 finale 등장 인물만 세서, 일찍 쓰러진 공격자가 빠진 "1명이 수비 2명을 뚫었다"가 사실표에 실렸다
   * (09-17 황금 회랑: 실제 Winners 3명 배치).
   */
  type Participant = { userId: string; nickname: string; guildName: string; kills: number; fell: boolean | null };
  const participantsOf = (b: (typeof battles)[number]): Participant[] => {
    const f = b.finale;
    if (f?.units && f.units.length > 0) {
      return f.units.map((u) => ({ userId: u.userId, nickname: u.nickname, guildName: u.guildName, kills: u.kills, fell: !u.survived }));
    }
    const finaleKills = new Map<string, number>();
    const finaleFell = new Set<string>();
    for (const [a, tg, , hp] of f?.events ?? []) {
      if (hp > 0) continue;
      const ra = f!.roster[a];
      if (ra) finaleKills.set(ra.userId, (finaleKills.get(ra.userId) ?? 0) + 1);
      const rt = f!.roster[tg];
      if (rt) finaleFell.add(rt.userId);
    }
    // finale는 전투의 **마지막** N라운드라, 거기 등장해 쓰러지지 않은 사람은 끝까지 살아남은 것이다.
    // 등장하지 않은 사람(배치만 있음)은 그 전에 쓰러졌을 가능성이 크지만 확정은 못 한다(null).
    const inFinale = new Set((f?.roster ?? []).map((r) => r.userId));
    const out = new Map<string, Participant>();
    const add = (userId: string, nickname: string, guildName: string) => {
      const cur = out.get(userId);
      if (cur) {
        // 배치 행(닉네임 없음)이 먼저 들어오면 finale 로스터의 닉네임으로 채운다 — 안 채우면 배치된 활약자가
        // 이름 없이 집계돼 사실표에서 빠지고, 검증기가 본문의 그 인물을 '활약 목록에 없는 인물'로 지운다(09-18).
        if (!cur.nickname && nickname) cur.nickname = nickname;
        return;
      }
      const fell = inFinale.has(userId) ? finaleFell.has(userId) : null;
      out.set(userId, { userId, nickname, guildName, kills: finaleKills.get(userId) ?? 0, fell });
    };
    for (const d of depRows) if (d.zone_id === b.zone_id && d.guild) add(d.uid, '', d.guild);
    for (const r of f?.roster ?? []) add(r.userId, r.nickname, r.guildName);
    if (b.unrevealed && b.executor && b.prev_owner && b.db_owner === b.prev_owner) add(b.executor, '', b.prev_owner);
    return [...out.values()];
  };
  /** 사람별 생존 — 한 번이라도 쓰러졌으면 true, 확인된 생존뿐이면 false, 모르면 null. */
  const fellOf = new Map<string, boolean | null>();

  const captures: ConquestDaySummary['captures'] = [];
  const defenses: ConquestDaySummary['defenses'] = [];
  // 개인 활약 — 그날 전 battle의 finale 합산(유저별 수비 성공·처치). zones = 활약이 나온 구역
  // (2026-07-20 피드백: 어느 구역 전투에서의 활약인지 서술에 필요).
  const crowds: ConquestDaySummary['crowds'] = [];
  const underdogDefenses: ConquestDaySummary['underdogDefenses'] = [];
  const underdogCaptures: ConquestDaySummary['underdogCaptures'] = [];
  /**
   * 극적 활약 판정 재료(2026-09-13) — 사람별로 그날 전투를 훑어 모은다.
   *  solo  = 자기 **길드가 혼자**인데 상대를 전원 쓰러뜨리고 본인 생존(단독 전멸)
   *  last  = 자기 길드가 혼자서 둘 이상 쓰러뜨리고 본인도 전사(분전 후 전사)
   *  foes  = 그날 상대한 인원의 최댓값(동점자 정렬 기준 — 더 많은 적을 상대한 쪽이 앞)
   * 종전엔 '최다 1명'만 뽑아 라프산두(3처치)가 규규(6처치)에 가려 탈락했다.
   */
  const drama = new Map<string, { nick: string; guild: string; solo: boolean; last: boolean; foes: number }>();
  // 수비 활약 = 서로 다른 공격자 집합(끝까지 살아남은 사람만). 처치 = 쓰러뜨린 수.
  const survives = new Map<string, { nick: string; guild: string; atk: Set<string>; zones: Set<string> }>();
  const kills = new Map<string, { nick: string; guild: string; n: number; zones: Set<string> }>();

  for (const b of battles) {
    const parts = participantsOf(b);
    for (const pt of parts) {
      const prev = fellOf.get(pt.userId);
      fellOf.set(pt.userId, prev === true || pt.fell === true ? true : prev === null || pt.fell === null ? null : false);
    }
    if (!b.winner) {
      // 무승부(승자 없음) — 소유 길드가 있으면 '소유 유지'로 방어에 준해 기록(결과 누락 방지).
      if (b.prev_owner)
        defenses.push({
          zone: b.zone,
          region: regionKo(b.region),
          owner: b.prev_owner,
          defenders: parts.filter((r) => r.guildName === b.prev_owner).length,
          deployedDefenders: Number(b.deployed_defenders ?? 0),
        });
      continue;
    }
    const region = regionKo(b.region);
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
        // '첫 점령'이 아니라 '주인 없는 땅 점령'으로 표기(2026-07-16 점검).
        firstCapture: b.prev_owner == null && !b.had_owner_history,
        // 방어 병력 유무는 defenses(방어 '성공' 목록)가 아니라 finale 로스터로 판정 —
        // 싸우고도 진 방어를 '방어 병력 없음'으로 오표기한 사건(2026-07-17 성문) 방지.
        defenders: b.prev_owner ? parts.filter((r) => r.guildName === b.prev_owner).length : 0,
        deployedDefenders: Number(b.deployed_defenders ?? 0),
      });
    } else {
      defenses.push({
        zone: b.zone,
        region,
        owner: b.winner,
        defenders: parts.filter((r) => r.guildName === b.winner).length,
        deployedDefenders: Number(b.deployed_defenders ?? 0),
      });
    }
    // 로스터 기준 인원(배치 + 집행관 자동 방어). 소유 길드 소속 = 수비, 그 외 = 공격(길드별).
    // 같은 집계를 '사람이 몰린 전투'(CROWD_MIN 이상)와 '열세 방어'(수비<공격인데 지켜냄) 둘이 함께 쓴다.
    const roster = parts;
    {
      const owner = b.prev_owner;
      const byGuild = new Map<string, number>();
      let defenders = 0;
      for (const r of roster) {
        if (owner && r.guildName === owner) defenders += 1;
        else byGuild.set(r.guildName, (byGuild.get(r.guildName) ?? 0) + 1);
      }
      const attackerList = [...byGuild.entries()].map(([guild, n]) => ({ guild, n })).sort((x, y) => y.n - x.n);
      const attackerTotal = attackerList.reduce((a, x) => a + x.n, 0);
      // 열세 방어 — 지켜냈고(소유 유지), 수비가 실제로 있었고, 공격 인원이 더 많을 때.
      if (!isCapture && owner && defenders > 0 && attackerTotal > defenders) {
        underdogDefenses.push({ zone: b.zone, region, owner, defenders, attackers: attackerList, attackerTotal });
      }
      // 열세 점령 — 빼앗았는데 들어간 인원이 수비보다 적을 때(승자 길드 인원 기준).
      if (isCapture && b.winner && defenders > 0) {
        const won = attackerList.find((x) => x.guild === b.winner)?.n ?? 0;
        if (won > 0 && won < defenders) {
          underdogCaptures.push({ zone: b.zone, region, winner: b.winner, from: owner, attackers: won, defenders });
        }
      }
    }
    if (roster.length >= CROWD_MIN) {
      const owner = b.prev_owner;
      const byGuild = new Map<string, number>();
      let defenders = 0;
      for (const r of roster) {
        if (owner && r.guildName === owner) defenders += 1;
        else byGuild.set(r.guildName, (byGuild.get(r.guildName) ?? 0) + 1);
      }
      crowds.push({
        zone: b.zone,
        region,
        owner,
        defenders,
        attackers: [...byGuild.entries()].map(([guild, n]) => ({ guild, n })).sort((x, y) => y.n - x.n),
        total: roster.length,
        held: !isCapture,
      });
    }
    // 처치 — 참가자 집계 기준(finale.units가 있으면 전투 전체, 없으면 finale 구간 최소치).
    for (const pt of parts) {
      if (pt.kills <= 0) continue;
      const e = kills.get(pt.userId) ?? { nick: pt.nickname, guild: pt.guildName, n: 0, zones: new Set<string>() };
      e.n += pt.kills;
      e.zones.add(b.zone);
      if (!e.nick && pt.nickname) e.nick = pt.nickname;
      kills.set(pt.userId, e);
    }
    // 극적 활약 판정 — 길드 단위 '자기 편'으로 본다(공격 길드끼리 맞붙는 전투가 있어 진영으로는 못 가른다).
    // 생사를 모르는 사람(이전 전투의 finale 밖)은 단독 전멸·분전 판정에 쓰지 않는다(없는 극적 서사 방지).
    {
      const sideSize = new Map<string, number>();
      for (const pt of parts) sideSize.set(pt.guildName, (sideSize.get(pt.guildName) ?? 0) + 1);
      for (const pt of parts) {
        if ((sideSize.get(pt.guildName) ?? 0) !== 1) continue; // '혼자'가 아니면 두 판정 다 대상 아님
        const foes = parts.filter((o) => o.guildName !== pt.guildName);
        // 상대가 한 명뿐인 1대1은 '단독 전멸'도 '분전'도 아니다. 그리고 **본인이 둘 이상 쓰러뜨렸을 때만**
        // 센다 — 하한이 없으면 남이 다 잡고 살아남기만 한 1킬짜리가 매일 다섯 자리를 채운다(09-11·12 실측).
        if (foes.length < DRAMA_MIN_FOES || pt.kills < 2 || pt.fell === null) continue;
        const e = drama.get(pt.userId) ?? { nick: pt.nickname, guild: pt.guildName, solo: false, last: false, foes: 0 };
        // 전투는 한 길드만 남아야 끝나므로, 본인이 살아남았고 확인된 생존 상대가 없으면 상대 전원이 쓰러진 것이다.
        if (pt.fell === false && foes.every((o) => o.fell !== false)) e.solo = true;
        if (pt.fell === true) e.last = true;
        e.foes = Math.max(e.foes, foes.length);
        drama.set(pt.userId, e);
      }
    }
    const f = b.finale;
    if (f?.roster && f.events) {
      // 이 전투에서 쓰러진 사람(피날레 구간 기준 — 그 전에 죽은 사람은 애초에 표적으로 등장하지 않는다).
      const fallen = new Set<number>();
      for (const [, tg, , hp] of f.events) if (hp <= 0) fallen.add(tg);
      // 표적별 '서로 다른 공격자' 집합. 같은 사람이 여러 번 때려도 하나로 센다(1대1 세 라운드 ≠ 활약).
      const atkOf = new Map<number, Set<string>>();
      for (const [a, tg, , hp] of f.events) {
        if (hp <= 0) continue;
        const ra = f.roster[a];
        if (ra) atkOf.set(tg, (atkOf.get(tg) ?? new Set<string>()).add(ra.userId));
      }
      for (const [t, atk] of atkOf) {
        if (fallen.has(t)) continue; // 끝내 쓰러진 사람은 활약이 아니다
        const rt = f.roster[t];
        if (!rt) continue;
        const e = survives.get(rt.userId) ?? { nick: rt.nickname, guild: rt.guildName, atk: new Set<string>(), zones: new Set<string>() };
        for (const u of atk) e.atk.add(u);
        e.zones.add(b.zone);
        survives.set(rt.userId, e);
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
  const attacks = attackRows.map((a) => ({ zone: a.zone, region: regionKo(a.region), guild: a.guild }));

  // 최다 생존·최다 처치 — **동수면 전원**(닉네임순, 최대 3명). 종전엔 정렬 뒤 [0]만 집어 동수일 때 Map 삽입
  // 순서(전투 행 순서, 불안정)로 사람이 바뀌었다: 09-10 뉴비·강화의신이 나란히 3회 생존인데 23:05 생성본은
  // 강화의신, 23:10 검수 조회는 뉴비를 내놓아 "없는 인물"로 오판했다. 사실표는 호출마다 같아야 한다.
  /**
   * 극적 활약 선정(2026-09-13 개편) — 넷 중 하나에 해당하면 후보, 점수순 최대 FEAT_MAX명.
   *  ① 처치 FEAT_MIN 이상  ② 서로 다른 공격자 FEAT_MIN 이상을 받아내고 생존
   *  ③ 단독 전멸(solo)     ④ 분전 후 전사(last)
   * 종전엔 '최다 1명(동수 전원)'만 뽑아, 그날 두 번째로 인상적인 활약이 통째로 사라졌다
   * (09-13 라프산두 3처치가 규규 6처치에 가려 탈락 → 연대기가 그 전투를 밋밋하게 서술).
   * 사실표는 호출마다 같아야 하므로 정렬은 전부 결정론(점수 → 상대 인원 → 닉네임).
   */
  const cand = new Map<string, { nick: string; guild: string; kills: number; held: number; zones: Set<string>; solo: boolean; last: boolean; foes: number }>();
  const touch = (uid: string, nick: string, guild: string) =>
    cand.get(uid) ?? (cand.set(uid, { nick, guild, kills: 0, held: 0, zones: new Set(), solo: false, last: false, foes: 0 }), cand.get(uid)!);
  for (const [uid, v] of kills) {
    const e = touch(uid, v.nick, v.guild);
    e.kills = v.n;
    for (const z of v.zones) e.zones.add(z);
  }
  for (const [uid, v] of survives) {
    const e = touch(uid, v.nick, v.guild);
    e.held = v.atk.size;
    for (const z of v.zones) e.zones.add(z);
  }
  for (const [uid, v] of drama) {
    if (!v.solo && !v.last) continue;
    const e = touch(uid, v.nick, v.guild);
    e.solo = v.solo;
    e.last = v.last;
    e.foes = v.foes;
  }
  for (const [uid, v] of drama) {
    const e = cand.get(uid);
    if (e) e.foes = Math.max(e.foes, v.foes);
  }
  // 한 전투에서는 한 사람만 — 같은 구역에서 둘셋을 뽑으면 그날 다른 전투가 통째로 이름 없이 지나간다
  // (09-13 썩은 잔교에서만 둘이 뽑혀 변경 초소의 분전이 밀려났다).
  const ranked = [...cand.entries()]
    .filter(([, v]) => v.kills >= FEAT_MIN || v.held >= FEAT_MIN || v.solo || v.last)
    .sort((a, b) =>
      Math.max(b[1].kills, b[1].held) - Math.max(a[1].kills, a[1].held) ||
      b[1].foes - a[1].foes ||
      a[1].nick.localeCompare(b[1].nick, 'ko'));
  const usedZone = new Set<string>();
  const picked: typeof ranked = [];
  for (const e of ranked) {
    if (picked.length >= FEAT_MAX) break;
    const zs = [...e[1].zones];
    if (zs.some((z) => usedZone.has(z))) continue;
    for (const z of zs) usedZone.add(z);
    picked.push(e);
  }
  // 인물 publicCode 해소 — 연대기 {u|닉|코드} 링크용(닉네임은 변경 가능, 코드는 불변).
  const featUserIds = [...new Set(picked.map((e) => e[0]))];
  const codeByUser = new Map<string, string>();
  if (featUserIds.length > 0) {
    // profiles는 역사 페이지의 읽기 전용 역할에 권한이 없다 — 코드는 링크용일 뿐이라 못 읽으면 코드 없이 간다(09-18).
    const codeRows = (await db
      .execute(sql`
      select id::text as uid, public_code from profiles where id in ${sql`(${sql.join(featUserIds.map((u) => sql`${u}::uuid`), sql`, `)})`}
    `)
      .catch(() => [])) as unknown as { uid: string; public_code: string | null }[];
    for (const r of codeRows) if (r.public_code) codeByUser.set(r.uid, r.public_code);
  }
  // 한 사람은 한 줄만 — 쓰러뜨린 수가 있으면 '처치'(더 구체적), 없으면 '수비'.
  const feats: ConquestDaySummary['feats'] = picked.map(([uid, v]) => ({
    nickname: v.nick,
    publicCode: codeByUser.get(uid) ?? null,
    guild: v.guild,
    kind: v.kills >= 2 || (v.kills > 0 && v.held < FEAT_MIN) ? ('처치' as const) : ('수비' as const),
    count: v.kills >= 2 || (v.kills > 0 && v.held < FEAT_MIN) ? v.kills : v.held,
    zones: [...v.zones],
    fell: fellOf.get(uid) ?? null,
  }));

  // 그날 해산(guild_disband) — 길드 행은 이미 삭제됐으므로 detail 스냅샷이 유일한 소스.
  // 창은 [전날 23:00, 당일 23:00) KST — 연대기가 23시에 사전생성되므로, 자정 경계 대신 생성 경계로
  // 나눠야 23:00~24:00 사이 사건이 어느 연대기에도 못 실리는 구멍이 없다(해산·개명 공통, 2026-08-31).
  const disbandRows = (await db.execute(sql`
    select detail from world_events
    where server_id = ${serverId} and type = 'guild_disband'
      and created_at >= ((${kstDay}::date - 1) + time '23:00') at time zone 'Asia/Seoul'
      and created_at <  (${kstDay}::date + time '23:00') at time zone 'Asia/Seoul'
  `)) as unknown as { detail: { guildName?: string; zones?: string[] } }[];
  const disbands = disbandRows
    .map((r) => ({ guildName: r.detail?.guildName ?? '길드', zones: r.detail?.zones ?? [] }))
    .filter((d) => d.guildName);

  // 길드명 변경(0182) — 사실표에서 옛 이름↔새 이름을 이어 주지 않으면 같은 길드가 두 세력으로 서술된다.
  // 창은 해산과 동일한 [전날 23:00, 당일 23:00) KST — 사전생성(23시) 경계 기준(위 주석 참조).
  const renameRows = (await db.execute(sql`
    select detail from world_events
    where server_id = ${serverId} and type = 'guild_rename'
      and created_at >= ((${kstDay}::date - 1) + time '23:00') at time zone 'Asia/Seoul'
      and created_at <  (${kstDay}::date + time '23:00') at time zone 'Asia/Seoul'
  `)) as unknown as { detail: { guildName?: string; before?: string } }[];
  const renames = renameRows
    .map((r) => ({ before: r.detail?.before ?? '', after: r.detail?.guildName ?? '' }))
    .filter((r) => r.before && r.after);

  // 방치 중립화(2026-08-30 이전 이력) — 이벤트만 읽는다. 중립화 규칙은 삭제됐으므로 사전 계산(예정분)은 없다.
  const neutralRows = (await db.execute(sql`
    select detail from world_events
    where server_id = ${serverId} and type = 'zone_neutralized'
      and detail->>'battleDay' = ${kstDay}
  `)) as unknown as { detail: { guildName?: string; zones?: string[] } }[];
  const neutralized = neutralRows
    .map((r) => ({ guildName: r.detail?.guildName ?? '길드', zones: r.detail?.zones ?? [] }))
    .filter((d) => d.zones.length > 0);

  // 방치 판정(0180) — 두 소스를 합쳐(zone 단위 dedup) '누가 무엇을 방치했나'를 잡는다.
  //  (1) zone_abandoned 이벤트(00시 실행분).
  //  (2) 사전생성(23시) 시점: 이벤트가 아직 없다. zones에서 방치 **예정** 구역을 직접 계산한다
  //      (소유·집행관0·그날 배치0 — markAbandonedZones와 동일 기준). victim 집합은 배치 유무로만
  //      정해져 소유권 플립 전/후가 같으므로, 사전 계산이 00시 실제 결과와 일치한다.
  const abandonedRows = (await db.execute(sql`
    select detail from world_events
    where server_id = ${serverId} and type = 'zone_abandoned'
      and detail->>'battleDay' = ${kstDay}
  `)) as unknown as { detail: { guildName?: string; zones?: string[] } }[];
  const pendingAbandonedRows = (await db.execute(sql`
    select g.name as gname, z.name as zname
    from zones z join guilds g on g.id = z.owner_guild_id
    where z.server_id = ${serverId}
      and z.owner_guild_id is not null
      and z.executor_user_id is null
      and z.id not in (
        select zone_id from guild_battle_deployments
        where server_id = ${serverId} and battle_kst_day = ${kstDay}
      )
      -- 그 전투일 시작 뒤 점령분 제외 — markAbandonedZones의 가드(06:00 KST)와 같은 기준.
      and (z.captured_at is null
           or (z.captured_at at time zone 'Asia/Seoul') < ${kstDay}::date::timestamp + interval '6 hours')
  `)) as unknown as { gname: string; zname: string }[];
  const abandonedMap = new Map<string, Set<string>>();
  const addAbandoned = (guildName: string, zone: string) => {
    const set = abandonedMap.get(guildName) ?? new Set<string>();
    set.add(zone);
    abandonedMap.set(guildName, set);
  };
  for (const r of abandonedRows)
    for (const z of r.detail?.zones ?? []) addAbandoned(r.detail?.guildName ?? '길드', z);
  for (const r of pendingAbandonedRows) addAbandoned(r.gname, r.zname);
  const abandoned = [...abandonedMap.entries()]
    .map(([guildName, zset]) => ({ guildName, zones: [...zset] }))
    .filter((d) => d.zones.length > 0);

  return {
    kstDay,
    battleCount: battles.length,
    disbands,
    neutralized,
    abandoned,
    renames,
    captures,
    defenses,
    standings: standingsRows,
    attacks,
    feats,
    // 여러 곳이면 최고 인원 한 곳만 — 동수면 공격 인원이 많은 쪽, 그다음 구역명(결정론).
    crowds: crowds
      .sort((a, b) => b.total - a.total || (b.total - b.defenders) - (a.total - a.defenders) || a.zone.localeCompare(b.zone, 'ko'))
      .slice(0, 1),
    // 열세가 큰 순(공격/수비 비율) → 공격 인원 → 구역명. 여러 곳이면 두 곳까지(그날의 활약 자리).
    underdogDefenses: underdogDefenses
      .sort(
        (a, b) =>
          b.attackerTotal / b.defenders - a.attackerTotal / a.defenders ||
          b.attackerTotal - a.attackerTotal ||
          a.zone.localeCompare(b.zone, 'ko'),
      )
      .slice(0, 2),
    // 열세가 큰 순(수비/공격 비율) → 수비 인원 → 구역명. 두 곳까지 — 열세 방어와 같은 취급.
    underdogCaptures: underdogCaptures
      .sort(
        (a, b) =>
          b.defenders / b.attackers - a.defenders / a.attackers ||
          b.defenders - a.defenders ||
          a.zone.localeCompare(b.zone, 'ko'),
      )
      .slice(0, 2),
  };
}

/** 재검수 노트 — 어드민 공개 전 검수 페이지에 diff로 노출(0119). */
export type { ChronicleReviewNote, ChronicleFeedbackKey, ChronicleImproveModel } from './chronicle-options';
export { CHRONICLE_FEEDBACK, CHRONICLE_IMPROVE_MODELS } from './chronicle-options';

/** 다듬기(검수 개선·생성 끝 다듬기)가 지키는 사실 규칙 — 코드 검증기가 못 보는 서술 뉘앙스 위주. */
const FACT_RULES = `[사실 검증 — 사실표가 유일한 진실]
- 초안의 모든 수치(구역 수·조각 수·보유 수·순위)·소유·귀속 주장을 사실표와 대조한다.
- 불일치는 사실표 기준으로 고친다. 사실표에 없는 수치·사건은 지어내지 말고 그 대목을 사실표 범위로 줄인다.
- 특히: 길드별 공격/점령 구역 수를 다른 길드 것과 합치지 말 것, 일부 구역을 잃어도 남은 영토가 있으면 '사라졌다/자리를 잃었다'류 소멸 표현 금지.
- 조각(연결) 주의: 구역을 **잃어서** 조각 수가 줄어든 것을 '이어붙였다/통합/연결'로 서술하면 오류 — 상실로 인한 감소는 감소로만.
- 교전 유무 주의: 사실표에 '수비수 N명으로 맞서 싸웠으나 패배'가 붙은 구역을 무혈·무저항·'지키는 병력이 없었다'로 쓴 문장은 오류다 — 저항을 뚫고 함락한 것으로 고쳐라. 반대로 '방어 병력 없음'인 구역에 교전 장면을 지어내도 오류.
- 집행관 단독 주의: 사실표에 '배치한 수비 없이 집행관 혼자'가 붙은 구역을 '수비를 세워 맞섰으나·병력을 세웠으나'로 쓴 문장은 오류다(길드가 수비를 배치한 적이 없다) — '집행관 혼자 맞섰다·지키는 이는 집행관뿐이었다'로 고쳐라. 무혈로 쓰는 것도 오류다(교전은 있었다).
- 재획득 표현 주의: '되찾다·탈환·수복·다시 가져오다'는 사실표 '■ 어제와 이어지는 사실'에 '하루 만의 탈환'으로 적힌 구역에만 유효하다. 그 항목이 없는 구역에 쓴 재획득 표현은 전부 '빼앗다·차지하다'로 고쳐라(반대로 항목에 적힌 구역의 '되찾다'는 오류가 아니다).
- 방어 길드 주의: 사실표 '방어'에 있는 길드를 '싸우지 않았다·다투지 않았다·조용했다'로 쓴 문장은 오류다 — '공격에 나서지 않고 {z|X}를 지켰다'처럼 방어를 그 길드의 행동으로 고쳐라.
- 누락 주의: 사실표 '공격 측'의 길드가 초안에 한 번도 등장하지 않으면, 그 길드가 어느 구역을 노렸고 결과가 어땠는지 한 문장을 사실표대로 보태라(지어내기 금지).
- 연출 순서 주의: 지도 연출은 구역 마커가 처음 나오는 문장에서 재생되고, '어제·전날·하루 만에'가 든 회고 문장의 마커는 건너뛴다. 어떤 구역이 회고 표현이 든 문장에서만 마커로 등장하면, 그 구역의 오늘 행동 문장(회고 표현 없이)을 앞에 두고 회고 문장에서는 '그 땅·그곳'으로 받도록 고쳐라. 결과 문장이 행동 문장보다 앞서면 순서를 바꿔라.
- 지역 귀속 주의: 구역의 소속 지역은 사실표의 '(X 지역)' 표기만 따른다 — 여러 지역에 걸친 사건을 한 지역 이름('왕국 전역' 등)으로 묶은 문장은 오류다(여러 지역이면 '대륙 전역'). 지역명이 등장하는 문장마다 그 문장 안의 구역 하나하나를 사실표의 '(X 지역)'과 대조하라 — 특히 한 길드가 여러 지역의 구역을 점령한 경우, 'A 지역에서는 ~' 문장 안에 다른 지역 구역이 섞여 들어간 것(예: 사실표에 '(타락 천사 부유섬 지역)'인 구역을 드래곤 화산 문장에 포함)은 오류다.
- 최초 주장 주의: '최초·처음으로' 주장은 사실표에 그렇게 명시된 경우에만 유효하다. 지역 석권의 '세 번째로 완성한'·'차례로 지배했던' 같은 서수·이력 주장은 사실표 '■ 지역 석권 현황'에 적힌 이력만 쓸 수 있고, 거기서 '오늘 깨짐'인 석권을 아직 쥔 것처럼 쓴 문장은 오류다.
- 동시 진행 주의: 그날의 점령전은 모든 구역에서 같은 시각에 벌어진다. '곧이어·뒤이어·그 직후·그러자'처럼 구역 사이에 순서를 만든 문장은 오류다 — 순서 없이 '같은 날·한편'으로 고쳐라.
- 지역별 수 주의: 'X 지역에서 N곳을 늘렸다'의 N은 사실표 점령 줄의 '지역별' 수만 쓴다. 길드 전체 획득 수를 한 지역의 수로 쓰면 오류다.
- 생존 주의: 개인 활약에 '본인은 끝내 쓰러짐'이 붙은 인물을 '자리를 지켜냈다·버텼다'의 주어로 쓴 문장은 오류다 — 쓰러뜨린 뒤 쓰러졌고 길드가 지켜냈다는 식으로 나눠 써라.
- 해산 길드에 **보유 구역이 없었으면 땅·영토 상실을 쓰지 마라** — '남긴 땅', '주인 없는 구역이 되었다' 같은 서술은 사실 오류다(해체 사실만 담담히 적는다).
- 축출 뉘앙스 주의: 사실표에 '중립지/주인 없는 땅' 점령만 있는 지역을 두고 '하나만 남았다·몰아냈다'처럼 다른 세력이 밀려난 듯 쓴 문장은 오류다 — 원래 다른 세력이 없던 곳('유일하게 발을 들였다' 류로 고쳐라).
- 방치 중립화 주의: 사실표 '방치로 중립화된 구역'은 소유 길드가 아무도 배치하지 않아 방치로 주인을 잃은 구역이다. 다른 길드가 '빼앗다·점령·함락'으로 쓰지 말 것(공격자·교전 지어내기 금지). '방치해 잃었다·관리하지 않아 중립이 되었다'처럼 담담히 서술하고, '점령전으로 빼앗긴 것이 아니라 방치로 잃은 것'처럼 굳이 대조·해설하는 문장은 붙이지 않는다.
- 방치 주의: 사실표 '방치 구역'은 소유 길드가 아무도 배치하지 않아 방치로 판정된 구역이다. **구역은 그대로 그 길드 소유**이며 잃은 것이 아니다 — '잃었다·중립이 되었다·빼앗겼다'로 쓰지 말 것. 쓸 때는 '지키는 이 없이 비워 두었다·손길이 닿지 않았다'처럼 한 문장으로 담담히 언급하고, 세금 보너스 같은 게임 수치 해설은 붙이지 않는다. 언급하지 않아도 오류가 아니다.
- 길드명 변경 주의: 사실표 '길드명 변경'의 옛 이름과 새 이름은 **같은 길드**다. 오늘 사건은 새 이름으로 쓰고, 옛 이름은 '옛 이름 ○○'처럼 한 번만 이어 준다. 두 이름을 서로 다른 세력으로 서술하면 오류다.
- 산수 주의: '어제 X곳' 뒤에 'N곳을 더해 K곳'처럼 쓴 문장은 X+N=K가 성립해야 한다 — 상실이 있어 안 맞으면 사실표 '길드별 보유 증감'대로 얻은 수와 잃은 수를 함께 쓰는 문장으로 고쳐라.
- 서사 응집: 같은 길드·같은 지역의 이야기가 여러 문단에 쪼개져 흐름이 끊기면 한 곳에 모아 재배열하라(사실 불변, 순서만 정리).
- 사실표에 분단/통합/비지 신호가 없는데 조각·분산을 논평하거나, 나뉜 영토를 '아직 하나가 아니다'류 약점으로 단정한 문장은 삭제하거나 중립으로 고쳐라.
`;

const SYSTEM_PROMPT = `너는 대륙의 정복 전쟁을 듣는 이에게 들려주는 이야기꾼이다. 길드들이 구역을 두고 벌인 일을 말하듯이 풀어 전한다.

규칙:
- 한국어. 듣는 사람에게 전말을 차근차근 들려주듯 자연스러운 구어체. 다만 과장·감탄 남발·영웅 서사시·미사여구 도배는 금지(담담하되 말하듯).
- 문장에 '— '(줄표·대시)를 절대 쓰지 않는다. 부연은 새 문장이나 쉼표, 괄호로 잇는다.
- '전투'라는 단어는 지양하고 '점령전'으로 쓴다. '전투'는 유저 부대가 실제로 맞붙어 싸우는 장면(개인 활약·교전 묘사)에만 쓴다.
- 등수(1위·2위·순위·선두 등) 표현을 쓰지 않는다. 판도는 '가장 세력이 큰', '가장 넓은 영토를 지닌', '가장 강력한' 같은 질적 표현으로 서술한다.
- 이름은 종류별 마커로 감싼다(강조용). 마커 안에는 이름 토큰만 넣고, 조사·'전역'·'일대' 같은 수식어는 마커 밖에 둔다.
  마커는 여는 중괄호 1개 + 닫는 중괄호 1개로 끝낸다(겹쳐 쓰지 말 것: {z|왕성}} 금지, {z|왕성} 만):
  - 마커 안에 숫자 id를 쓰지 말 것({z|이름|18} 금지) — id는 시스템이 붙인다. 지난 기록에 id가 보여도 따라 쓰지 마라.
  - 길드 이름 → {g|이름}
  - 인물(사용자) 이름 → {u|이름}
  - 개별 구역 이름 → {z|이름}   (예: {z|왕성}, {z|대성당}, {z|성문})
  - 지역(왕국·드래곤 화산·잊힌 신전·슬라임 늪·오크 부락·타락 천사 부유섬)에는 마커를 쓰지 않는다(일반 텍스트). 지역명은 주어진 이름 그대로 쓰고, 개별 구역을 가리킬 때만 {z|X}.
  - ★중요★ '점령전 정리'에서 「」로 감싼 이름은 바로 앞의 분류(길드/구역/인물)를 그대로 따른다: '길드 「X」'는 반드시 {g|X}, '구역 「X」'는 반드시 {z|X}, '인물 「X」'는 반드시 {u|X}. 구역 이름을 절대 {g|}(길드)로 쓰지 말 것 — 구역명과 길드명은 서로 다르며 혼동하면 안 된다. 공격의 주어는 '길드', 목적어는 '구역'이다.
- 시각·시간대 표현 금지(정오·아침·저녁·새벽·밤·자정, '종이 울리자' 등).
- 시간을 가리키는 지시어('그날·이날·오늘·그 날·하루·당일' 등)를 쓰지 말 것. 특히 문단·문장을 그런 단어로 시작하지 말고, 바로 사건·길드·구역으로 시작한다. 오늘 일어난 일은 '오늘' 대신 '이번 점령전·이번에' 또는 그냥 동사로 서술한다.
- 단, 전날과의 연속성을 말할 때는 '어제·전날·이전'을 써도 된다(흐름 표현용). 이때도 현재 일은 '오늘'이 아니라 '이번에·이번 점령전'로 받는다(예: "어제 세 곳에 이어 이번에 두 곳을 더해").
- '인생강화'라는 단어, 이모지·이모티콘 절대 금지. 대륙·세계는 고유명 없이 '대륙' 등으로만 칭한다.
- 주어진 '점령전 정리'만 근거로 쓴다. 없는 사실을 지어내지 않는다.
- **공격한 길드(공격 측)는 반드시 '공격 측' 목록을 그대로 따른다.** 그 목록에 적힌 길드만이 공격한 길드다. 소유 길드(방어 측)가 공격했다고 절대 쓰지 말 것 — 방어 측은 공격을 '받아낸' 쪽이다. '공격 측' 항목 자체가 없으면 공격 주체를 서술하지 말 것.
- **정리에 없는 종류의 사건은 다루지 않는다.** 개인 활약·방어·형세 변화 등 어떤 항목이 정리에 없으면 그 일은 없던 것이다 — 지어내지 말고, **"눈에 띄는 활약은 없었다", "저항은 없었다", "형세 변화는 없었다"처럼 부재를 굳이 언급하지도 말 것**(부재 서술은 기록문 티가 나서 금지). 있는 사건만으로 이야기를 만든다.
- **점령(captures)은 각 구역의 winner(점령 길드)를 그대로 따른다. 서로 다른 길드가 각자 다른 구역을 점령했으면 길드별로 구분해서 쓴다 — 여러 길드의 점령을 한 길드가 모두 한 것처럼 절대 합치지 않는다.** (예: 한 길드가 두 구역, 다른 길드가 한 구역을 점령했으면 둘 다 기록.)
- **구역의 소속 지역은 정리에 적힌 '(X 지역)' 표기를 그대로 따른다.** 'A 지역에서는 ~' 식으로 지역을 앞세워 서술할 때, 그 문장에는 정리에 (A 지역)으로 적힌 구역만 넣는다 — 한 길드가 서로 다른 지역의 구역들을 점령했으면 한 지역으로 묶지 말고 지역별로 나눠 쓰거나 '드래곤 화산의 {z|X}와 왕국의 {z|Y}'처럼 구역마다 지역을 붙여 쓴다.
- 방어(defenses)는 '점령'이 아니다(이미 소유한 구역을 '공격 측'의 공격으로부터 지켜낸 것). 점령 수에 포함하지 말고, 방어는 방어로만 서술한다.
- **개인 활약(feats)의 '처치'는 적을 쓰러뜨린 수이며 공격·수비 역할과 무관하다 — 방어 측 인물도 처치가 많을 수 있다. '처치'가 많다는 이유로 그 인물·길드를 공격 측으로 단정하지 말 것**(공격 측은 오직 '공격 측' 목록으로만 판단). '수비'는 **서로 다른 몇 명의 공격을 받아내고 끝까지 살아남았는지**다 — '세 차례·세 번 받아냈다'가 아니라 '세 사람의 공격을 받아냈다'로 쓴다(횟수가 아니라 사람 수).
- '최초·처음으로·사상 처음' 같은 최초 주장은 정리에 그렇게 명시된 경우에만 쓴다 — 정리에 '대륙 최초'·'첫 점령' 표기가 없으면 최초라고 단정하지 말 것(정리엔 그날 사실만 있고 과거 전체 이력은 없다).
- 중립지·빈 구역 점령만으로 어느 지역에 한 길드만 있게 된 경우, '하나만 남았다·몰아냈다·밀어냈다' 같은 축출 뉘앙스 금지 — 그 지역에 다른 세력이 원래 없었다(정리의 '중립지/빈 구역' 표기로 판단). '유일하게 발을 들였다·홀로 세력을 넓혔다'처럼 쓴다.
- **지역 '석권·통째로·전역 장악'은 정리의 이정표(milestone)에 그 길드의 '지역 전체 장악'이 명시된 경우에만 쓴다.** 명시가 없으면 한 지역에서 여러 구역을 얻었더라도 '석권·통째로 거두었다·지역 전체를 손에 넣었다'라고 하지 말 것 — 그 지역엔 다른 길드의 구역이나 중립 구역이 남아 있을 수 있다(헤드라인도 동일).
- **'지키는 세력 없던 빈 구역 · 교전 없이 접수'로 표기된 점령은 담담하고 간결하게, 표현을 변주해서 쓴다** — '비어 있던 {z|X}를 차지했다', '지키는 이 없던 {z|Y}를 손에 넣었다' 정도로. 같은 표현('주인 없는 땅' 등)을 반복하거나, '성을 접수하듯' 같은 비유, '그렇다고 ~ 작지 않았다' 식의 군더더기 논평을 붙이지 말 것.
- 개인 활약을 서술할 때는 그 활약이 나온 구역({z|마커})을 함께 언급한다(정리의 '구역 「…」 전투에서' 표기를 근거로. 구역이 많으면 대표 한두 곳만).
- 길드의 첫 등장(첫 구역 확보)은 '판도에 이름을 올렸다'가 아니라 '대륙에 이름을 알렸다'로 표현한다.
- 한 사건은 한 번만 쓴다 — 개인 활약으로 방어를 서술했으면 같은 방어를 길드 주어로 되풀이하지 마라. '{u|샤넬}이 자리를 지켜, {g|전설}이 이 구역을 방어해냈다'처럼 앞 절을 뒤 절이 다시 말하는 문장은 어색하다(2026-07-29 피드백). 활약으로 맺거나, 길드 주어로 한 번만 쓴다.
- **대괄호 [ ] 안의 내용은 계산 근거다 — 문장에 옮겨 적지 마라.** '[내역: 점령전 1 + 방치 2]' 같은 표기가 본문에 그대로 실리면 오류다. 필요하면 '점령전에서 한 곳, 방치로 두 곳을 잃어'처럼 우리말 문장으로 풀어 쓴다.
- **마지막 형세 문단에는 '길드별 보유 증감'에 나온 길드를 하나도 빠뜨리지 마라** — 이번에 싸우지 않아 '변동 없음'인 길드도 보유 구역이 있으면 형세의 일부다. 다만 억지로 늘리지 말고 '「우리」는 한 곳을 그대로 지켰다'처럼 짧게 곁들인다.
- 연결어는 한 문장에 하나만: '반대로 … 역시'처럼 대비어와 동조어를 함께 쓰지 말 것(2026-08-28). 앞 문장과 같은 종류의 사건이면 '역시·도', 다른 종류면 '반대로·한편' 중 하나만.
- 구역은 항상 소속 지역이 드러나게 쓴다: 다른 지역 이야기 문단에 어떤 구역을 끼워 넣을 때는 '왕국의 {z|성문}'처럼 지역명을 앞에 붙인다(2026-08-28 — 화산 문단에 왕국 구역이 지역 표기 없이 들어감).
- '~을 비어 있는 채로 손에 넣으며'처럼 상태를 뒤에 붙이지 말고 '비어 있던 {z|X}를 손에 넣으며'처럼 관형어로 앞에 둔다.
- 길드 보유 수 변화 요약은 '길드별 보유 증감' 수치를 그대로 따른다. 얻고 잃은 것이 모두 있으면 'N곳을 얻고 M곳을 내주어 K곳' 형태로 쓴다 — 획득만 언급하고 최종 수를 붙이면 산수가 안 맞는 문장이 된다(금지).
- '대륙 지배', '천하', '제패' 같은 과장된 총평·결론 금지. 일어난 사실만 적는다.
- 유혈·시신·신체 훼손·고문 등 잔혹한 묘사 금지. 전투와 처치는 '쓰러뜨렸다·밀어냈다·물러났다' 수준의 담담한 표현으로만 서술하고, 피나 상해를 묘사하지 않는다.
- **방어에 성공한 길드는 싸운 길드다.** '방어' 목록에 있는 길드를 '다투지 않았다·싸우지 않았다·조용히 지냈다'로 쓰면 오류 — 공격 배치가 없었으면 '공격에 나서지 않고 {z|X}를 지켰다'처럼 방어를 그 길드의 이번 행동으로 쓴다(2026-09-04 검수).
- **'공격 측' 목록의 길드는 하나도 빠뜨리지 않는다** — 실패한 공격도 어느 구역을 노렸고 누가 막았는지 한 번은 쓴다. 같은 날 영토를 잃은 길드의 실패한 공격은 시도와 상실을 한 흐름으로 잇는다(2026-09-04 검수: 마지막 땅을 잃은 길드가 같은 날 다른 구역을 노린 사실이 빠짐).
- **'가장 많은 사람이 몰린 전투'가 있으면 그날의 큰 싸움으로 다룬다** — 공격 길드별 인원과 수비 인원, 결과를 그대로 쓴다(예: '여섯을 보내고 하나를 보태 일곱으로 몰아쳤지만 셋이 막아냈다'). 수비 인원에는 집행관이 섞여 있으므로 '수비수 둘과 집행관 하나'처럼 나누어 쓰지 않는다.
- **'열세 방어'가 있으면 그날의 활약으로 세운다** — 적은 수로 더 많은 공격을 받아내고 지켜낸 전투다. 인원을 대비시켜 한두 문장으로 쓰고('셋이 일곱을 막아냈다'), 길드를 주어로 삼는다. 개인 활약이 함께 있으면 둘을 같은 문단에 묶되 같은 말을 두 번 하지 않는다.
- **개인 활약(feats)은 한 문단의 정점으로 세운다** — 인물 마커, 활약 구역, 처치·수비 수, 그 구역을 노린 '공격 측' 길드(여럿이면 '두 길드의 공세')와 그 활약이 지켜낸 것을 한두 문장에 담는다. 종속절에 끼워 넣지 말고 그 인물이 주어인 문장으로 쓴다.
- **'■ 어제와 이어지는 사실'은 그날 헤드라인 소재이거나 가장 큰 사건일 때만 **한 문장**으로 잇는다(2026-09-13 사용자 지시 — 회고가 잦으면 오늘 이야기가 묻힌다). 나머지는 회고 없이 오늘 일만 쓴다. 이을 때는 구역 마커 위치 규칙을 지킨다.** 지도 연출은 구역 마커가 **처음 등장하는 문장**에서 그 구역의 전투를 재생하고, '어제·전날·하루 만에' 같은 회고 표현이 든 문장의 마커는 건너뛴다(연출이 서술보다 앞서 터지는 것을 막기 위해). 그래서 ① 구역 마커의 첫 등장은 **오늘 그 구역에서 벌어진 행동을 말하는 문장**(노렸다·공격했다·다툼이 벌어졌다·맞섰다·밀려들었다)에 두고, 그 문장에는 회고 표현을 넣지 않는다. ② 회고는 앞뒤 문장에서 구역 이름 대신 '그 땅·그곳·이 구역'으로 받아 잇는다 — "그 땅은 어제 {g|X}에게 내주었던 곳이다", "어제 손에 넣은 땅이었다". ③ 결과(차지했다·되찾았다·지켜냈다·넘어갔다)는 행동 문장 뒤에 온다. 예: "{g|왕실}이 {z|흑요석 보루}를 다시 노렸다. 어제 {g|케프리}에게 내주었던 땅이다. {g|케프리}는 이번에도 방어 병력을 세우지 못했고, {g|왕실}은 하루 만에 그곳을 되찾았다." '되찾다·탈환' 표현은 이 항목에 적힌 구역에만 허용한다. 길드 기준 '처음 차지한'은 정리에 첫 등장으로 적힌 경우에만 쓰고, 아니면 '어제 손에 넣은'으로 쓴다.
- **인물 마커({u|})는 정리의 '개인 활약'에 적힌 인물만 쓴다.** 로스터·지난 기록·짐작으로 다른 사람 이름을 꺼내지 말 것(2026-09-10: 목록에 없는 인물의 활약을 지어낸 사건). 활약 횟수도 목록 숫자 그대로.
- **사람 수(수비수 둘·수비 한 명·넷이·일곱을)는 '가장 많은 사람이 몰린 전투'·'열세 방어'·'열세 점령'·개인 활약이 나온 구역에만 쓴다.** 정리의 '수비수 N명' 표기는 교전이 있었는지 판단하는 근거일 뿐 옮겨 적는 숫자가 아니다. 다른 구역은 '수비를 세워 맞섰지만·수비를 뚫고'처럼 수 없이 쓴다.
- **회고 표현은 되풀이하지 않는다.** '어제 … 내주었던', '하루 만에', '다시 노렸다'는 본문 전체에서 각각 한 번까지. '어제·전날'이 든 회고 문장은 본문 전체에서 한 문장만 쓰고, 나머지 연속성은 '갓 얻은 땅', '곧바로 다시 주인이 바뀌었다'처럼 회고 없이 오늘 일로 쓴다.
- **점령전은 모든 구역에서 같은 시각에 벌어진다.** 구역과 구역 사이에 '곧이어·뒤이어·그 직후·그러자' 같은 순서를 만들지 말고 '같은 날·한편'으로 잇는다(2026-09-17).
- **지역 석권 이력은 '■ 지역 석권 현황'에 적힌 것만 쓴다.** 거기서 '오늘 깨짐'인 석권을 아직 쥔 것처럼 쓰거나, '세 번째로 완성한·차례로 지배했던' 같은 서수·이력을 지어 붙이지 말 것. '다시 장악'이 적혀 있으면 그 기간·일수를 그대로 써도 좋다.
- **'X 지역에서 N곳'의 N은 점령 줄의 '지역별' 수만 쓴다.** 길드 전체 획득 수를 한 지역의 수로 옮기지 말 것.
- **잃은 구역의 보유 기간은 점령 줄의 표기를 따른다.** '어제 막 차지했던 곳'이 붙은 구역만 어제 차지한 땅이고, 'N일 동안 쥐고 있던 곳'을 함께 묶어 '어제 차지했던 곳들'로 쓰지 말 것.
- **개인 활약에 '본인은 끝내 쓰러짐'이 붙은 인물은 '자리를 지켜냈다·버텼다'의 주어로 쓰지 않는다.** 쓰러뜨린 뒤 쓰러졌고, 자리는 길드가 지켰다는 식으로 나눠 쓴다.
- **'같은 지역의 {z|X}'는 정리의 (X 지역) 표기가 실제로 같을 때만.** 구역을 지역으로 묶기 전에 표기를 다시 확인한다(2026-09-10: 오크 부락 구역을 잊힌 신전 문장에 묶은 사건).
- 첫 문장은 '■ 규모'의 싸움 수·주인이 바뀐 곳 수와 가장 큰 격전지로 연다(09-24 운영자 교정 문체).
- 사실표에 적힌 보유 기간·첫 등장·조각·비지·지역 석권은 근거가 있는 사실이니 살려 쓴다. 같은 구역을 노린 길드들은 서로 경쟁했다(동맹 없음, '합세·연합' 금지).
- 반드시 JSON만 출력: {"today": "...", "headline": "...", "headlines": ["...", "..."]}. JSON 문자열 값 안의 줄바꿈은 반드시 \\n 이스케이프로 쓴다(실제 줄바꿈 문자 금지).
  - today: 역사가가 그날 대륙에서 벌어진 일을 하나의 이야기로 풀어 들려주듯 쓴다. 아래 네 가지를 반드시 이야기 안에 녹이되, 각각을 별개 문단·라벨로 나누지 말고 사건 → 결과 → 그 의미 → 형세로 흐르는 하나의 인과 서사로 이어 쓴다(보고서 항목 나열이 아니라, 처음부터 끝까지 이어지는 한 편의 이야기):
    · 어떤 길드가 어느 구역을 노리고 부딪혔는지 — 전투의 발단과 흐름.
    · 누가 어느 구역을 점령했고 누가 막아냈는지 — 점령과 방어를 구분해서.
    · 무엇이 승패를 갈랐고 누가 활약했는지 — 개인 활약(feats)과 전투가 갈린 지점.
    · 그래서 이번 점령전 이후 대륙의 형세가 어떻게 되었는지(가장 세력이 큰 길드·기세를 질적으로, 등수 없이, 과장 없이 사실만).
    문단은 이야기 흐름에 따라 자연스럽게 나눈다(2~4문단, 어느 문단도 한 파트만 전담하지 않게 — 사건과 결과가 한 문단에서 이어지거나 활약이 결과 서술에 섞여도 좋다). 문단 사이는 빈 줄(\\n\\n)로 구분. 라벨('주요사건:' 등) 금지. 어느 문단도 '그날·이날·오늘' 같은 시간 지시어로 시작하지 말고 바로 길드·구역·사건으로 시작한다.
    사건 배치: 같은 길드·같은 지역의 이야기는 한 곳에 모아 서술한다(한 세력의 서사 중간에 다른 세력 이야기를 끼워 흐름을 끊지 말 것). '■ 역사적 사건' 이정표가 있으면 그 사건을 서사의 정점으로 배치하고, 그 지역과 관련된 점령·방어는 이정표 대목에 함께 묶는다.
  - headline: 그날을 대표하는 한 줄(25자 내외, 마커 포함, 말하듯이). 소재는 아래 우선순위로 고른다 — ① '■ 어제와 이어지는 사실'의 하루 만의 탈환·상실 ② 영토 소멸(마지막 구역 상실) ③ 열세 방어(적은 수로 지켜냄)·개인 활약 ④ 신흥 세력의 첫 구역 ⑤ 그날 새로 완성한 지역 전체 장악 ⑥ 3곳 이상 확장. 문형은 여섯 가지 중 하나를 고른다: 선언형("{g|A}, 왕국 전역을 지배하다") · 반전형("{g|A}, 하루 만에 되찾은 슬라임 늪") · 인물형("{u|B}, {z|성문}에서 넷을 베다") · 몰락형("{g|C}, 마지막 깃발을 내리다") · 대비형("{g|A}의 첫 깃발, {g|C}의 마지막 깃발") · 숫자형("열 곳 중 열 곳, {g|A}가 늪을 완성하다"). '[지난 역사]'의 최근 7일 헤드라인과 문형·핵심 동사가 겹치지 않게 하고, 같은 지역의 '전역을 지배하다'는 7일 안에 되풀이하지 말 것(다시 완성한 날은 반전형으로). 첫 등장·복귀·소멸 길드는 그날 두 번째로 큰 사건일 때만 ', {g|이름} 첫 등장'처럼 짧게 덧붙이고, 아니면 본문에서만 다룬다. 정세가 크게 바뀐 날이 아니면 빈 문자열("")로 둔다.
  - headlines: headline 후보 3~5개(첫 항목은 headline과 같은 문장). 나머지는 서로 다른 문형·다른 소재로 쓴다 — 검수자가 고르거나 고쳐 쓸 재료다. headline이 빈 문자열이면 빈 배열([]).`;

/** 그날 사건이 '큰 사건'인지 — 점령(영토 변동) 또는 주목할 개인 활약이 있으면 기록 대상('오늘' 스토리). */
/**
 * 연출 순서 검증(2026-09-05) — 오늘 전투가 있었던 구역(점령·방어)이 본문에서 **회고 문장(어제·하루 만에 …)에만**
 * 마커로 등장하면 지도 리플레이가 그 구역을 건너뛰어 종료 일괄 발화로 밀린다(9/5 검수: 용암 하구·불탄 마을·
 * 그을린 고목이 그랬다). 클라는 09-05부터 그런 구역을 회고 문장에서 바로 재생하지만, 서술은 행동 문장이 먼저 오는 편이 나아 재생성 피드백으로 쓴다.
 * 반환: 문제 구역 이름들(없으면 []).
 */
export function replayOrderIssues(text: string, battleZones: string[]): string[] {
  if (battleZones.length === 0) return [];
  const paras = text.split(/\n\n+/).map((p) => parseChronicleSegments(p));
  // raw(필터 없음) 기준 — 클라는 회고에만 나온 구역을 그 자리에서 재생하지만(09-05), 서술 품질로는 행동 문장이 먼저 오는 게 낫다.
  const skip = pastContextZoneKeysRaw(paras);
  const fires = new Set<string>();
  const mentioned = new Set<string>();
  paras.forEach((segs, p) =>
    segs.forEach((seg, i) => {
      if (seg.kind !== 'z') return;
      mentioned.add(seg.text);
      if (!skip.has(`${p}:${i}`)) fires.add(seg.text);
    }),
  );
  return battleZones.filter((z) => mentioned.has(z) && !fires.has(z));
}

export function isNotable(s: ConquestDaySummary): boolean {
  return s.captures.length > 0 || s.feats.length > 0 || s.disbands.length > 0 || s.neutralized.length > 0;
}

/**
 * 초안 생성 출력 상한(2026-09-15). 종전 2,200 고정 — 점령 14건인 날 본문이 상한에서 잘려(stop=max_tokens,
 * 약 2,080자) 세 번 모두 파싱 실패했고 23:05 틱이 우연히 짧게 써서 살아났다. 기본을 3,200으로 올리고,
 * **직전 시도가 잘렸으면** 한 단계씩 더 올린다(파싱 실패는 상한 문제가 아니라 그대로). 순수 함수.
 */
export const CHRONICLE_MAX_TOKENS = [3200, 4200, 5200] as const;
export function chronicleMaxTokens(truncations: number): number {
  return CHRONICLE_MAX_TOKENS[Math.min(truncations, CHRONICLE_MAX_TOKENS.length - 1)]!;
}

/** 오늘 사전 생성 상태(검수 페이지용) — 행 있음 / 사건 없어 생성 안 함 / 아직 없음(재시도 중). */
export async function chroniclePregenStatus(kstDay: string, serverId: number): Promise<'exists' | 'no-event' | 'pending'> {
  const [existing] = await db
    .select({ kstDay: worldChronicle.kstDay })
    .from(worldChronicle)
    .where(and(eq(worldChronicle.serverId, serverId), eq(worldChronicle.kstDay, kstDay)))
    .limit(1);
  if (existing) return 'exists';
  return isNotable(await aggregateConquestDay(kstDay, serverId)) ? 'pending' : 'no-event';
}

/**
 * 그날 연대기 생성·저장(멱등) — 그날 점령전 요약을 AI가 기록.
 * 이미 그날 행이 있으면 skip. 큰 사건 없으면 기록 안 함(별일 없는 날). KEY 없으면 throw.
 */
/**
 * 그날의 사실표(2026-09-15 분리) — 생성(generateAndStoreChronicle)과 검수 개선(improveChronicleText)이 같은 표를 쓴다.
 * 사건이 없는 날(isNotable=false)은 null. 내용은 분리 전 생성 함수 본문 그대로.
 */
async function buildChronicleFactPack(kstDay: string, serverId: number) {
  const summary = await aggregateConquestDay(kstDay, serverId);
  if (!isNotable(summary)) return null;

  // ── 소유 이력(chronicle-history.ts) — 석권 성립·붕괴, 복귀까지의 공백, 잃은 구역의 보유 기간. ──
  // 전투 직전 상태만 알던 사실표가 이력을 모델 추측에 맡겨 "차례로 지배·세 번째 완성·오랫동안·어제 차지했던"을
  // 지어냈다(09-17). 해산 중립화는 연대기 창(전날 23시~당일 23시)과 같게 KST+1시간의 날짜로 묶는다.
  const wnHist = await winnerNameFragments();
  const histBattleRows = (await db.execute(sql`
    select cb.battle_kst_day::text as day, z.name as zone, ${wnHist.winner('g', 'cb')} as guild
    from conquest_battles cb
    join zones z on z.id = cb.zone_id
    left join guilds g on g.id = cb.winner_guild_id
    where cb.server_id = ${serverId} and cb.battle_kst_day <= ${kstDay} and ${wnHist.hasWinner('cb')}
  `)) as unknown as { day: string; zone: string; guild: string | null }[];
  const histNeutralRows = (await db.execute(sql`
    select we.detail->>'battleDay' as day, zn as zone
    from world_events we, jsonb_array_elements_text(coalesce(we.detail->'zones', '[]'::jsonb)) zn
    where we.server_id = ${serverId} and we.type = 'zone_neutralized' and (we.detail->>'battleDay') <= ${kstDay}
    union all
    select to_char(((we.created_at at time zone 'Asia/Seoul') + interval '1 hour')::date, 'YYYY-MM-DD') as day, zn as zone
    from world_events we, jsonb_array_elements_text(coalesce(we.detail->'zones', '[]'::jsonb)) zn
    where we.server_id = ${serverId} and we.type = 'guild_disband'
  `)) as unknown as { day: string | null; zone: string }[];
  const ownershipEvents: OwnershipEvent[] = [
    ...histNeutralRows.filter((r) => r.day).map((r) => ({ day: r.day!, zone: r.zone, guild: null, kind: 'neutral' as const })),
    ...histBattleRows.map((r) => ({ day: r.day, zone: r.zone, guild: r.guild, kind: 'battle' as const })),
  ];
  const snaps = replayOwnership(ownershipEvents);
  const histBefore = ownersBefore(snaps, kstDay);

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
      // 집행관 단독(배치 0)은 따로 적는다 — 섞으면 '수비를 세웠다'는 없는 사실이 나간다(2026-09-13).
      const defNote =
        c.defenders > 0
          ? c.deployedDefenders > 0
            ? ` — 이전 주인 「${c.from}」 이(가) 수비수 ${c.defenders}명으로 맞서 싸웠으나 패배(교전 있었음 — 무혈·무저항 아님)`
            : ` — 이전 주인 「${c.from}」 은(는) **배치한 수비 없이 집행관 혼자** 맞섰으나 패배(교전은 있었으니 무혈로 쓰지 말고, '수비를 세웠다·병력을 세웠다'로도 쓰지 말 것)`
          : ` — 이전 주인 「${c.from}」 은(는) 방어 병력 없음`;
      // 잃은 쪽이 그 구역을 쥐고 있던 기간(09-17) — 이력 재생이 전투 직전 주인과 맞을 때만.
      const since = histBefore.get(zone) === c.from ? holdingSince(snaps, zone, c.from, kstDay) : null;
      const held = since ? daysBetween(since, kstDay) : 0;
      const tenureNote = since
        ? held <= 1
          ? ` · 「${c.from}」 이(가) 어제 막 차지했던 곳`
          : ` · 「${c.from}」 이(가) ${koDate(since)}부터 ${held}일 동안 쥐고 있던 곳('어제 차지했던'으로 쓰지 말 것)`
        : '';
      return `(길드 「${c.from}」 로부터 빼앗음${defNote}${rivalNote}${tenureNote})`;
    }
    return c.firstCapture ? `(중립지 첫 점령${rivalNote})` : `(지키는 세력 없던 빈 구역 · 교전 없이 접수${rivalNote})`;
  };
  // 구역마다 소속 지역 명시(2026-07-18) — 없으면 모델이 지역을 추측해 여러 지역에 걸친 점령을
  // 한 지역으로 묶는다(실사례: 신전·늪·오크·왕국 4개 지역 6곳을 '왕국 전역에서'로 오서술).
  const regionOf = (zone: string) => summary.captures.find((x) => x.zone === zone)?.region ?? '';
  const capLines =
    [...capByGuild.entries()]
      .map(([g, zs]) => {
        // 여러 지역에 걸치면 지역별 수를 함께 준다(09-17: 오크 부락 2곳 + 잊힌 신전 1곳을 "오크 부락에서 세 곳"으로 씀).
        const byRegion = new Map<string, number>();
        for (const z of zs) byRegion.set(regionOf(z), (byRegion.get(regionOf(z)) ?? 0) + 1);
        const split =
          byRegion.size > 1
            ? ` — 지역별 ${[...byRegion.entries()].map(([r, n]) => `${r} ${n}곳`).join('·')}(한 지역에서 늘린 수는 이 지역별 수만 쓸 것)`
            : '';
        return `· 길드 「${g}」 이(가) 구역 ${zs.map((z) => `「${z}」(${regionOf(z)} 지역)${capAnno(z)}`).join(', ')} 을(를) 점령 (총 ${zs.length}곳${split})`;
      })
      .join('\n') || '· (신규 점령 없음)';
  // 공격 측(role=attack) — 누가 어느 구역을 공격했는지. 구역별로 길드 묶음(공격 길드 정확 귀속).
  const atkByZone = new Map<string, string[]>();
  for (const a of summary.attacks) {
    const arr = atkByZone.get(a.zone) ?? [];
    arr.push(a.guild);
    atkByZone.set(a.zone, arr);
  }
  // 주어-목적어 순서 명시: "길드 「G」 이(가) 구역 「Z」 을(를) 공격" — zone:guild 콜론 포맷이 주어 오독을 유발했음.
  // 길드별 공격 합계 명시(2026-07-15) — 합계가 없으면 모델이 전투 전체 공격 구역 수를 한 길드에
  // 오귀속(실사례: 전설 6곳 공격을 '일곱 구역'으로 — 타 길드 1곳 합산). 세는 일을 모델에 맡기지 않는다.
  const atkTotalByGuild = new Map<string, Set<string>>();
  for (const a of summary.attacks) {
    const set = atkTotalByGuild.get(a.guild) ?? new Set<string>();
    set.add(a.zone);
    atkTotalByGuild.set(a.guild, set);
  }
  const atkTotals = [...atkTotalByGuild.entries()]
    .map(([g, zs]) => `· 길드 「${g}」, 이번 점령전에서 총 ${zs.size}개 구역을 공격`)
    .join('\n');
  const atkZoneLines = [...atkByZone.entries()]
    .map(([z, gs]) => `· 길드 「${[...new Set(gs)].join('」, 「')}」 이(가) 구역 「${z}」 을(를) 공격`)
    .join('\n');
  const atkLines = atkZoneLines ? `${atkZoneLines}\n${atkTotals}` : '· (공격 측 없음)';
  const defLines =
    summary.defenses
      .map((d) => {
        // 집행관 단독 방어를 '수비를 세워 막아냈다'로 쓰지 않게 구분해 준다(2026-09-13).
        const how =
          d.defenders > 0 && d.deployedDefenders === 0
            ? ' (배치한 수비 없이 집행관 혼자 막아냄 — 「수비를 세웠다」로 쓰지 말 것)'
            : d.defenders === 0
              ? ' (교전 없음 — 공격이 닿지 않았거나 싸움이 벌어지지 않음)'
              : '';
        return `· 길드 「${d.owner}」 이(가) 구역 「${d.zone}」 을(를) 방어${how}`;
      })
      .join('\n') ||
    '· (방어 없음)';
  // 사람이 몰린 전투(2026-09-10) — 규모를 숫자로. 집행관 자동 방어는 수비 인원에 섞여 있다(따로 세지 않는다).
  const crowdLines =
    summary.crowds
      .map((c) => {
        const atk = c.attackers.map((a) => `길드 「${a.guild}」 ${a.n}명`).join(' + ');
        // 주인은 있는데 아무도 지키지 않은 구역을 '0명이 수비'로 쓰지 않는다(09-17 약탈자 야영지).
        const def = c.owner && c.defenders > 0 ? `길드 「${c.owner}」 ${c.defenders}명이 수비` : c.owner ? `길드 「${c.owner}」 은(는) 지키는 이 없음` : '수비 없음';
        return `· 구역 「${c.zone}」(${c.region} 지역): ${atk} 이(가) 공격, ${def} — 총 ${c.total}명 · 결과 ${c.held ? '수비 성공' : '함락'}`;
      })
      .join('\n') || '';

  // 열세 방어(2026-09-10) — 수비가 수적으로 밀리는데 지켜낸 전투. 인원수 서술이 허용되는 둘째 자리.
  const underdogLines =
    summary.underdogDefenses
      .map((u) => {
        const atk = u.attackers.map((a) => `길드 「${a.guild}」 ${a.n}명`).join(' + ');
        return `· 구역 「${u.zone}」(${u.region} 지역): 길드 「${u.owner}」 ${u.defenders}명이 수비, ${atk} 이(가) 공격(총 ${u.attackerTotal}명) — 결과 수비 성공`;
      })
      .join('\n') || '';

  // 열세 점령(2026-09-13) — 수비보다 적은 인원으로 들어가 빼앗은 전투. 열세 방어의 반대편이고
  // 인원수 서술이 허용되는 셋째 자리다.
  const underdogCapLines =
    summary.underdogCaptures
      .map(
        (u) =>
          `· 구역 「${u.zone}」(${u.region} 지역): 길드 「${u.winner}」 ${u.attackers}명이 공격해, ${
            u.from ? `길드 「${u.from}」 ` : ''
          }수비 ${u.defenders}명을 뚫고 점령 — 적은 인원으로 빼앗은 전투`,
      )
      .join('\n') || '';

  // 활약 문구를 자명하게: '처치'=적 N명 쓰러뜨림(공·수 무관), '수비'=공격 N회 받아내고 버팀.
  // 활약 구역 명시(2026-07-20 피드백) — 어느 구역 전투에서의 활약인지 서술할 수 있게.
  const featZones = (f: (typeof summary.feats)[number]) =>
    f.zones.length > 0 ? ` — 구역 ${f.zones.map((z) => `「${z}」`).join(', ')} 전투에서` : '';
  const featLines =
    summary.feats
      .map((f) =>
        f.kind === '처치'
          ? `· 인물 「${f.nickname}」 (소속 길드 「${f.guild}」): 적 ${f.count}명 처치(공·수 역할 무관, 쓰러뜨린 수)${featZones(f)}${
              f.fell === true ? ' — 본인은 끝내 쓰러짐(버텼다·지켜냈다의 주어로 쓰지 말 것)' : f.fell === false ? ' — 끝까지 살아남음' : ''
            }`
          : `· 인물 「${f.nickname}」 (소속 길드 「${f.guild}」): 서로 다른 ${f.count}명의 공격을 받아내고 끝까지 살아남음${featZones(f)}`,
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
  const nameById = new Map(zoneRows.map((z) => [z.id, z.name]));
  const compCount = (ownerOf: Map<number, string | null>, guild: string): { comps: number; zones: number; pieces: string[][] } => {
    const mine = new Set([...ownerOf.entries()].filter(([, o]) => o === guild).map(([id]) => id));
    const seen = new Set<number>();
    const pieces: string[][] = [];
    for (const start of mine) {
      if (seen.has(start)) continue;
      const piece: string[] = [];
      const stack = [start];
      while (stack.length) {
        const cur = stack.pop()!;
        if (seen.has(cur)) continue;
        seen.add(cur);
        piece.push(nameById.get(cur) ?? String(cur));
        for (const nx of nbr.get(cur) ?? []) if (mine.has(nx) && !seen.has(nx)) stack.push(nx);
      }
      pieces.push(piece);
    }
    return { comps: pieces.length, zones: mine.size, pieces };
  };
  // 조각 구성(09-17) — "섬 영토가 갈라졌다"처럼 갈라진 자리를 추측하지 않게 조각별 구역을 적어 준다.
  const piecesNote = (pieces: string[][]) => ` — 남은 조각: ${pieces.map((pc) => `[${pc.join('·')}]`).join(' / ')}`;
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
  // 방치 중립화 오버레이(B안, timing-robust) — 사전생성(플립·중립화 전 DB=이전 소유)/사후생성(중립화
  // 후 DB=null) 어느 타이밍에도 before=이전 소유 길드·after=중립(null)으로 강제. 이로써 형세(조각)·
  // 보유 증감·순위·milestone이 '전투 없이 방치로 잃은' 구역을 정확히 반영한다.
  for (const n of summary.neutralized) {
    for (const zname of n.zones) {
      const zid = idByName.get(zname);
      if (zid !== undefined) {
        beforeOwner.set(zid, n.guildName);
        afterOwner.set(zid, null);
      }
    }
  }
  const topoGuilds = new Set<string>();
  for (const c of summary.captures) { topoGuilds.add(c.winner); if (c.from) topoGuilds.add(c.from); }
  for (const n of summary.neutralized) topoGuilds.add(n.guildName); // 방치 상실 길드도 형세 분석 대상
  const topoLines = [...topoGuilds]
    .map((g) => {
      const b = compCount(beforeOwner, g);
      const a = compCount(afterOwner, g);
      if (a.zones === 0 && b.zones > 0) return `· 길드 「${g}」: 마지막 구역까지 잃어 영토 소멸`;
      if (a.comps > b.comps && a.zones < b.zones)
        return b.comps === 1
          ? `· 길드 「${g}」: 하나로 이어져 있던 영토가 구역 상실로 ${a.comps}개 조각으로 갈라짐(분단 — 이 변화가 핵심 이야깃거리)${piecesNote(a.pieces)}`
          : `· 길드 「${g}」: 구역 상실로 영토가 ${b.comps}→${a.comps}개 조각으로 더 갈라짐(분단)${piecesNote(a.pieces)}`;
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
      // 'N개 조각으로 이어짐'은 'N개가 하나로 합쳐짐'으로 오독됨(2026-07-20 재생성 오서술) — 전후 수와 금지 표현 명시.
      if (a.comps < b.comps && b.comps > 1)
        return a.comps === 1
          ? `· 길드 「${g}」: 점령으로 흩어져 있던 영토 ${b.comps}개 조각이 모두 하나로 이어짐(완전 연결)`
          : `· 길드 「${g}」: 점령으로 영토 조각이 ${b.comps}→${a.comps}개로 줄어 일부가 이어짐(⚠ 아직 ${a.comps}개 조각으로 나뉨 — '하나로 연결됐다' 서술 금지)`;
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
    milestones.push(`· 길드 「${nextLeader}」 이(가) 가장 넓은 영토를 지닌 길드가 됨(직전까지는 「${prevLeader}」, 등수 표현 말고 질적으로 서술)`);
  const regionZoneIds = new Map<string, number[]>();
  for (const z of zoneRows) regionZoneIds.set(z.region, [...(regionZoneIds.get(z.region) ?? []), z.id]);
  // 지역 석권(2026-09-17 개편) — 전투 **전후**와 소유 이력을 함께 본다.
  // 종전엔 '전투 전 석권'만 세어 "이미 성립한 석권 있음: 슬라임 늪·부유섬 — 3번째"를 넘겼는데, 그 둘은 바로 그날
  // 깨졌다. 모델은 이걸 "앞서 두 지역을 차례로 지배했던 길드의 세 번째 완성"으로 옮겼다. 이제 유지·붕괴·성립을
  // 나눠 적고, 이력은 재생 결과가 전투 직전 DB 상태와 맞는 지역에만 싣는다. 서수('N번째')는 주지 않는다.
  const regionNames = new Map<string, string[]>();
  for (const [region, ids] of regionZoneIds) regionNames.set(region, ids.map((id) => nameById.get(id) ?? String(id)));
  const pastSweeps = sweepPeriods(snaps, regionNames, kstDay);
  const histMatches = (ids: number[]) => ids.every((id) => (histBefore.get(nameById.get(id) ?? '') ?? null) === (beforeOwner.get(id) ?? null));
  const soleOwner = (ownerOf: Map<number, string | null>, ids: number[]): string | null => {
    const owners = new Set(ids.map((id) => ownerOf.get(id) ?? null));
    return owners.size === 1 ? ([...owners][0] ?? null) : null;
  };
  const sweepLines: string[] = [];
  // '대륙 최초' 판정은 지역 순회 전에 끝낸다 — 순회 중에 세면 앞 지역의 성립이 뒤 지역의 기존 석권을 못 본다.
  const anySweepBefore = pastSweeps.length > 0 || [...regionZoneIds.values()].some((ids) => soleOwner(beforeOwner, ids) !== null);
  for (const [region, ids] of regionZoneIds) {
    const label = regionKo(region);
    const bG = soleOwner(beforeOwner, ids);
    const aG = soleOwner(afterOwner, ids);
    const trusted = histMatches(ids);
    const ongoing = trusted ? pastSweeps.find((s) => s.region === region && s.brokenOn === null && s.guild === bG) : undefined;
    if (bG && aG === bG) {
      sweepLines.push(`· ${label}: 「${bG}」 석권 유지${ongoing ? `(${koDate(ongoing.from)}부터 ${daysBetween(ongoing.from, kstDay)}일째)` : ''}`);
    } else if (bG) {
      const lostZones = ids.filter((id) => afterOwner.get(id) !== bG).map((id) => `「${nameById.get(id)}」`);
      sweepLines.push(
        `· ${label}: 「${bG}」 석권이 오늘 깨짐 — 구역 ${lostZones.join(', ')} 을(를) 잃음${
          ongoing ? `(${koDate(ongoing.from)}에 이룬 석권, ${daysBetween(ongoing.from, kstDay)}일 만)` : ''
        }. 이제 이 지역을 전부 쥔 길드는 없다`,
      );
    }
    if (aG && aG !== bG) {
      const prev = trusted
        ? pastSweeps.filter((s) => s.region === region && s.guild === aG && s.brokenOn).at(-1)
        : undefined;
      const hist = prev
        ? ` — ${koDate(prev.from)}부터 ${daysBetween(prev.from, prev.brokenOn!)}일 동안 쥐었다가 ${koDate(prev.brokenOn!)}에 흩어진 지역을 ${daysBetween(prev.brokenOn!, kstDay)}일 만에 다시 장악`
        : trusted
          ? ' — 이력상 이 길드의 첫 석권 지역'
          : '';
      sweepLines.push(`· ${label}: 「${aG}」 이(가) 오늘 전 구역 장악${hist}`);
      milestones.push(
        `· 길드 「${aG}」 이(가) ${label} 전체 ${ids.length}곳을 장악${
          anySweepBefore
            ? " ('최초'·'N번째' 같은 서수 표현 금지 — 이력은 '지역 석권 현황'만 따를 것)"
            : ' (대륙 최초의 지역 석권)'
        }`,
      );
    }
  }
  // 데뷔 후보(전날 0 → 오늘 1+)의 과거 이력 조회 — '어제 상태'만 보면 영토를 전부 잃었다
  // 돌아온 길드가 첫 등장으로 오판정된다(2026-07-22 FIRST 사건: 7/21 영토 소멸 → 7/22 복귀를
  // 헤드라인에 '첫 등장'으로 서술). 과거 점령전 승리 이력이 있으면 복귀, 없어야 진짜 첫 등장.
  const debutCandidates = [...new Set([...beforeCounts.keys(), ...afterCounts.keys()])].filter(
    (g) => (beforeCounts.get(g) ?? 0) === 0 && (afterCounts.get(g) ?? 0) > 0,
  );
  const veteranRows = debutCandidates.length
    ? ((await db.execute(sql`
        select distinct g.name from conquest_battles cb
        join guilds g on g.id = cb.winner_guild_id
        where cb.server_id = ${serverId} and cb.battle_kst_day < ${kstDay}
          and g.name in ${sql.raw(`(${debutCandidates.map((g) => `'${g.replace(/'/g, "''")}'`).join(', ')})`)}
      `)) as unknown as { name: string }[])
    : [];
  const veterans = new Set(veteranRows.map((r) => r.name));
  const shortGapGuilds: string[] = [];
  for (const g of new Set([...beforeCounts.keys(), ...afterCounts.keys()])) {
    const b = beforeCounts.get(g) ?? 0;
    const a = afterCounts.get(g) ?? 0;
    if (b > 0 && a === 0) milestones.push(`· 길드 「${g}」 영토 소멸(마지막 구역 상실)`);
    // 복귀 공백(09-17) — 하루 비었다 돌아온 길드를 "오랫동안 영토를 갖지 못했던"으로 쓴 사고.
    const wipedOn = b === 0 && a > 0 && veterans.has(g) ? lastWipeDay(snaps, g, kstDay) : null;
    const gapDays = wipedOn ? daysBetween(wipedOn, kstDay) : null;
    if (gapDays !== null && gapDays <= COMEBACK_SHORT_GAP_DAYS) shortGapGuilds.push(g);
    if (b === 0 && a > 0)
      milestones.push(
        veterans.has(g)
          ? `· 길드 「${g}」 이(가) 영토를 모두 잃었던 처지에서 다시 구역을 확보하며 판도에 복귀(재기 — 과거에 영토를 가졌던 길드다. '첫 등장'·'대륙에 이름을 알렸다' 표현 금지, '돌아왔다'류로${
              gapDays !== null
                ? `. 영토를 모두 잃은 ${koDate(wipedOn!)} 이후 ${gapDays}일 만의 복귀${gapDays <= COMEBACK_SHORT_GAP_DAYS ? " — '오랫동안·오래·한동안·긴 공백' 표현 금지" : ''}`
                : ''
            })`
          : beforeCounts.size === 0
            ? `· 길드 「${g}」 이(가) 대륙 최초로 구역을 점령`
            : `· 길드 「${g}」 이(가) 첫 구역을 확보하며 대륙에 이름을 알림(첫 등장 — '판도에 등장' 대신 이 표현으로)`,
      );
  }
  for (const d of summary.disbands) {
    if (d.zones.length > 0) milestones.push(`· 길드 「${d.guildName}」 해산 — 보유하던 ${d.zones.length}개 구역이 주인을 잃음`);
  }
  const specialFeat = summary.feats.some((f) => f.count >= 5);

  // 길드별 보유 증감(2026-07-21 피드백) — '열두 곳을 더해 40곳'처럼 상실을 빠뜨린 요약이
  // 산수 오해(30+12=42?)를 부른다. 전투 전후·획득·상실을 사실표로 명시해 정확한 요약을 강제.
  const deltaLines = [...new Set([...beforeCounts.keys(), ...afterCounts.keys()])]
    .map((g) => {
      const gained = summary.captures.filter((c) => c.winner === g).length;
      const capLost = summary.captures.filter((c) => c.from === g).length;
      // 방치 중립화로 잃은 구역(전투 상실과 별개) — 증감 산수에 포함해야 '전 b → 후 a'와 맞는다.
      const neutralLost = summary.neutralized
        .filter((n) => n.guildName === g)
        .reduce((s, n) => s + n.zones.length, 0);
      const lost = capLost + neutralLost;
      const b = beforeCounts.get(g) ?? 0;
      const a = afterCounts.get(g) ?? 0;
      // 변동이 없어도 **보유 구역이 있으면 남긴다** — 빼면 모델이 그 길드의 존재를 모른 채
      // 형세 문단을 써서 멀쩡히 영토를 가진 길드가 통째로 빠진다(2026-07-29 제보).
      if (gained === 0 && lost === 0 && a === 0) return null;
      if (gained === 0 && lost === 0) {
        return `· 길드 「${g}」: 변동 없음 — 이번 점령전 뒤에도 ${a}곳 보유`;
      }
      // ⚠ 상실 내역(전투/방치)은 산수 근거일 뿐이다. 대괄호로 감싸 문장에 옮겨 적지 않게 한다
      //   ('(점령전 상실 1, 방치 중립화 2)'가 본문에 그대로 실린 사례 — 2026-07-29 제보).
      const lostDesc =
        neutralLost > 0 ? `${lost}곳 상실 [내역: 점령전 ${capLost} + 방치 ${neutralLost}]` : `${lost}곳 상실`;
      const warn =
        gained > 0 && lost > 0
          ? ` (보유 수를 요약할 땐 획득과 상실을 함께 쓸 것. '${gained}곳을 더해 ${a}곳' 식은 산수가 안 맞아 금지)`
          : '';
      return `· 길드 「${g}」: 직전 ${b}곳에서 이번 점령전 뒤 ${a}곳 (${gained}곳 획득, ${lostDesc}${warn})`;
    })
    .filter((s): s is string => s !== null)
    .join('\n');

  // 빈 섹션은 digest에서 **통째로 제외**(2026-07-12 피드백) — '· (없음)' 플레이스홀더를
  // 먹이면 모델이 성실하게 "눈에 띄는 활약은 없었다"류 부재 서술을 생성해 템플릿 티가 난다.
  // 안 보여주면 못 쓴다 + baseContent의 부재 서술 금지 규칙이 이중 방어.
  const digestSections: string[] = [];
  // 규모(09-24) — 첫 문장('열네 번의 싸움이 벌어져 열 곳의 주인이 바뀐')의 근거. 종전엔 사실표에 없어 모델이 세거나 빼먹었다.
  digestSections.push(`■ 규모: 싸움이 벌어진 구역 ${summary.battleCount}곳, 그중 주인이 바뀐 곳 ${summary.captures.length}곳`);
  if (summary.attacks.length > 0) digestSections.push(`■ 공격 측(구역을 공격한 길드):\n${atkLines}`);
  if (summary.captures.length > 0) digestSections.push(`■ 신규 점령(길드별):\n${capLines}`);
  if (summary.defenses.length > 0)
    digestSections.push(`■ 방어(점령 아님 — 소유 길드가 위 공격을 막아냄):\n${defLines}`);
  if (crowdLines)
    digestSections.push(
      `■ 그날 가장 많은 사람이 몰린 전투(${CROWD_MIN}명 이상인 곳 중 한 곳 — 수비 인원에는 집행관 자동 방어가 포함되어 있으니 따로 나누지 말 것):\n${crowdLines}`,
    );
  if (underdogLines)
    digestSections.push(
      `■ 열세 방어(수적으로 밀리면서 지켜낸 전투 — 그날의 팀 단위 활약. 인원에는 집행관 자동 방어가 섞여 있으니 따로 나누지 말 것):\n${underdogLines}`,
    );
  if (underdogCapLines)
    digestSections.push(
      `■ 열세 점령(수비보다 적은 인원으로 들어가 빼앗은 전투 — 열세 방어와 같은 무게의 활약. 인원수를 써도 되는 자리다):\n${underdogCapLines}`,
    );
  if (summary.feats.length > 0) digestSections.push(`■ 개인 활약:\n${featLines}`);
  if (topoLines)
    digestSections.push(
      `■ 지형 형세(지도 분석 — 형세 서술 근거. 조각은 지역 경계와 무관하게 맞닿은 구역끼리 묶은 것이다. 한 지역 안의 영토가 갈라졌다고 옮기지 말고 조각 구성대로 쓸 것):\n${topoLines}`,
    );
  if (sweepLines.length > 0)
    digestSections.push(
      `■ 지역 석권 현황(한 길드가 지역 구역을 전부 쥔 곳, 오늘 전후 비교 — 석권 이력은 여기 적힌 것만 쓰고, 오늘 깨진 석권을 아직 쥔 것처럼 쓰지 말 것):\n${sweepLines.join('\n')}`,
    );
  if (summary.renames.length > 0)
    digestSections.push(
      `■ 길드명 변경(같은 길드다 — 두 세력으로 쓰지 말 것):\n` +
        summary.renames.map((r) => `· 길드 「${r.before}」 이(가) 오늘부터 「${r.after}」 (으)로 이름을 바꿈 — 오늘 사건은 새 이름으로 부르고, 필요하면 '옛 이름 ○○'로 한 번만 잇는다`).join('\n'),
    );
  if (summary.disbands.length > 0)
    digestSections.push(
      // 보유 구역이 없던 해산에 '남긴 땅' 서술이 붙던 오류(2026-07-28) — 섹션 제목에서 단정하지 않고
      // 길드별로 '구역 없음'을 명시해, 없는 땅을 지어내지 않게 한다.
      `■ 길드 해산(이 길드들은 오늘 해체됨):\n` +
        summary.disbands
          .map((d) =>
            d.zones.length > 0
              ? `· 길드 「${d.guildName}」 해산 — 보유하던 구역 ${d.zones.map((z) => `「${z}」`).join(', ')} 이(가) 중립화`
              : `· 길드 「${d.guildName}」 해산 — **보유 구역 없음**(잃은 땅이 없으므로 땅·영토를 언급하지 말 것)`,
          )
          .join('\n'),
    );
  if (summary.neutralized.length > 0)
    digestSections.push(
      `■ 방치로 중립화된 구역(아무도 공격도 수비도 하지 않아 방치로 주인을 잃은 구역. 점령전 패배가 아님):\n` +
        summary.neutralized
          .map((n) => `· 길드 「${n.guildName}」 이(가) 관리하지 않은 구역 ${n.zones.map((z) => `「${z}」`).join(', ')} 이(가) 방치되어 중립이 됨`)
          .join('\n'),
    );
  if (summary.abandoned.length > 0)
    digestSections.push(
      `■ 방치 구역(아무도 공격도 수비도 하지 않은 소유 구역. **소유는 그대로** — 잃은 것이 아니며 보유 증감에 포함하지 말 것):\n` +
        summary.abandoned
          .map((n) => `· 길드 「${n.guildName}」 이(가) 구역 ${n.zones.map((z) => `「${z}」`).join(', ')} 을(를) 지키는 이 없이 비워 둠`)
          .join('\n'),
    );
  if (deltaLines) digestSections.push(`■ 길드별 보유 증감(보유 수 서술은 이 수치만 따를 것):\n${deltaLines}`);
  if (milestones.length > 0) digestSections.push(`■ 역사적 사건(연표 등재 사유):\n${milestones.join('\n')}`);
  // 어제 정리 — 연속성 사실(코드 확정)과 아래 [어제 점령전 결과] 블록에 함께 쓴다.
  const prevDay = addDaysToKstDay(kstDay, -1);
  const y = await aggregateConquestDay(prevDay, serverId);
  const continuity = continuityFacts(summary, y);
  // 회고는 한 문장만 허용되는데(검증기 6번) 항목이 여럿이면 모델이 둘 이상을 회고로 써 매일 재생성을 불렀다(09-24 시험).
  // 코드가 한 가지를 골라 표시하고 나머지는 회고 없이 쓰게 한다.
  const retroPick = pickRetroFact(continuity, summary.crowds.map((c) => c.zone), summary.feats.flatMap((f) => f.zones));
  const continuityLines = continuity.map((l, i) =>
    i === retroPick
      ? `${l}\n  ★ 회고 문장('어제·전날')은 이 사실 하나에만 쓴다`
      : `${l}\n  → 회고 없이 오늘 일로만 쓴다('갓 얻은 땅·곧바로 다시 주인이 바뀐'처럼, '어제·전날' 금지)`,
  );
  if (continuity.length > 0)
    digestSections.push(
      `■ 어제와 이어지는 사실(코드가 어제 정리와 대조해 확정 — 이 항목에 적힌 구역에만 '되찾다·하루 만에' 표현 허용):\n${continuityLines.join('\n')}`,
    );
  const digest = `[점령전 정리 — 이 귀속을 그대로 따를 것]\n` + digestSections.join('\n');

  // ── 사실 검증 컨텍스트(chronicle-facts.ts) — 재생성 피드백·재검수본 채택 판정 공용. ──
  const attackersByZone = new Map<string, Set<string>>();
  for (const a of summary.attacks) attackersByZone.set(a.zone, new Set([...(attackersByZone.get(a.zone) ?? []), a.guild]));
  const gains = new Map<string, number>();
  const losses = new Map<string, number>();
  for (const c of summary.captures) {
    gains.set(c.winner, (gains.get(c.winner) ?? 0) + 1);
    if (c.from) losses.set(c.from, (losses.get(c.from) ?? 0) + 1);
  }
  const guildCounts = new Map<string, number[]>();
  for (const g of new Set([...afterCounts.keys(), ...gains.keys(), ...losses.keys()])) {
    const after = afterCounts.get(g) ?? 0;
    const gn = gains.get(g) ?? 0;
    const ls = losses.get(g) ?? 0;
    guildCounts.set(g, [gn, ls, after, after - gn + ls]);
  }
  // 지형 형세의 조각 수('4개 조각', '3→4개 조각')도 그 길드 문장에 나올 수 있는 수다(09-24 오탐: '조각은 네 곳으로').
  for (const line of (topoLines ?? '').split('\n')) {
    const g = line.match(/길드 「([^」]+)」/)?.[1];
    if (!g) continue;
    const nums = [...line.matchAll(/(\d+)(?:→(\d+))?개 조각/g)].flatMap((m) => [Number(m[1]), ...(m[2] ? [Number(m[2])] : [])]);
    if (nums.length) guildCounts.set(g, [...(guildCounts.get(g) ?? []), ...nums]);
  }
  const factCtx: FactCheckContext = {
    zoneRegion: new Map(zoneRows.map((z) => [z.name, (REGION_META as Record<string, { label: string }>)[z.region]?.label ?? z.region])),
    regionLabels: REGION_KO_VALUES,
    feats: summary.feats.map((f) => ({ nickname: f.nickname, count: f.count })),
    // 인원수 서술 허용 구역(2026-09-13 확장) — 최다 인원 1곳 · 열세 방어 · 열세 점령 ·
    // **개인 활약이 나온 구역**. 활약한 사람을 쓸 수 있는데 그가 몇을 쓰러뜨렸는지를 못 쓰면
    // "둘을 베고 전사했다"가 검증에 걸려 서술이 밋밋해진다(09-13 변경 초소).
    headcountZones: [
      ...summary.crowds.map((c) => c.zone),
      ...summary.underdogDefenses.map((u) => u.zone),
      ...summary.underdogCaptures.map((u) => u.zone),
      ...summary.feats.flatMap((f) => f.zones),
    ],
    // '되찾다' 허용 = 어제 그 구역을 잃은 길드가 오늘 그 구역을 노렸거나 차지함(시도·실패 포함).
    recaptureZones: y.captures
      .filter((yc) => yc.from && (attackersByZone.get(yc.zone)?.has(yc.from) || summary.captures.some((c) => c.zone === yc.zone && c.winner === yc.from)))
      .map((yc) => yc.zone),
    yesterdayZones: [...y.captures.map((c) => c.zone), ...y.defenses.map((d) => d.zone)],
    guildCounts,
    // 그날 전투가 있었던 구역 전부 — 하나라도 본문에서 빠지면 재생성 피드백으로 잡는다.
    battleZones: [...new Set([...summary.captures.map((c) => c.zone), ...summary.defenses.map((d) => d.zone)])],
    captureBy: new Map(summary.captures.map((c) => [c.zone, { winner: c.winner, from: c.from }] as const)),
    // 09-17 추가 — 어제 귀속·지역별 수·짧은 복귀 공백·쓰러진 인물.
    yesterdayCaptureBy: new Map(y.captures.map((c) => [c.zone, c.winner] as const)),
    regionCounts: (() => {
      const m = new Map<string, Map<string, { gain: number; loss: number; after: number; before: number }>>();
      const bump = (g: string | null | undefined, region: string, key: 'gain' | 'loss' | 'after' | 'before') => {
        if (!g) return;
        const byRegion = m.get(g) ?? new Map();
        const c = byRegion.get(region) ?? { gain: 0, loss: 0, after: 0, before: 0 };
        c[key] += 1;
        byRegion.set(region, c);
        m.set(g, byRegion);
      };
      for (const c of summary.captures) {
        bump(c.winner, c.region, 'gain');
        bump(c.from, c.region, 'loss');
      }
      for (const z of zoneRows) {
        bump(afterOwner.get(z.id), regionKo(z.region), 'after');
        bump(beforeOwner.get(z.id), regionKo(z.region), 'before');
      }
      return m;
    })(),
    shortGapGuilds,
    fellFeats: summary.feats.filter((f) => f.fell === true).map((f) => f.nickname),
    // 09-24 — 사실표에 근거가 있는 기간·첫 등장·지형·석권 서술을 가려내는 기준(chronicle-facts.ts 19~22).
    heldDays: new Map(
      summary.captures.flatMap((c) => {
        if (!c.from || histBefore.get(c.zone) !== c.from) return [];
        const since = holdingSince(snaps, c.zone, c.from, kstDay);
        return since ? [[c.zone, daysBetween(since, kstDay)] as const] : [];
      }),
    ),
    // 석권 'N일째·N일 만'·복귀 'N일 만' 같은 구역 무관 일수 — 사실표 문장에서 그대로 읽는다(표시 문구와 한 곳에서 맞물림).
    otherDays: [...digest.matchAll(/(\d+)일(?:째| 만| 동안)/g)].map((m) => Number(m[1])),
    debutGuilds: milestones.flatMap((l) => {
      const m = l.match(/길드 「([^」]+)」 이\(가\) (?:첫 구역을 확보|대륙 최초로)/);
      return m ? [m[1]!] : [];
    }),
    topoGuilds: [...(topoLines ?? '').matchAll(/길드 「([^」]+)」/g)].map((m) => m[1]!),
    sweepGuilds: [...new Set(sweepLines.flatMap((l) => [...l.matchAll(/「([^」]+)」/g)].map((m) => m[1]!)))],
  };

  // ── 연속성 맥락(참고용) — 오늘의 사실은 위 정리만 따르되, 흐름·판도는 아래를 참고해 이어 쓴다. ──
  // 현재 영토 현황(누적 점령 결과) — '정세' 문단 근거. **afterCounts(전투+방치중립화 반영)** 사용:
  // raw summary.standings는 as-if-flipped(전투)만 반영하고 중립화를 빼지 않아, 사전생성 시점에
  // 방치 상실 구역까지 보유로 세어 정세를 실제(공개 후)와 어긋나게 만든다(2026-07-24 계열 버그).
  // 조각 상시 표기는 제거 유지(2026-07-16) — 변화 신호(topoLines) 있을 때만 서술 재료.
  const standLines =
    [...afterCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([guild, zones]) => `· 길드 「${guild}」: ${zones}곳 보유`)
      .join('\n') || '· (보유 길드 없음)';

  // 어제 점령전 결과(있으면) — 전날과의 연속성(y는 위 연속성 사실 계산과 공유).
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
  // 문체 참고(2026-09-10) — 직전 기록일의 본문(운영자가 공개 전 검수·교정한 완료본)을 문장 리듬·어휘·구성의
  // 본보기로 준다. 사실은 오늘 정리만 따르게 못 박고, 마커 id는 벗겨 모델이 id를 따라 쓰지 않게 한다.
  const [styleRow] = await db
    .select({ todayText: worldChronicle.todayText })
    .from(worldChronicle)
    .where(and(eq(worldChronicle.serverId, serverId), lt(worldChronicle.kstDay, kstDay)))
    .orderBy(desc(worldChronicle.kstDay))
    .limit(1);
  const styleRef = (styleRow?.todayText ?? '').replace(/\{([guz])\|([^}|]+)\|[^}]*\}/g, '{$1|$2}').trim();
  const styleBlock = styleRef
    ? `\n\n[문체 참고 — 직전 기록 본문(검수 완료본). 문장 리듬·어휘·문단 구성만 본받고, 사실·이름·숫자·날짜는 절대 가져오지 말 것]\n${styleRef}`
    : '';
  const context =
    `[현재 영토 현황 — '정세' 문단 근거(누적 점령 결과)]\n${standLines}\n\n` +
    `[어제(${prevDay}) 점령전 결과 — 연속성 참고용]\n${yesterdayBlock}\n\n` +
    `[지난 역사 — 어제까지 누적, 흐름 참고용]\n${histLines || '· (이전 기록 없음)'}` +
    styleBlock;

  const bigChange = milestones.length > 0 || specialFeat;
  return { summary, zoneRows, idByName, milestones, digest, factCtx, context, bigChange };
}
export type ChronicleFactPack = NonNullable<Awaited<ReturnType<typeof buildChronicleFactPack>>>;

/**
 * 마커 도구(2026-09-15 분리) — 이름 집합·교정·강제·보강·위반 검출. 생성과 검수 개선이 공유.
 */
async function buildMarkerTools(summary: ConquestDaySummary, zoneRows: ChronicleFactPack['zoneRows'], idByName: ChronicleFactPack['idByName'], serverId: number) {
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
    sql`select id, name, emblem_color, emblem_url from guilds where server_id = ${serverId}`,
  )) as unknown as {
    id: string | number;
    name: string;
    emblem_color: string | null;
    emblem_url: string | null;
  }[];
  for (const g of allGuildRows) guildNames.add(g.name);
  // 길드 정체성 스냅샷(0141) — 이름은 해산 후 재사용될 수 있어 표시값을 id에 묶어 박제한다.
  const guildRefByName = new Map<string, ChronicleGuildRef>(
    allGuildRows.map((g) => [
      g.name,
      { id: Number(g.id), name: g.name, color: g.emblem_color, emblemUrl: g.emblem_url },
    ]),
  );
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
  const REGION_NAMES = REGION_KO_VALUES;
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
  // {g|이름} → {g|이름|길드id}(0141) — 유저 마커와 같은 이유. 이름은 해산 후 재사용될 수 있어
  // 이름만으로는 옛 기록이 동명의 다른 길드를 가리킨다. 3필드는 재적용해도 무해(정규식이 비껴감).
  // 현존하지 않는 길드(해산)는 id 0 — '이 이름은 이미 사라진 길드'를 못 박는 센티널이다.
  // 2필드로 남기면 나중에 같은 이름의 길드가 생겼을 때 옛 기록이 그쪽으로 링크된다.
  // ⚠ 모델이 id까지 붙여 출력하는 경우({g|이름|18})가 있어(2026-08-28 '독안개 골'에 얼어붙은 샘 id) 기존 id는 무시하고
  // 이름 기준으로 항상 다시 매긴다 — 이 함수는 오늘 본문·헤드라인(모델 출력)에만 적용된다.
  const enrichGuildMarkers = (s: string): string =>
    s.replace(/\{g\|([^}|]+)(?:\|\d+)?\}/g, (_mm, n: string) => {
      const name = n.trim();
      return `{g|${name}|${guildRefByName.get(name)?.id ?? 0}}`;
    });
  // {z|이름} → {z|이름|구역id}(0141) — 구역은 '장소'라 개명(0135 '잊힌 신전'→'설원 신전')되면 옛
  // 기록의 이름이 지도와 어긋나고, 리플레이 연출 트리거(구역명 매칭)도 함께 끊긴다. id를 달아
  // 표시는 현재 이름으로 해소하고 트리거는 id로 건다. 미해결(삭제된 구역)은 이름만 남긴다.
  const enrichZoneMarkers = (s: string): string =>
    s.replace(/\{z\|([^}|]+)(?:\|\d+)?\}/g, (mm, n: string) => {
      const name = n.trim();
      const id = idByName.get(name);
      // 모델이 붙인 id는 신뢰하지 않는다 — 이름으로 해소되면 그 id, 안 되면 이름만 남긴다.
      return id != null ? `{z|${name}|${id}}` : `{z|${name}}`;
    });
  const enrichMarkers = (s: string) => enrichZoneMarkers(enrichGuildMarkers(enrichUserMarkers(s)));

  return { guildRefByName, fixBraces, correctMarkers, findViolations, enforceMarkers, enrichMarkers };
}

/**
 * 어제 정리와 오늘 정리를 대조해 **코드가 확정하는 연속성 사실**(2026-09-04). 검수 때 매번 손보던 대목 —
 * 하루 만의 탈환(어제 A가 B에게서 빼앗은 구역을 오늘 B가 되찾음), 어제 얻은 땅의 하루 만 상실, 어제 얻은
 * 땅을 오늘 지켜냄. 모델은 이 항목에 적힌 구역에만 '되찾다·하루 만에' 표현을 쓸 수 있다(그 외 과거 이력은
 * 정리에 없으므로 여전히 금지). 순수 함수 — 테스트 tests/guild/chronicle-continuity.test.ts.
 */
/** 가벼운 위반 — 같은 표현 반복(검증기 6·23)·줄표(24). 사실은 틀리지 않았고 운영자가 한눈에 고칠 수 있다. */
export function isLightFactIssue(issue: string): boolean {
  return /표현이 \d+번 나온다|줄표\(—\)/.test(issue);
}

/**
 * 회고로 쓸 연속성 사실 하나 고르기(09-24) — 하루 만의 탈환 > 하루 만의 상실 > 어제 얻은 땅의 방어. 같은 순위면
 * 가장 많은 사람이 몰린 곳 > 개인 활약이 나온 곳 > 먼저 나온 것. 항목이 없으면 -1.
 */
export function pickRetroFact(lines: string[], crowdZones: string[], featZones: string[]): number {
  if (lines.length === 0) return -1;
  const zoneOf = (l: string) => l.match(/구역 「([^」]+)」/)?.[1] ?? '';
  const rank = (l: string) => (/되찾음/.test(l) ? 0 : /잃음/.test(l) ? 1 : 2);
  const bonus = (l: string) => (crowdZones.includes(zoneOf(l)) ? 0 : featZones.includes(zoneOf(l)) ? 1 : 2);
  let best = 0;
  for (let i = 1; i < lines.length; i++) {
    const [a, b] = [lines[i]!, lines[best]!];
    if (rank(a) < rank(b) || (rank(a) === rank(b) && bonus(a) < bonus(b))) best = i;
  }
  return best;
}

export function continuityFacts(today: ConquestDaySummary, yesterday: ConquestDaySummary): string[] {
  const out: string[] = [];
  const yCap = new Map(yesterday.captures.map((c) => [c.zone, c] as const));
  for (const c of today.captures) {
    const y = yCap.get(c.zone);
    if (!y || !c.from || y.winner !== c.from) continue;
    if (y.from === c.winner) {
      out.push(
        `· 구역 「${c.zone}」: 어제 길드 「${y.winner}」 이(가) 「${c.winner}」 에게서 빼앗았던 곳을 오늘 「${c.winner}」 이(가) 되찾음 — 하루 만의 탈환('되찾다' 허용)`,
      );
    } else {
      out.push(`· 구역 「${c.zone}」: 길드 「${c.from}」 이(가) 어제 얻은 땅을 하루 만에 「${c.winner}」 에게 잃음`);
    }
  }
  for (const d of today.defenses) {
    const y = yCap.get(d.zone);
    if (!y || y.winner !== d.owner) continue;
    const attackers = [...new Set(today.attacks.filter((a) => a.zone === d.zone).map((a) => a.guild))];
    out.push(
      `· 구역 「${d.zone}」: 길드 「${d.owner}」 이(가) 어제 손에 넣은 땅을 오늘 지켜냄${attackers.length > 0 ? `(공격 측: 「${attackers.join('」, 「')}」)` : ''}`,
    );
  }
  return out;
}

export type ChroniclePreview = {
  today: string;
  headline: string;
  headlineCandidates: string[];
  digest: string;
  usage: { calls: number; input: number; output: number; cacheRead: number; cacheWrite: number };
  /** 채택본의 검사 결과(마커·연출 순서·사실) — dryRun 비교용. */
  issues: string[];
};

export async function generateAndStoreChronicle(
  kstDay: string,
  serverId: number,
  /** dryRun — DB에 저장하지 않고 생성 결과만 돌려준다(프롬프트 점검용, 2026-09-04). */
  opts: { dryRun?: boolean } = {},
): Promise<{ created: boolean; reason?: string; preview?: ChroniclePreview }> {
  const [existing] = await db
    .select({ kstDay: worldChronicle.kstDay })
    .from(worldChronicle)
    .where(and(eq(worldChronicle.serverId, serverId), eq(worldChronicle.kstDay, kstDay)))
    .limit(1);
  if (existing && !opts.dryRun) return { created: false, reason: 'already' };

  // 같은 (서버, 날짜)를 동시에 두 번 생성하지 않는다(23시대 5분 틱이 앞 틱의 생성 중에 또 들어오던 문제).
  const release = opts.dryRun ? async () => {} : await acquireChronicleLock(serverId, kstDay);
  if (!release) return { created: false, reason: 'in-progress' };
  try {
    return await generateLocked(kstDay, serverId, opts);
  } finally {
    await release();
  }
}

async function generateLocked(
  kstDay: string,
  serverId: number,
  opts: { dryRun?: boolean },
): Promise<{ created: boolean; reason?: string; preview?: ChroniclePreview }> {
  const pack = await buildChronicleFactPack(kstDay, serverId);
  // 토큰 사용량(09-24) — 호출마다 합산해 생성 끝에 한 줄로 남긴다(비용·캐시 적중을 로그로 보려고).
  const usage = { calls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  const track = (u: { input_tokens?: number | null; output_tokens?: number | null; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null } | undefined) => {
    usage.calls += 1;
    usage.input += u?.input_tokens ?? 0;
    usage.output += u?.output_tokens ?? 0;
    usage.cacheRead += u?.cache_read_input_tokens ?? 0;
    usage.cacheWrite += u?.cache_creation_input_tokens ?? 0;
  };
  if (!pack) return { created: false, reason: 'no-event' };
  const { summary, zoneRows, idByName, milestones, digest, factCtx, context, bigChange } = pack;
  const tools = await buildMarkerTools(summary, zoneRows, idByName, serverId);
  const { guildRefByName, fixBraces, correctMarkers, findViolations, enforceMarkers, enrichMarkers } = tools;

  // 규칙은 SYSTEM_PROMPT 한 곳에만 둔다(09-24) — 종전엔 여기 2,300자가 SYSTEM과 겹쳐 두 곳이 어긋났다. 여기는 날마다 바뀌는 지시만.
  const baseContent =
    `${kstDay} 점령전 기록.\n\n${digest}\n\n${context}\n\n` +
    (bigChange
      ? `이번 점령전은 역사에 남는 날이다. headline은 '■ 역사적 사건'${milestones.length === 0 ? '(기록적 개인 활약)' : ''}과 '■ 어제와 이어지는 사실'을 재료로, 위 headline 규칙의 우선순위·문형대로 쓴다. 이정표가 '지역 전체 장악'이어도 구역 수 나열('6곳 장악')은 쓰지 말 것. 본문에서도 그 이정표를 구체적으로 짚는다(어느 구역을 마지막으로 그 지역 전부가 깃발 아래 놓였는지). headlines에는 문형이 서로 다른 후보 3~5개를 함께 낸다.\n`
      : `이번 점령전은 역사에 남을 날이 아니다. headline은 반드시 빈 문자열(""), headlines는 빈 배열([])로 둔다.\n`) +
    `위 규칙대로 JSON({today, headline, headlines})만 출력하라.`;

  // ── 생성 + 검증 재시도(최대 3회) — 위반(마커 없는 이름)을 피드백으로 재생성 유도. ──
  // 재시도로도 남으면 enforceMarkers가 결정론 백스톱(동명 모호만 최종 잔존 가능, warn).
  // 첫 요청(사실표·맥락·규칙, 수천 토큰)에 캐시를 건다 — 재시도 2·3회차가 같은 앞부분을 캐시로 읽어 입력 비용이 1/10이 된다.
  const messages: Anthropic.Messages.MessageParam[] = [
    { role: 'user', content: [{ type: 'text', text: baseContent, cache_control: { type: 'ephemeral' } }] },
  ];
  // 연출 순서 검증 대상 — 오늘 점령·방어가 있었던 구역(회고 문장에만 등장하면 리플레이가 건너뛴다).
  const battleZones = [...new Set([...summary.captures.map((c) => c.zone), ...summary.defenses.map((d) => d.zone)])];
  let today = '';
  let headline = '';
  let headlineCandidates: string[] = [];
  // 잘림 횟수 — 직전 시도가 max_tokens에서 끊겼으면 다음 시도의 상한을 올린다(chronicleMaxTokens).
  let truncations = 0;
  // 가장 나은 시도(2026-09-24) — 종전엔 3번째 시도를 위반이 남아도 그대로 채택해, 1차보다 나빠진 3차가 실리기도 했다.
  // 위반 점수(마커 3·연출 순서 2·사실 1)가 가장 낮은 시도를 고른다. 동점이면 먼저 나온 쪽(피드백 전 문체가 더 자연스럽다).
  type Cand = { score: number; candT: string; candH: string; headlines: unknown; viol: string[]; orderIssues: string[]; facts: string[]; heads: string[] };
  let best: Cand | null = null;
  const adopt = (c: Cand) => {
    if (c.viol.length > 0) console.warn(`[chronicle] 마커 위반 잔존(재시도 소진) — enforce 백스톱 적용: ${c.viol.join(', ')}`);
    if (c.orderIssues.length > 0) console.warn(`[chronicle] 연출 순서 위반 잔존(재시도 소진): ${c.orderIssues.join(', ')}`);
    if (c.facts.length > 0) console.warn(`[chronicle] 사실 검증 위반 잔존(재시도 소진) ${c.facts.length}건:\n${c.facts.join('\n')}`);
    today = enrichMarkers(enforceMarkers(c.candT));
    headline = enrichMarkers(enforceMarkers(c.candH));
    // 헤드라인 후보(0193) — 첫 항목은 채택안, 나머지는 문형이 다른 대안. 마커 보정만 하고 검수는 하지 않는다.
    const rawList = Array.isArray(c.headlines) ? c.headlines : [];
    // 제목 후보도 검사한다(09-24) — 없는 인물·근거 없는 탈환·석권 서수가 든 후보는 검수자에게 내놓지 않는다.
    const cleaned = rawList
      .filter((h): h is string => typeof h === 'string')
      .map((h) => enrichMarkers(enforceMarkers(correctMarkers(fixBraces(h.trim())))))
      .filter((h) => h.length > 0 && h.length <= 120 && headlineIssues(h, factCtx).length === 0);
    // 채택 제목에 위반이 남았고 깨끗한 후보가 있으면 후보로 바꾼다.
    if (c.heads.length > 0 && cleaned.length > 0) {
      console.warn(`[chronicle] 제목 위반 잔존 — 깨끗한 후보로 교체: ${c.heads.join(' / ')}`);
      headline = cleaned[0]!;
    }
    headlineCandidates = bigChange ? [...new Set([headline, ...cleaned].filter(Boolean))].slice(0, 5) : [];
  };
  for (let attempt = 0; attempt < 3; attempt++) {
    const maxTokens = chronicleMaxTokens(truncations);
    const res = await client().messages.create({
      model: MODEL_ID,
      max_tokens: maxTokens,
      // Sonnet 5는 thinking 미지정 시 adaptive 기본(2026 변경) — 짧은 예산이 thinking에
      // 소진돼 본문이 비는 사고 방지(7/20 연대기 pregen 전량 실패). 명시 비활성.
      thinking: { type: 'disabled' },
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages,
    });
    track(res.usage);
    const block = res.content.find((b) => b.type === 'text');
    const raw = block && 'text' in block ? block.text : '';
    const truncated = res.stop_reason === 'max_tokens';
    // 파싱 실패도 재시도 소재(2026-07-18) — 종전엔 즉시 throw라 한 번의 깨진 JSON이 생성 전체를 무산시켰다.
    const parsed = parseModelJson<{ today?: string; headline?: string; headlines?: unknown }>(raw);
    if (!parsed) {
      // 빈 응답 진단(2026-07-21) — raw가 비면 파싱 이전 문제(중단 사유·블록 구성)를 남긴다.
      console.warn(
        `[chronicle] 응답 진단 stop=${res.stop_reason} max_tokens=${maxTokens} blocks=[${res.content.map((b) => b.type).join(',')}] rawLen=${raw.length}`,
      );
      // 잘림과 깨진 JSON을 구분한다(2026-09-15) — 잘림은 상한 문제라 상한을 올리고 더 짧게 쓰라고 하고,
      // 깨진 JSON은 같은 내용을 JSON만으로 다시 쓰라고 한다. 로그·에러 코드도 갈라 원인이 바로 보이게.
      if (attempt === 2) {
        // 앞 시도 중 쓸 만한 것이 있으면 그것을 채택한다(마지막 응답이 깨졌다고 전부 버리지 않는다).
        if (best) {
          console.warn(`[chronicle] 마지막 응답 파싱 실패 — 앞 시도 중 최선(점수 ${best.score}) 채택`);
          adopt(best);
          break;
        }
        throw new Error(`${truncated ? 'CHRONICLE_TRUNCATED' : 'CHRONICLE_PARSE_FAIL'}: ${raw.slice(0, 200)}`);
      }
      if (truncated) {
        truncations += 1;
        console.warn(`[chronicle] 출력 잘림(max_tokens ${maxTokens}) → 상한 ${chronicleMaxTokens(truncations)}로 재생성(attempt ${attempt + 1})`);
      } else {
        console.warn(`[chronicle] JSON 파싱 실패 → 재생성(attempt ${attempt + 1})`);
      }
      messages.push(
        { role: 'assistant', content: raw },
        {
          role: 'user',
          content: truncated
            ? '출력이 길이 상한에서 잘렸다. 같은 사실을 빠짐없이 담되 문장을 더 간결하게 줄여, JSON({today, headline, headlines})만으로 다시 출력하라. 문자열 값 안의 줄바꿈은 반드시 \\n으로 이스케이프한다.'
            : '출력이 유효한 JSON이 아니다. 문자열 값 안의 줄바꿈은 반드시 \\n으로 이스케이프해서, 같은 내용을 JSON({today, headline, headlines})만으로 다시 출력하라.',
        },
      );
      continue;
    }
    const candT = correctMarkers(fixBraces((parsed.today ?? '').trim()));
    const candH = bigChange ? correctMarkers(fixBraces((parsed.headline ?? '').trim())) : '';
    const viol = [...new Set([...findViolations(candT), ...findViolations(candH)])];
    const orderIssues = replayOrderIssues(candT, battleZones);
    const facts = factIssues(candT, factCtx);
    const heads = bigChange ? headlineIssues(candH, factCtx) : [];
    const cand: Cand = { score: viol.length * 3 + orderIssues.length * 2 + facts.length + heads.length, candT, candH, headlines: parsed.headlines, viol, orderIssues, facts, heads };
    if (candT && (!bigChange || candH) && (!best || cand.score < best.score)) best = cand;
    // 조기 종료(09-24) — 남은 게 가벼운 문체 위반(같은 표현 반복·줄표)뿐이면 재생성하지 않는다. 사실·마커·연출 순서는
    // 그대로 재시도한다. 재생성 한 번이 호출 한 번(본문 전체 출력)이라, 가벼운 위반 때문에 비용·시간을 들이지 않는다.
    const lightOnly = viol.length === 0 && orderIssues.length === 0 && heads.length === 0 && facts.length <= 2 && facts.every(isLightFactIssue);
    if (cand.score === 0 || lightOnly || attempt === 2) {
      if (cand.score > 0 && best && best !== cand) console.warn(`[chronicle] 재시도 소진 — 마지막(점수 ${cand.score})보다 나은 앞 시도(점수 ${best.score}) 채택`);
      adopt(best ?? cand);
      break;
    }
    console.warn(
      `[chronicle] 재생성(attempt ${attempt + 1}) — 마커 위반 ${viol.length}건${viol.length ? `: ${viol.join(', ')}` : ''} · 연출 순서 위반 ${orderIssues.length}건${orderIssues.length ? `: ${orderIssues.join(', ')}` : ''} · 사실 검증 위반 ${facts.length}건`,
    );
    const feedback: string[] = [];
    if (facts.length > 0)
      feedback.push(
        `사실표와 어긋나는 문장이 있다(코드가 사실표와 대조한 결과라 예외 없이 고친다):\n${facts.map((f) => `- ${f}`).join('\n')}`,
      );
    if (heads.length > 0) feedback.push(`제목(headline)이 사실표와 어긋난다:\n${heads.map((f) => `- ${f}`).join('\n')}`);
    if (viol.length > 0)
      feedback.push(
        `다음 이름이 마커 없이(평문 또는 「」로) 등장했다: ${viol.join(', ')}\n` +
          `길드는 {g|이름}, 인물은 {u|이름}, 개별 구역은 {z|이름}으로 — 위 이름의 모든 등장 위치를 종류에 맞는 마커로 감싼다.`,
      );
    if (orderIssues.length > 0)
      feedback.push(
        `다음 구역은 '어제·전날·하루 만에' 같은 회고 표현이 든 문장에서만 마커로 등장해 지도 연출이 본문과 어긋난다: ${orderIssues.join(', ')}\n` +
          `각 구역을 오늘의 행동 문장(회고 표현 없이 — 노렸다·공격했다·맞섰다)에서 먼저 {z|이름}으로 언급하고, 회고 문장에서는 구역 이름 대신 '그 땅·그곳'으로 받아라. 결과 문장은 행동 문장 뒤에 둔다.`,
      );
    messages.push(
      { role: 'assistant', content: raw },
      // 지적한 문장만 고치게 한다(09-24) — 통째로 다시 쓰게 하면 멀쩡하던 문장에서 새 오류가 생기고 문체도 흔들렸다.
      {
        role: 'user',
        content:
          feedback.join('\n\n') +
          '\n\n위에서 지적한 문장만 고치고, 지적받지 않은 문장은 한 글자도 바꾸지 마라. 고친 본문 전체를 JSON({today, headline, headlines})으로만 출력하라.',
      },
    );
  }
  if (!today) throw new Error('CHRONICLE_EMPTY');
  if (bigChange && !headline) throw new Error('CHRONICLE_EMPTY');

  // 자동 다듬기 패스는 두지 않는다(09-24 시험: 여섯 번 중 다섯 번이 연출 순서·사실 위반을 늘려 버려졌다 — 비용만 들었다).
  // 사실은 위 검증 루프가, 구성·중복·흐름은 운영자가 검수 화면의 '개선'(polishChronicle)으로 필요할 때만 다듬는다.
  const reviewNotes: ChronicleReviewNote[] = [];

  // 길드 표시값 스냅샷(0141) — 그 서버에 **그 시점 존재한 길드 전부**를 담는다.
  // 본문에 등장한 길드만 담으면 리플레이가 문양을 못 찾는다: 리플레이는 본문과 무관하게 그날
  // 시작 시점의 모든 구역 소유 길드 문양을 세우고(조용히 지킨 길드 포함), 이름으로 실시간 조회
  // 폴백을 타면 동명 재창설 시 문양이 새 길드로 바뀐다. 길드 수만큼이라 크기도 유계다.
  const guildRefs: ChronicleGuildRef[] = [...guildRefByName.values()];

  console.info(
    `[chronicle] usage ${kstDay} s${serverId} calls=${usage.calls} in=${usage.input} out=${usage.output} cacheRead=${usage.cacheRead} cacheWrite=${usage.cacheWrite}`,
  );
  if (opts.dryRun) {
    const issues = [...findViolations(today), ...replayOrderIssues(today, battleZones), ...factIssues(today, factCtx), ...headlineIssues(headline, factCtx)];
    return { created: false, reason: 'dry-run', preview: { today, headline, headlineCandidates, digest, usage, issues } };
  }
  await db
    .insert(worldChronicle)
    .values({ serverId, kstDay, todayText: today, headline, reviewNotes, guildRefs, headlineCandidates })
    .onConflictDoNothing({ target: [worldChronicle.serverId, worldChronicle.kstDay] });
  return { created: true };
}

export type ChronicleData = {
  /** '오늘' — 최신 기록일의 긴 스토리(없으면 null). */
  today: string | null;
  /** '오늘' 기록일(YYYY-MM-DD) — 홈 카드 '새 역사' 티저의 열람 처리용(localStorage 값). */
  todayDay: string | null;
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
    todayDay: rows[0] ? String(rows[0].kstDay) : null,
    // '어제' 탭(2026-07-17 추가) — 최신 공개일의 직전 기록 전문.
    yesterday: rows[1]?.todayText ?? null,
    yesterdayDay: rows[1] ? String(rows[1].kstDay) : null,
    // '전체' 연표 — 헤드라인이 있는 날(정세가 크게 바뀐 날)만 노출.
    list: rows
      .filter((r) => r.headline && r.headline.trim().length > 0)
      .map((r) => ({ kstDay: String(r.kstDay), headline: r.headline })),
  };
}

// ── 검수 개선 패스(2026-09-15) — 운영자가 고른 방향대로 현재 텍스트를 고친다. 저장하지 않는다(화면이 교체·저장). ──

const IMPROVE_SYSTEM_PROMPT = `너는 대륙 연대기의 수석 편집자다. 운영자가 고른 개선 방향대로 현재 본문을 고친다.

${FACT_RULES}
[개선 방향 — 요청된 항목만]
- 요청된 방향에 해당하는 대목만 고치고, 그 밖의 문장은 원문 그대로 둔다(다시 쓰기 금지, 과장·미사여구 추가 금지).
- 요청에 '사실관계 확인'이 없어도 사실표와 어긋난 문장은 고친다 — 사실표가 유일한 진실이다.
- 제목 항목이 요청되지 않았으면 headline은 입력 그대로 돌려준다.
- '더 간결하게'가 요청되지 않았으면 전체 길이는 원문의 ±15% 안에서 유지한다.
- 고친 곳은 changes에 전부 남긴다(kind: 사실 수정은 "fact", 표현·흐름은 "style"). 바꾼 것이 없으면 changes는 빈 배열.

[마커 — 절대 규칙]
- 길드={g|이름}, 인물={u|닉} 또는 {u|닉|코드}, 개별 구역={z|이름}. 모든 이름은 등장할 때마다 마커로 감싼다. 마커 문법을 새로 만들거나 깨뜨리지 말 것. 입력에 있던 마커의 id·코드는 그대로 유지한다.

출력은 JSON 하나만: {"today": string, "headline": string, "changes": [{"kind": "fact"|"style", "before": string, "after": string, "reason": string}]}`;

export type ChronicleImproveResult =
  | { ok: true; today: string; headline: string; changes: ChronicleReviewNote[]; issuesBefore: string[]; issuesAfter: string[] }
  | { ok: false; reason: string; issuesBefore: string[] };

/** 코드 검증 묶음 — 마커 누락·연출 순서·사실 대조를 한 목록으로(검수 화면 표시용). */
function chronicleIssuesWith(
  text: string,
  tools: { findViolations: (s: string) => string[] },
  factCtx: FactCheckContext,
  battleZones: string[],
): string[] {
  return [
    ...tools.findViolations(text).map((v) => `마커 누락: ${v}`),
    ...replayOrderIssues(text, battleZones).map((v) => `연출 순서: ${v}`),
    ...factIssues(text, factCtx),
  ];
}

/** 코드 검증만(LLM 없음) — 검수 화면 '사실 검증' 버튼. 사건 없는 날은 빈 목록. */
export async function chronicleIssues(kstDay: string, serverId: number, text: string): Promise<string[]> {
  const pack = await buildChronicleFactPack(kstDay, serverId);
  if (!pack) return [];
  const tools = await buildMarkerTools(pack.summary, pack.zoneRows, pack.idByName, serverId);
  const battleZones = [...new Set([...pack.summary.captures.map((c) => c.zone), ...pack.summary.defenses.map((d) => d.zone)])];
  return chronicleIssuesWith(text, tools, pack.factCtx, battleZones);
}

/**
 * 검수 개선 — 현재 텍스트(운영자 수정분 포함)를 그날 사실표와 함께 모델에 주고, 고른 방향대로 고친 본문을
 * 돌려준다. 저장하지 않는다. 결과는 생성 재검수와 같은 코드 검증을 거쳐 마커 위반이 있거나 연출 순서·사실
 * 위반이 원문보다 늘면 버린다(사유 반환). 파싱 실패는 1회 재시도.
 */
export async function improveChronicleText(input: {
  kstDay: string;
  serverId: number;
  today: string;
  headline: string;
  feedback: ChronicleFeedbackKey[];
  note?: string;
  model: ChronicleImproveModel;
}): Promise<ChronicleImproveResult> {
  const pack = await buildChronicleFactPack(input.kstDay, input.serverId);
  if (!pack) return { ok: false, reason: '그날은 기록할 사건이 없어 사실표를 만들 수 없습니다.', issuesBefore: [] };
  const { summary, zoneRows, idByName, digest, context, factCtx } = pack;
  const tools = await buildMarkerTools(summary, zoneRows, idByName, input.serverId);
  const battleZones = [...new Set([...summary.captures.map((c) => c.zone), ...summary.defenses.map((d) => d.zone)])];
  const issuesBefore = chronicleIssuesWith(input.today, tools, factCtx, battleZones);

  const asks = input.feedback.map((k) => `- ${CHRONICLE_FEEDBACK[k].label}: ${CHRONICLE_FEEDBACK[k].instruction}`);
  const note = (input.note ?? '').trim();
  if (note) asks.push(`- 운영자 지시: ${note.slice(0, 300)}`);
  if (asks.length === 0) return { ok: false, reason: '개선 방향을 하나 이상 고르세요.', issuesBefore };
  const wantHeadline = input.feedback.includes('headline');
  return polishChronicle({ digest, context, today: input.today, headline: input.headline, asks, wantHeadline, model: input.model, tools, factCtx, battleZones, issuesBefore });
}

type MarkerTools = Awaited<ReturnType<typeof buildMarkerTools>>;

/**
 * 다듬기 공용 핵심(09-24) — 검수 화면의 '개선' 버튼과 생성 끝의 다듬기 패스가 같은 프롬프트·채택 판정을 쓴다.
 * 종전 생성은 별도 재검수 프롬프트(사실 20여 항목·문체 3줄)를 돌렸는데, 사실은 코드 검증기가 맡고 운영자가 매일
 * 고치는 건 중복·흐름·구성이라 목표가 어긋났다. 채택 판정: 마커 위반 0, 연출 순서·사실 위반이 늘지 않을 것.
 */
async function polishChronicle(p: {
  digest: string;
  context: string;
  today: string;
  headline: string;
  asks: string[];
  wantHeadline: boolean;
  model: ChronicleImproveModel;
  tools: MarkerTools;
  factCtx: FactCheckContext;
  battleZones: string[];
  issuesBefore: string[];
  track?: (u: Anthropic.Messages.Usage) => void;
}): Promise<ChronicleImproveResult> {
  const { digest, context, asks, wantHeadline, tools, factCtx, battleZones, issuesBefore } = p;
  const input = { today: p.today, headline: p.headline, model: p.model };

  const userContent =
    `[사실표 — 유일한 진실]\n${digest}\n\n${context}\n\n[요청된 개선 방향]\n${asks.join('\n')}\n\n[현재 본문]\n` +
    JSON.stringify({ today: input.today, headline: input.headline }) +
    `\n\n개선 결과를 JSON으로만 출력하라.`;
  const messages: { role: 'user' | 'assistant'; content: string }[] = [{ role: 'user', content: userContent }];

  // Fable은 thinking 항상 켜짐(파라미터 거부) — 지정하지 않고 출력 예산만 넉넉히. Sonnet·Opus는 생성과 같이 비활성.
  // 출력 = 본문 전체 + changes 목록이라 초안 생성보다 길다 — 첫 실측(09-15) 3,200에서 잘림(rawLen 3,360). 5,000/8,000.
  const isFable = input.model === 'claude-fable-5-1';
  let parsed: { today?: string; headline?: string; changes?: ChronicleReviewNote[] } | null = null;
  for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
    const res = await client().messages.create({
      model: input.model,
      max_tokens: isFable ? 8000 : 5000,
      ...(isFable ? {} : { thinking: { type: 'disabled' as const } }),
      system: [{ type: 'text', text: IMPROVE_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages,
    });
    p.track?.(res.usage);
    const block = res.content.find((b) => b.type === 'text');
    const raw = block && 'text' in block ? block.text : '';
    parsed = parseModelJson<{ today?: string; headline?: string; changes?: ChronicleReviewNote[] }>(raw);
    if (!parsed) {
      const truncated = res.stop_reason === 'max_tokens';
      console.warn(`[chronicle.improve] ${truncated ? '출력 잘림' : 'JSON 파싱 실패'} stop=${res.stop_reason} rawLen=${raw.length} (attempt ${attempt + 1})`);
      messages.push(
        { role: 'assistant', content: raw },
        {
          role: 'user',
          content: truncated
            ? '출력이 길이 상한에서 잘렸다. 본문은 그대로 두되 changes는 가장 중요한 8건까지만, reason은 한 문장으로 줄여 JSON({today, headline, changes})만으로 다시 출력하라. 문자열 값 안의 줄바꿈은 반드시 \\n으로 이스케이프한다.'
            : '출력이 유효한 JSON이 아니다. 문자열 값 안의 줄바꿈은 반드시 \\n으로 이스케이프해서, 같은 내용을 JSON({today, headline, changes})만으로 다시 출력하라.',
        },
      );
    }
  }
  if (!parsed) return { ok: false, reason: '모델 응답을 읽지 못했습니다(JSON 파싱 실패 2회).', issuesBefore };

  const fix = (s: string) => tools.enrichMarkers(tools.enforceMarkers(tools.correctMarkers(tools.fixBraces(s.trim()))));
  const today = fix(parsed.today ?? '');
  const headline = wantHeadline && (parsed.headline ?? '').trim() ? fix(parsed.headline ?? '') : input.headline;
  if (!today) return { ok: false, reason: '모델이 빈 본문을 돌려줬습니다.', issuesBefore };

  const viol = [...tools.findViolations(today), ...tools.findViolations(headline)];
  if (viol.length > 0) return { ok: false, reason: `마커 누락 ${viol.length}건(${viol.slice(0, 5).join(', ')}) — 결과를 버렸습니다.`, issuesBefore };
  const orderBefore = replayOrderIssues(input.today, battleZones).length;
  const orderAfter = replayOrderIssues(today, battleZones);
  if (orderAfter.length > orderBefore)
    return { ok: false, reason: `연출 순서 위반이 늘어(${orderAfter.length}건) 결과를 버렸습니다: ${orderAfter.slice(0, 3).join(' / ')}`, issuesBefore };
  const factsBefore = factIssues(input.today, factCtx).length;
  const factsAfter = factIssues(today, factCtx);
  if (factsAfter.length > factsBefore)
    return { ok: false, reason: `사실 검증 위반이 늘어(${factsAfter.length}건) 결과를 버렸습니다: ${factsAfter.slice(0, 3).join(' / ')}`, issuesBefore };

  const changes = (parsed.changes ?? [])
    .filter((c) => c && (c.kind === 'fact' || c.kind === 'style') && typeof c.after === 'string')
    .slice(0, 12);
  return { ok: true, today, headline, changes, issuesBefore, issuesAfter: chronicleIssuesWith(today, tools, factCtx, battleZones) };
}
