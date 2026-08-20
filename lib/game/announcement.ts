import 'server-only';

import { unstable_cache } from 'next/cache';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { announcements, announcementPollVotes } from '@/lib/db/schema/announcement';

import type { AnnouncementView } from './announcement-shared';

// 상수·타입은 클라 공용 모듈에서(서버 소비자도 여기로 재노출). 클라 컴포넌트는 announcement-shared 직접 import.
export * from './announcement-shared';

function toView(r: typeof announcements.$inferSelect): AnnouncementView {
  return {
    id: r.id.toString(),
    category: r.category,
    title: r.title,
    body: r.body,
    pinned: r.pinned,
    serverId: r.serverId ?? null,
    publishedAtIso: r.publishedAt ? r.publishedAt.toISOString() : null,
    scheduledAtIso: r.scheduledAt ? r.scheduledAt.toISOString() : null,
    poll: r.poll ?? null,
  };
}

/**
 * 게시판/홈 — 발행된 공지 최신순(고정 상단 정렬은 클라에서).
 * §11.5 — 홈 로드마다 조회되는 준불변 데이터라 30초 캐시(공지 발행 지연 ≤30s 허용).
 */
export const listPublishedAnnouncements = unstable_cache(
  // serverId(2026-08-07 서버별 공지) — 전서버(null) 공지 + 해당 서버 공지만.
  // unstable_cache는 인자를 캐시 키에 포함하므로 서버별로 격리 캐시된다.
  async (limit = 30, serverId?: number): Promise<AnnouncementView[]> => {
    const serverCond =
      serverId != null
        ? sql`(${announcements.serverId} is null or ${announcements.serverId} = ${serverId})`
        : sql`true`;
    const rows = await db
      .select()
      .from(announcements)
      .where(and(eq(announcements.published, true), serverCond))
      .orderBy(desc(announcements.publishedAt), desc(announcements.id))
      .limit(limit);
    return rows.map(toView);
  },
  ['published-announcements-v2'],
  { revalidate: 30, tags: ['announcements'] },
);

/**
 * 홈 전용 요약 — 목록은 제목만 쓰고 본문은 상세 열람 시 lazy 조회(감사 C 오버패칭:
 * 본문 30건 ~45KB가 매 홈 렌더에 실렸다). 진입 시 강제 팝업이 즉시 렌더하는 **최신 1건만**
 * body 포함, 나머지는 '' — 상세는 /api/announcement/body가 30s 캐시로 제공.
 * poll은 별도 컬럼이라 요약에도 온전히 실린다(홈 pollAnnIds·투표 하이라이트 무영향).
 */
export const listPublishedAnnouncementSummaries = unstable_cache(
  async (limit = 30, serverId?: number): Promise<AnnouncementView[]> => {
    const serverCond =
      serverId != null
        ? sql`(${announcements.serverId} is null or ${announcements.serverId} = ${serverId})`
        : sql`true`;
    const rows = await db
      .select()
      .from(announcements)
      .where(and(eq(announcements.published, true), serverCond))
      .orderBy(desc(announcements.publishedAt), desc(announcements.id))
      .limit(limit);
    return rows.map((r, i) => ({ ...toView(r), body: i === 0 ? r.body : '' }));
  },
  ['published-announcement-summaries-v1'],
  { revalidate: 30, tags: ['announcements'] },
);

/** 상세 본문 lazy 조회 — 발행된 공지만. 요약(listPublishedAnnouncementSummaries)과 짝.
 * ⚠ id는 string으로 받는다 — unstable_cache가 인자를 JSON.stringify로 키화하는데
 * BigInt는 직렬화 불가로 **항상 throw**한다(배포 전 검수에서 검출). 캐스팅은 내부에서. */
export const getPublishedAnnouncementBody = unstable_cache(
  async (id: string): Promise<string | null> => {
    if (!/^\d{1,18}$/.test(id)) return null;
    const [r] = await db
      .select({ body: announcements.body, published: announcements.published })
      .from(announcements)
      .where(eq(announcements.id, BigInt(id)))
      .limit(1);
    return r?.published ? r.body : null;
  },
  ['announcement-body-v1'],
  { revalidate: 30, tags: ['announcements'] },
);

