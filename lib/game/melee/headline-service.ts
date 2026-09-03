import 'server-only';

import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import type { MeleeFinale, MeleeHeadlinePick, MeleeHeadlines } from '@/lib/db/schema/melee';

import {
  emptyHistory,
  generateHeadlines,
  type HeadlineBattle,
  type HeadlineHistory,
  type HeadlineParticipant,
} from './headlines';

/**
 * 대난투 헤드라인 서비스(0184) — 엔진(순수)에 DB 재료를 먹이고 결과를 melee_battles.headlines에 저장.
 *
 * 이력은 누적표 없이 **하루 1회 집계 쿼리**로 만든다: 유저별 통산(참가·우승·준우승·시상대·공격·방어·처치·최고 순위·
 * 마지막 우승일)은 melee_participants 그룹 집계 1방, 연속(우승·맞대결·천적)은 최근 30일만 재생. 09:00에 한 번 도는
 * 작업이라 배틀이 1년치(30만 행) 쌓여도 수백 ms — 누적표는 그때 가서 붙여도 늦지 않다.
 */

const STREAK_LOOKBACK_DAYS = 30;
const MAX_PICKS = 4;
const MAX_TEXT_LEN = 80;

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
function prevDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
function shiftDays(date: string, delta: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

type BattleRow = {
  id: string;
  battle_date: string;
  status: 'running' | 'computed' | 'revealed';
  participant_count: number;
  total_rounds: number;
  champion_user_id: string | null;
  finale: MeleeFinale;
  headlines: MeleeHeadlines | null;
};

async function loadBattleRow(serverId: number, battleDate: string): Promise<BattleRow | null> {
  const [row] = (await db.execute(sql`
    select id::text, battle_date::text, status, participant_count, total_rounds, champion_user_id::text, finale, headlines
    from melee_battles where server_id = ${serverId} and battle_date = ${battleDate}::date
  `)) as unknown as BattleRow[];
  return row ?? null;
}

/** 배틀 참가자 → 엔진 입력(닉네임 스냅샷 우선, 길드장 여부·가입 경과일 조인). */
async function loadParticipants(serverId: number, battleId: string, battleDate: string): Promise<HeadlineParticipant[]> {
  const rows = (await db.execute(sql`
    select mp.user_id::text as user_id,
           coalesce(mp.nickname, c.nickname, '대장장이') as nickname,
           mp.cp_snapshot::text as cp, mp.final_rank, mp.killer_user_id::text as killer_user_id,
           mp.attack_count, mp.defense_count, mp.eliminated_round, mp.guild_name,
           exists(select 1 from guild_members gm where gm.user_id = mp.user_id and gm.role = 'leader') as is_leader,
           (${battleDate}::date - (p.created_at at time zone 'Asia/Seoul')::date)::int as age_days
    from melee_participants mp
    join profiles p on p.id = mp.user_id
    left join characters c on c.user_id = mp.user_id and c.server_id = ${serverId}
    where mp.battle_id = ${BigInt(battleId)}
  `)) as unknown as {
    user_id: string; nickname: string; cp: string; final_rank: number; killer_user_id: string | null;
    attack_count: number; defense_count: number; eliminated_round: number | null; guild_name: string | null;
    is_leader: boolean; age_days: number | null;
  }[];
  return rows.map((r) => ({
    userId: r.user_id,
    nickname: r.nickname,
    cp: Number(r.cp),
    rank: Number(r.final_rank),
    killerUserId: r.killer_user_id,
    attackCount: Number(r.attack_count),
    defenseCount: Number(r.defense_count),
    eliminatedRound: r.eliminated_round == null ? null : Number(r.eliminated_round),
    guildName: r.guild_name,
    isGuildLeader: !!r.is_leader,
    accountAgeDays: r.age_days == null ? null : Math.max(0, Number(r.age_days)),
  }));
}

/** battleDate 이전(발표된) 배틀들로 이력 구성 — 엔진의 HeadlineHistory 계약과 동일. */
export async function buildHeadlineHistory(serverId: number, battleDate: string): Promise<HeadlineHistory> {
  const h = emptyHistory();
  const [agg, killsAgg, rec, recKills, guildAgg, cnt] = await Promise.all([
    db.execute(sql`
      select mp.user_id::text as user_id,
             count(*)::int as entries,
             count(*) filter (where mp.final_rank = 1)::int as wins,
             count(*) filter (where mp.final_rank = 2)::int as seconds,
             count(*) filter (where mp.final_rank <= 3)::int as podiums,
             coalesce(sum(mp.attack_count), 0)::int as attacks,
             coalesce(sum(mp.defense_count), 0)::int as defenses,
             min(mp.final_rank)::int as best_rank,
             (max(b.battle_date) filter (where mp.final_rank = 1))::text as last_win
      from melee_participants mp join melee_battles b on b.id = mp.battle_id
      where b.server_id = ${serverId} and b.status = 'revealed' and b.battle_date < ${battleDate}::date
      group by mp.user_id
    `) as unknown as Promise<{ user_id: string; entries: number; wins: number; seconds: number; podiums: number; attacks: number; defenses: number; best_rank: number; last_win: string | null }[]>,
    db.execute(sql`
      select mp.killer_user_id::text as user_id, count(*)::int as kills
      from melee_participants mp join melee_battles b on b.id = mp.battle_id
      where b.server_id = ${serverId} and b.status = 'revealed' and b.battle_date < ${battleDate}::date and mp.killer_user_id is not null
      group by mp.killer_user_id
    `) as unknown as Promise<{ user_id: string; kills: number }[]>,
    db.execute(sql`
      select coalesce(max(mp.attack_count), 0)::int as max_attacks, coalesce(max(mp.defense_count), 0)::int as max_defenses
      from melee_participants mp join melee_battles b on b.id = mp.battle_id
      where b.server_id = ${serverId} and b.status = 'revealed' and b.battle_date < ${battleDate}::date
    `) as unknown as Promise<{ max_attacks: number; max_defenses: number }[]>,
    db.execute(sql`
      select coalesce(max(c), 0)::int as max_kills from (
        select count(*) as c from melee_participants mp join melee_battles b on b.id = mp.battle_id
        where b.server_id = ${serverId} and b.status = 'revealed' and b.battle_date < ${battleDate}::date and mp.killer_user_id is not null
        group by mp.battle_id, mp.killer_user_id) t
    `) as unknown as Promise<{ max_kills: number }[]>,
    db.execute(sql`
      select mp.guild_name, count(distinct mp.battle_id)::int as entries, count(*) filter (where mp.final_rank = 1)::int as wins
      from melee_participants mp join melee_battles b on b.id = mp.battle_id
      where b.server_id = ${serverId} and b.status = 'revealed' and b.battle_date < ${battleDate}::date and mp.guild_name is not null
      group by mp.guild_name
    `) as unknown as Promise<{ guild_name: string; entries: number; wins: number }[]>,
    db.execute(sql`
      select count(*)::int as n from melee_battles where server_id = ${serverId} and status = 'revealed' and battle_date < ${battleDate}::date
    `) as unknown as Promise<{ n: number }[]>,
  ]);
  const killsByUser = new Map(killsAgg.map((k) => [k.user_id, Number(k.kills)]));
  for (const a of agg) {
    h.stats.set(a.user_id, {
      entries: Number(a.entries), wins: Number(a.wins), seconds: Number(a.seconds), podiums: Number(a.podiums),
      kills: killsByUser.get(a.user_id) ?? 0, attacks: Number(a.attacks), defenses: Number(a.defenses),
      bestRank: a.best_rank == null ? null : Number(a.best_rank), lastWinDate: a.last_win, winStreak: 0,
    });
  }
  h.records = { maxAttacks: Number(rec[0]?.max_attacks ?? 0), maxDefenses: Number(rec[0]?.max_defenses ?? 0), maxKills: Number(recKills[0]?.max_kills ?? 0) };
  for (const g of guildAgg) { h.guildEntries.set(g.guild_name, Number(g.entries)); h.guildWins.set(g.guild_name, Number(g.wins)); }
  h.battlesBefore = Number(cnt[0]?.n ?? 0);

  // 최근 30일 재생 — 연속 우승(어제 챔피언만 필요)·맞대결·천적 streak, 어제 스냅샷, 어제 헤드라인.
  const recent = (await db.execute(sql`
    select id::text, battle_date::text as d, champion_user_id::text as champ, headlines
    from melee_battles
    where server_id = ${serverId} and status = 'revealed'
      and battle_date < ${battleDate}::date and battle_date >= ${shiftDays(battleDate, -STREAK_LOOKBACK_DAYS)}::date
    order by battle_date
  `)) as unknown as { id: string; d: string; champ: string | null; headlines: MeleeHeadlines | null }[];
  if (recent.length === 0) return h;
  const kills = (await db.execute(sql`
    select mp.battle_id::text as battle_id, mp.user_id::text as user_id, mp.killer_user_id::text as killer_user_id, mp.final_rank
    from melee_participants mp
    where mp.battle_id in ${sql.raw(`(${recent.map((r) => r.id).join(',')})`)}
  `)) as unknown as { battle_id: string; user_id: string; killer_user_id: string | null; final_rank: number }[];
  const byBattle = new Map<string, typeof kills>();
  for (const k of kills) (byBattle.get(k.battle_id) ?? byBattle.set(k.battle_id, []).get(k.battle_id)!).push(k);

  let pair = new Map<string, number>();
  let same = new Map<string, { killer: string; days: number }>();
  let prevDate: string | null = null;
  for (const r of recent) {
    const consecutive = prevDate === prevDay(r.d);
    const rows = byBattle.get(r.id) ?? [];
    const ids = new Set(rows.map((x) => x.user_id));
    const pairNext = new Map<string, number>();
    const sameNext = new Map<string, { killer: string; days: number }>();
    for (const x of rows) {
      if (!x.killer_user_id || !ids.has(x.killer_user_id)) continue;
      const key = pairKey(x.user_id, x.killer_user_id);
      pairNext.set(key, (consecutive ? pair.get(key) ?? 0 : 0) + 1);
      const p = consecutive ? same.get(x.user_id) : undefined;
      sameNext.set(x.user_id, { killer: x.killer_user_id, days: p && p.killer === x.killer_user_id ? p.days + 1 : 1 });
    }
    pair = pairNext;
    same = sameNext;
    prevDate = r.d;
  }
  const last = recent[recent.length - 1]!;
  if (last.d === prevDay(battleDate)) {
    h.pairStreak = pair;
    h.sameKillerStreak = same;
    const rows = byBattle.get(last.id) ?? [];
    const ranks = new Map(rows.map((x) => [x.user_id, Number(x.final_rank)]));
    const killerOf = new Map<string, string>();
    for (const x of rows) if (x.killer_user_id) killerOf.set(x.user_id, x.killer_user_id);
    const podium = [...rows].sort((a, b) => Number(a.final_rank) - Number(b.final_rank)).slice(0, 3).map((x) => x.user_id);
    h.yesterday = { date: last.d, championUserId: last.champ ?? '', ranks, killerOf, podium };
    const picks = last.headlines?.picks ?? [];
    h.usedYesterdayCodes = new Set(picks.map((p) => p.code));
    h.usedYesterdaySubjects = new Set(picks.flatMap((p) => p.subjects ?? []));
    // 어제 챔피언의 연속 우승 일수 — 어제부터 거꾸로 같은 챔피언인 날 수.
    if (last.champ) {
      let streak = 0;
      for (let i = recent.length - 1; i >= 0; i--) {
        const r = recent[i]!;
        if (r.champ !== last.champ) break;
        if (i < recent.length - 1 && recent[i + 1]!.d !== shiftDays(r.d, 1)) break;
        streak += 1;
      }
      const s = h.stats.get(last.champ);
      if (s) s.winStreak = streak;
    }
  }
  return h;
}

export type MeleeHeadlineResult = { ok: true; headlines: MeleeHeadlines } | { ok: false; reason: 'NO_BATTLE' | 'NOT_COMPUTED' };

/**
 * 생성·저장 — 이미 있으면 그대로(force면 덮어씀: 운영자 수정분도 버린다). 배틀이 computed/revealed일 때만.
 * 09:00 melee-run 직후·발표 백스톱·어드민 재생성이 같은 함수를 쓴다.
 */
export async function generateAndStoreMeleeHeadlines(
  serverId: number,
  battleDate: string,
  opts: { force?: boolean } = {},
): Promise<MeleeHeadlineResult> {
  const row = await loadBattleRow(serverId, battleDate);
  if (!row) return { ok: false, reason: 'NO_BATTLE' };
  if (row.status === 'running') return { ok: false, reason: 'NOT_COMPUTED' };
  if (row.headlines && !opts.force) return { ok: true, headlines: row.headlines };
  const [parts, history] = await Promise.all([
    loadParticipants(serverId, row.id, row.battle_date),
    buildHeadlineHistory(serverId, row.battle_date),
  ]);
  const battle: HeadlineBattle = {
    date: row.battle_date,
    participantCount: Number(row.participant_count),
    totalRounds: Number(row.total_rounds),
    championUserId: row.champion_user_id ?? parts.find((p) => p.rank === 1)?.userId ?? '',
    finale: { roster: row.finale?.roster ?? [], events: row.finale?.events ?? [] },
  };
  const { candidates, picks } = generateHeadlines(battle, parts, history);
  const headlines: MeleeHeadlines = {
    candidates: candidates.map((c) => ({ code: c.code, category: c.category, text: c.text, score: Math.round(c.score * 100) / 100, subjects: c.subjects })),
    picks: picks.map((p) => ({ code: p.code, text: p.text, subjects: p.subjects })),
    generatedAt: new Date().toISOString(),
    editedAt: null,
  };
  await db.execute(sql`
    update melee_battles set headlines = ${JSON.stringify(headlines)}::jsonb
    where id = ${BigInt(row.id)}
  `);
  return { ok: true, headlines };
}

/** 운영자 선택 저장 — 후보는 유지, picks만 교체(최대 4줄·80자·빈 줄 불가). */
export async function saveMeleeHeadlinePicks(
  serverId: number,
  battleDate: string,
  picks: MeleeHeadlinePick[],
): Promise<{ ok: true } | { ok: false; reason: 'NO_BATTLE' | 'NOT_GENERATED' | 'INVALID' }> {
  const row = await loadBattleRow(serverId, battleDate);
  if (!row) return { ok: false, reason: 'NO_BATTLE' };
  if (!row.headlines) return { ok: false, reason: 'NOT_GENERATED' };
  const cleaned = picks
    .map((p) => ({ code: String(p.code || 'custom').slice(0, 40), text: String(p.text ?? '').replace(/\s+/g, ' ').trim(), subjects: p.subjects?.slice(0, 8) }))
    .filter((p) => p.text.length > 0);
  if (cleaned.length > MAX_PICKS || cleaned.some((p) => p.text.length > MAX_TEXT_LEN)) return { ok: false, reason: 'INVALID' };
  const next: MeleeHeadlines = { ...row.headlines, picks: cleaned, editedAt: new Date().toISOString() };
  await db.execute(sql`
    update melee_battles set headlines = ${JSON.stringify(next)}::jsonb where id = ${BigInt(row.id)}
  `);
  return { ok: true };
}

/** 발표·결과 화면용 — 선택 문장만. 없으면 빈 배열. */
export async function getMeleeHeadlineTexts(serverId: number, battleDate: string): Promise<string[]> {
  const row = await loadBattleRow(serverId, battleDate);
  return (row?.headlines?.picks ?? []).map((p) => p.text);
}

/** 우편 본문에 붙일 블록 — 빈 줄 + [오늘의 대난투] + "· 문장" 줄들. 선택이 없으면 빈 문자열. */
export function formatHeadlineBlock(texts: readonly string[]): string {
  if (texts.length === 0) return '';
  return `\n\n[오늘의 대난투]\n${texts.map((t) => `· ${t}`).join('\n')}`;
}

export type MeleeReviewItem = {
  serverId: number;
  battleDate: string;
  status: 'running' | 'computed' | 'revealed';
  participantCount: number;
  /** 1~3위 닉네임(우편 미리보기용) — top10의 앞 3명. */
  podium: string[];
  /** 1~10위(검수 화면 표, 2026-09-03) — 배틀 시점 스냅샷 값. */
  top10: { rank: number; nick: string; cp: number; attacks: number; defenses: number; eliminatedRound: number | null; guildName: string | null }[];
  headlines: MeleeHeadlines | null;
};

/** 어드민 검수 목록 — 최근 배틀 N개(+지정 날짜). 1~10위(시상대 포함) 동봉. */
export async function loadMeleeReviewItems(opts: { limit?: number; extraDate?: string | null } = {}): Promise<MeleeReviewItem[]> {
  const limit = opts.limit ?? 2;
  const rows = (await db.execute(sql`
    select id::text, server_id, battle_date::text, status, participant_count, headlines
    from melee_battles
    where status in ('computed', 'revealed')
    order by battle_date desc, server_id
    limit ${limit}
  `)) as unknown as { id: string; server_id: number; battle_date: string; status: MeleeReviewItem['status']; participant_count: number; headlines: MeleeHeadlines | null }[];
  if (opts.extraDate && /^\d{4}-\d{2}-\d{2}$/.test(opts.extraDate) && !rows.some((r) => r.battle_date === opts.extraDate)) {
    const extra = (await db.execute(sql`
      select id::text, server_id, battle_date::text, status, participant_count, headlines
      from melee_battles where battle_date = ${opts.extraDate}::date and status in ('computed', 'revealed')
      order by server_id
    `)) as unknown as typeof rows;
    rows.push(...extra);
  }
  const items: MeleeReviewItem[] = [];
  for (const r of rows) {
    const top = (await db.execute(sql`
      select mp.final_rank as rank, coalesce(mp.nickname, c.nickname, '대장장이') as nick,
             mp.cp_snapshot::text as cp, mp.attack_count as attacks, mp.defense_count as defenses,
             mp.eliminated_round as er, mp.guild_name as guild
      from melee_participants mp
      left join characters c on c.user_id = mp.user_id and c.server_id = ${r.server_id}
      where mp.battle_id = ${BigInt(r.id)} and mp.final_rank <= 10 order by mp.final_rank
    `)) as unknown as { rank: number; nick: string; cp: string; attacks: number; defenses: number; er: number | null; guild: string | null }[];
    const top10 = top.map((t) => ({
      rank: Number(t.rank), nick: t.nick, cp: Number(t.cp), attacks: Number(t.attacks ?? 0), defenses: Number(t.defenses ?? 0),
      eliminatedRound: t.er == null ? null : Number(t.er), guildName: t.guild ?? null,
    }));
    items.push({
      serverId: Number(r.server_id), battleDate: r.battle_date, status: r.status,
      participantCount: Number(r.participant_count), podium: top10.slice(0, 3).map((p) => p.nick), top10, headlines: r.headlines,
    });
  }
  return items;
}
