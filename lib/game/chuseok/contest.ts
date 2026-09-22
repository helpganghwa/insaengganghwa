import 'server-only';

import { and, eq, inArray, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { userProfiles } from '@/lib/db/schema/avatar';
import { characters } from '@/lib/db/schema/server';
import { parseFaceBox, type FaceBox } from '@/components/faceCrop';
import { getGuildBriefsByUsers } from '@/lib/game/guild/badge';
import { resolveRepTitlesBatch } from '@/lib/game/titles/display';
import { CATALOG_V6 } from '@/lib/game/equipment/catalog-v6';

import {
  CHUSEOK_ACCRUE_END_MS,
  CHUSEOK_CONTEST_ITEMS,
  CHUSEOK_RANK_LIMIT,
  chuseokPhase,
  contestTitlesFor,
  nextRewardTierEnd,
  rankRewardFor,
  type ChuseokPhase,
} from './config';
import { rankRows, type RankInput, type RankedRow } from './rank';

/**
 * 추석 강화 대회 — 아이템별 순위(현황판·최종 결과)와 정산(우편·칭호). 규칙은 rank.ts·config.ts.
 *
 * 마감 시점의 단계는 별도 스냅샷 없이 enhancement_logs로 되짚는다 — 장비의 "기준 시각 이전 마지막 강화
 * 기록"의 to_level이 그 시각의 단계이고, 그 기록 시각이 도달 시각이다(기록이 없으면 +0·획득 시각).
 * 대회 중(accrue)은 기준 시각 = 지금(= 현재 enhance_level과 같다). 마감 뒤는 기준 시각 = 마감.
 */
const NAME_BY_CODE = new Map(CATALOG_V6.map((c) => [c.key, c.nameKo]));

export type BoardRow = {
  rank: number;
  userId: string;
  nickname: string;
  level: number;
  reachedAt: string | null;
  me: boolean;
  /** 행 배경 아바타(활성 프로필 정면 프레임)와 얼굴 박스 — 대난투 순위 행과 같은 표시(2026-09-23). 없으면 null. */
  avatar: string | null;
  faceBox: FaceBox | null;
  guildName: string | null;
  guildEmblemUrl: string | null;
  /** 표시용 대표 칭호(배치 재검증 뒤) — 없으면 null. 집행관 칭호는 구역명·지역을 함께. */
  titleCode: string | null;
  executorZone: string | null;
  executorZoneRegion: string | null;
};
export type BoardItem = {
  code: string;
  name: string;
  set: 'moon' | 'flower';
  rows: BoardRow[];
  /** 내 자리(순위 밖이어도) — 없으면 미참가. */
  mine: { rank: number; level: number; reachedAt: string | null; nextTierEnd: number | null; reward: { diamond: number; boxes: number } | null } | null;
  participants: number;
};
export type ContestBoard = {
  phase: ChuseokPhase;
  /** 정산이 끝나 결과 표를 읽었는가(마감 뒤 미정산이면 마감 시각 기준 계산값). */
  settled: boolean;
  items: BoardItem[];
};

type RawRow = { code: string; user_id: string; nickname: string; level: number; reached_at: string | null };

/** 기준 시각의 아이템별 참가 행 — 정지·탈퇴 계정 제외. */
async function loadRows(serverId: number, cutoffMs: number): Promise<Map<string, RankInput[]>> {
  const codes = CHUSEOK_CONTEST_ITEMS.map((i) => i.code);
  const cutoff = new Date(cutoffMs).toISOString();
  const rows = (await db.execute(sql`
    select ci.code, ue.user_id::text as user_id, c.nickname,
           coalesce(l.to_level, 0)::int as level,
           coalesce(l.created_at, ue.first_acquired_at) as reached_at
      from user_equipment ue
      join catalog_items ci on ci.id = ue.catalog_item_id
       and ci.code = any(array[${sql.join(codes.map((c) => sql`${c}`), sql`, `)}]::text[])
      join characters c on c.user_id = ue.user_id and c.server_id = ue.server_id
      join profiles p on p.id = ue.user_id
       and p.withdrawn_at is null
       and (p.banned_at is null or (p.ban_until is not null and p.ban_until <= now()))
      left join lateral (
        select el.to_level, el.created_at from enhancement_logs el
         where el.user_equipment_id = ue.id and el.created_at <= ${cutoff}::timestamptz
         order by el.created_at desc limit 1
      ) l on true
     where ue.server_id = ${serverId} and ue.first_acquired_at <= ${cutoff}::timestamptz
  `)) as unknown as RawRow[];
  const by = new Map<string, RankInput[]>();
  for (const r of rows) {
    const list = by.get(r.code) ?? [];
    list.push({ userId: r.user_id, nickname: r.nickname, level: Number(r.level), reachedAt: r.reached_at ? Date.parse(r.reached_at) : null });
    by.set(r.code, list);
  }
  return by;
}

const iso = (ms: number | null) => (ms == null ? null : new Date(ms).toISOString());

function toItem(code: string, set: 'moon' | 'flower', ranked: RankedRow[], userId: string | null): BoardItem {
  const mineRow = userId ? ranked.find((r) => r.userId === userId) ?? null : null;
  return {
    code,
    name: NAME_BY_CODE.get(code) ?? code,
    set,
    rows: ranked.slice(0, CHUSEOK_RANK_LIMIT).map((r) => ({ rank: r.rank, userId: r.userId, nickname: r.nickname, level: r.level, reachedAt: iso(r.reachedAt), me: r.userId === userId, avatar: null, faceBox: null, guildName: null, guildEmblemUrl: null, titleCode: null, executorZone: null, executorZoneRegion: null })),
    mine: mineRow
      ? { rank: mineRow.rank, level: mineRow.level, reachedAt: iso(mineRow.reachedAt), nextTierEnd: nextRewardTierEnd(mineRow.rank), reward: rankRewardFor(mineRow.rank) }
      : null,
    participants: ranked.length,
  };
}

/** 현황판 — 대회 중은 지금 기준, 마감 뒤는 정산 결과(있으면) 또는 마감 시각 기준 계산. */
export async function getContestBoard(serverId: number, userId: string | null, at = Date.now()): Promise<ContestBoard> {
  const phase = chuseokPhase(at);
  if (phase !== 'accrue') {
    const settled = await loadSettled(serverId, userId);
    if (settled) return { phase, settled: true, items: await attachDecor(serverId, settled) };
  }
  const cutoff = phase === 'accrue' || phase === 'before' ? at : CHUSEOK_ACCRUE_END_MS;
  const by = await loadRows(serverId, cutoff);
  const items = CHUSEOK_CONTEST_ITEMS.map((i) => toItem(i.code, i.set, rankRows(by.get(i.code) ?? []), userId));
  return { phase, settled: false, items: await attachDecor(serverId, items) };
}

/**
 * 순위 행 꾸밈 — 배경 아바타(활성 프로필 정면·얼굴 박스)·길드 마크·대표 칭호. 대난투 순위 행과 같은 재료를
 * 같은 출처(characters ⨝ user_profiles, 길드 brief, 대표 칭호 배치 재검증)에서 가져온다. 조회 실패는 꾸밈 없이 진행.
 */
async function attachDecor(serverId: number, items: BoardItem[]): Promise<BoardItem[]> {
  const ids = [...new Set(items.flatMap((i) => i.rows.map((r) => r.userId)))];
  if (ids.length === 0) return items;
  type Decor = Omit<BoardRow, 'rank' | 'userId' | 'nickname' | 'level' | 'reachedAt' | 'me'>;
  const map = new Map<string, Decor>();
  try {
    const [rows, guilds] = await Promise.all([
      db
        .select({ userId: characters.userId, repTitleCode: characters.representativeTitleCode, rotations: userProfiles.rotations, options: userProfiles.options })
        .from(characters)
        .leftJoin(userProfiles, eq(userProfiles.id, characters.activeProfileId))
        .where(and(eq(characters.serverId, serverId), inArray(characters.userId, ids))),
      getGuildBriefsByUsers(ids, serverId).catch(() => new Map()),
    ]);
    const rep = await resolveRepTitlesBatch(
      rows.map((r) => ({ userId: r.userId, repCode: r.repTitleCode ?? null, executorZone: guilds.get(r.userId)?.executorZone ?? null })),
      serverId,
    ).catch(() => new Map<string, string | null>());
    for (const r of rows) {
      const rot = r.rotations as Record<string, string> | null;
      const g = guilds.get(r.userId);
      map.set(r.userId, {
        avatar: rot ? (rot.south ?? Object.values(rot)[0] ?? null) : null,
        faceBox: parseFaceBox((r.options as Record<string, unknown> | null)?.faceBox),
        guildName: g?.name ?? null,
        guildEmblemUrl: g?.emblemUrl ?? null,
        titleCode: rep.get(r.userId) ?? null,
        executorZone: g?.executorZone ?? null,
        executorZoneRegion: g?.executorZoneRegion ?? null,
      });
    }
  } catch (e) {
    console.error('[chuseok.board] row decor failed', e);
  }
  return items.map((i) => ({ ...i, rows: i.rows.map((r) => ({ ...r, ...(map.get(r.userId) ?? {}) })) }));
}

async function loadSettled(serverId: number, userId: string | null): Promise<BoardItem[] | null> {
  const rows = (await db.execute(sql`
    select r.catalog_code as code, r.rank, r.user_id::text as user_id, r.level, r.reached_at, c.nickname
      from chuseok_contest_results r
      left join characters c on c.user_id = r.user_id and c.server_id = r.server_id
     where r.server_id = ${serverId}
     order by r.catalog_code, r.rank
  `)) as unknown as { code: string; rank: number; user_id: string; level: number; reached_at: string | null; nickname: string | null }[];
  if (rows.length === 0) return null;
  return CHUSEOK_CONTEST_ITEMS.map((i) => {
    const mine = rows.find((r) => r.code === i.code && r.user_id === userId);
    return {
      code: i.code,
      name: NAME_BY_CODE.get(i.code) ?? i.code,
      set: i.set,
      rows: rows
        .filter((r) => r.code === i.code)
        .map((r) => ({ rank: Number(r.rank), userId: r.user_id, nickname: r.nickname ?? '(탈퇴)', level: Number(r.level), reachedAt: r.reached_at, me: r.user_id === userId, avatar: null, faceBox: null, guildName: null, guildEmblemUrl: null, titleCode: null, executorZone: null, executorZoneRegion: null })),
      mine: mine
        ? { rank: Number(mine.rank), level: Number(mine.level), reachedAt: mine.reached_at, nextTierEnd: null, reward: rankRewardFor(Number(mine.rank)) }
        : null,
      participants: rows.filter((r) => r.code === i.code).length,
    };
  });
}

export type SettleResult =
  | { ok: true; already: boolean; rows: number; mails: number; titles: number }
  | { ok: false; reason: 'NOT_ENDED' };

/**
 * 정산(어드민, 10/1) — 마감 시각 기준 최종 순위를 한 트랜잭션으로 확정: 결과 표 insert(순위 PK) →
 * 순위별 우편(💎·📦 3슬롯 균등) → 칭호(도달 등수 이하 전부, user_titles PK 멱등). 이미 정산된 서버는 already.
 * 정지·탈퇴 계정은 loadRows가 걸러 아래 순위가 승계된다(사용자 확정).
 */
export async function settleContest(serverId: number, adminId: string, at = Date.now()): Promise<SettleResult> {
  if (chuseokPhase(at) === 'accrue' || chuseokPhase(at) === 'before') return { ok: false, reason: 'NOT_ENDED' };
  const by = await loadRows(serverId, CHUSEOK_ACCRUE_END_MS);
  return db.transaction(async (tx) => {
    const [ex] = (await tx.execute(sql`
      select count(*)::int as n from chuseok_contest_results where server_id = ${serverId}
    `)) as unknown as { n: number }[];
    if (Number(ex?.n ?? 0) > 0) return { ok: true as const, already: true, rows: Number(ex!.n), mails: 0, titles: 0 };
    let rowsN = 0, mailsN = 0, titlesN = 0;
    for (const item of CHUSEOK_CONTEST_ITEMS) {
      const ranked = rankRows(by.get(item.code) ?? []).slice(0, CHUSEOK_RANK_LIMIT);
      const name = NAME_BY_CODE.get(item.code) ?? item.code;
      for (const r of ranked) {
        const reward = rankRewardFor(r.rank);
        if (!reward) continue;
        const titles = contestTitlesFor(item.set, r.rank);
        await tx.execute(sql`
          insert into chuseok_contest_results (server_id, catalog_code, rank, user_id, level, reached_at, diamond, boxes, titles, settled_by)
          values (${serverId}, ${item.code}, ${r.rank}, ${r.userId}::uuid, ${r.level}, ${r.reachedAt == null ? null : new Date(r.reachedAt).toISOString()}::timestamptz,
                  ${reward.diamond}, ${reward.boxes}, ${sql.raw(`array[${titles.map((t) => `'${t}'`).join(',') || ''}]::text[]`)}, ${adminId}::uuid)
        `);
        rowsN++;
        const per = reward.boxes / 3;
        const payload = JSON.stringify({ diamond: reward.diamond, boxes: { weapon: per, armor: per, accessory: per } });
        const title = `추석 강화 대회 ${r.rank}등 보상`;
        const body = `${name} 강화 대회에서 ${r.rank}등을 하셨습니다. 마감 시각 기준 +${r.level.toLocaleString('ko-KR')} 단계였습니다.\n보상으로 💎${reward.diamond.toLocaleString('ko-KR')}과 📦${reward.boxes}개를 드립니다.${titles.length ? ' 칭호는 칭호 화면에서 확인해 주세요.' : ''}`;
        await tx.execute(sql`
          insert into mailbox (user_id, server_id, type, title, body, sender_label, payload)
          values (${r.userId}::uuid, ${serverId}, 'admin'::mailbox_type, ${title}, ${body}, '추석 강화 대회', ${payload}::jsonb)
        `);
        mailsN++;
        if (titles.length) {
          const ins = (await tx.execute(sql`
            insert into user_titles (user_id, server_id, title_code)
            select ${r.userId}::uuid, ${serverId}, unnest(array[${sql.join(titles.map((t) => sql`${t}`), sql`, `)}]::text[])
            on conflict (user_id, server_id, title_code) do nothing
            returning title_code
          `)) as unknown as { title_code: string }[];
          titlesN += ins.length;
        }
      }
    }
    await tx.execute(sql`
      insert into admin_actions (admin_user_id, action, target_type, target_id, payload)
      values (${adminId}::uuid, 'chuseok.settle', 'server', ${String(serverId)}, ${JSON.stringify({ rows: rowsN, mails: mailsN, titles: titlesN })}::jsonb)
    `);
    return { ok: true as const, already: false, rows: rowsN, mails: mailsN, titles: titlesN };
  });
}

/** 정산 여부(어드민 화면). */
export async function contestSettledAt(serverId: number): Promise<string | null> {
  const [r] = (await db.execute(sql`
    select min(settled_at) as at from chuseok_contest_results where server_id = ${serverId}
  `)) as unknown as { at: string | null }[];
  return r?.at ?? null;
}