/** 어드민 — 전체(초안 포함) 최신순. */
export async function listAllAnnouncements(limit = 100): Promise<AnnouncementView[]> {
  const rows = await db.select().from(announcements).orderBy(desc(announcements.id)).limit(limit);
  return rows.map(toView);
}

// ───────── 공지 투표 ─────────

/**
 * 유저의 현재 투표 조회(게임 UI 하이라이트용) — {`공지id:질문no`: optionId}(0137 다중 설문).
 * 단일 설문 공지는 질문 1 고정이라 키가 `id:1`. 집계는 미포함(유저 비노출).
 */
export async function getUserPollVotes(
  userId: string,
  announcementIds: bigint[],
): Promise<Record<string, string>> {
  if (announcementIds.length === 0) return {};
  const rows = await db
    .select({
      annId: announcementPollVotes.announcementId,
      optionId: announcementPollVotes.optionId,
      q: announcementPollVotes.questionNo,
    })
    .from(announcementPollVotes)
    .where(
      and(
        eq(announcementPollVotes.userId, userId),
        inArray(announcementPollVotes.announcementId, announcementIds),
      ),
    );
  const m: Record<string, string> = {};
  for (const r of rows) m[`${r.annId.toString()}:${r.q}`] = r.optionId;
  return m;
}

/** 투표(질문 그룹당 1인 1표, 변경 가능) — 서버 액션에서 호출. 결과는 반환하지 않는다(유저 비노출). */
export async function castPollVote(
  userId: string,
  announcementId: bigint,
  optionId: string,
): Promise<{ ok: true } | { ok: false; reason: 'NOT_FOUND' | 'BAD_OPTION' | 'CLOSED' }> {
  const [a] = await db
    .select({ poll: announcements.poll, published: announcements.published })
    .from(announcements)
    .where(eq(announcements.id, announcementId))
    .limit(1);
  if (!a || !a.published || !a.poll) return { ok: false, reason: 'NOT_FOUND' };
  const opt = a.poll.options.find((o) => o.id === optionId);
  if (!opt) return { ok: false, reason: 'BAD_OPTION' };
  if (a.poll.closesAtIso && new Date(a.poll.closesAtIso).getTime() < Date.now())
    return { ok: false, reason: 'CLOSED' };
  // 질문 그룹은 서버가 poll 정의에서 파생(클라 전달 안 받음 — 위조 무의미화).
  const questionNo = opt.q ?? 1;
  await db
    .insert(announcementPollVotes)
    .values({ announcementId, userId, optionId, questionNo })
    .onConflictDoUpdate({
      target: [
        announcementPollVotes.announcementId,
        announcementPollVotes.userId,
        announcementPollVotes.questionNo,
      ],
      set: { optionId, updatedAt: new Date() },
    });
  return { ok: true };
}

export type PollResults = {
  counts: Record<string, number>;
  total: number;
  /** 투표자 목록(비익명 — **관리자 전용**). nickname은 유저의 아무 캐릭터 1개. */
  voters: { nickname: string; optionId: string; atIso: string }[];
};

/** 어드민 — 투표 집계 + 투표자 목록(비익명). 결과·투표자는 관리자만 열람. */
export async function getPollResults(announcementId: bigint): Promise<PollResults> {
  const rows = (await db.execute(sql`
    select v.option_id, v.updated_at,
           coalesce((select c.nickname from characters c where c.user_id = v.user_id limit 1), '(이름없음)') as nickname
    from announcement_poll_votes v
    where v.announcement_id = ${announcementId}
    order by v.updated_at desc
  `)) as unknown as { option_id: string; updated_at: string; nickname: string }[];
  const counts: Record<string, number> = {};
  const voters = rows.map((r) => {
    counts[r.option_id] = (counts[r.option_id] ?? 0) + 1;
    return { nickname: r.nickname, optionId: r.option_id, atIso: new Date(r.updated_at).toISOString() };
  });
  return { counts, total: rows.length, voters };
}
