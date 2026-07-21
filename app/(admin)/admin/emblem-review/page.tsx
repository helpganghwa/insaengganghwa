import { and, desc, eq, gte, lt, type SQL } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { guilds, guildEmblems, guildEmblemEscrows } from '@/lib/db/schema/guild';
import { characters } from '@/lib/db/schema/server';
import { listServers } from '@/lib/game/servers';
import { EMBLEM_SHAPES, EMBLEM_TONES, EMBLEM_KEYWORDS, type EmblemSelection } from '@/lib/game/guild/emblem-vocab';

import { ServerBadge } from '../ServerBadge';
import { ServerFilter, parseServerFilter } from '../ServerFilter';
import { EmblemDecisionButtons, RefundEscrowButton } from './AdminEmblemActions';

export const dynamic = 'force-dynamic';

const ESCROW_KO: Record<string, string> = {
  pending: '예치중',
  completed: '완료',
  refunded: '환불됨',
};

/** 선택 요소 한글 요약 — '기사 방패 · 핏빛 적/순백 · 용(+검)' 형태. */
function selectionKo(sel: unknown): string | null {
  const s = sel as EmblemSelection | null;
  if (!s || typeof s !== 'object' || !('shapeId' in s)) return null;
  const shape = EMBLEM_SHAPES.find((x) => x.id === s.shapeId)?.ko ?? s.shapeId;
  const main = EMBLEM_TONES.find((x) => x.id === s.mainToneId)?.ko ?? s.mainToneId;
  const sub = EMBLEM_TONES.find((x) => x.id === s.subToneId)?.ko ?? s.subToneId;
  const kw = EMBLEM_KEYWORDS.find((x) => x.id === s.mainKeywordId)?.ko ?? s.mainKeywordId;
  const sub2 = s.subKeywordId ? (EMBLEM_KEYWORDS.find((x) => x.id === s.subKeywordId)?.ko ?? s.subKeywordId) : null;
  return `${shape} · ${main}/${sub} · ${kw}${sub2 ? `(+${sub2})` : ''}`;
}

/**
 * 길드 문양 생성 검수(0131·0132) — 아바타 검수(profile-gen)와 동일 결정 모델.
 *  상단: 그날 생성 문양(이미지·선택 요소·프롬프트) + [검토 통과] / [리젝+환불]
 *  하단: 유료 재생성 예치 내역 + [환불] (문양 유지 단독 환불)
 */
export default async function AdminEmblemReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; srv?: string }>;
}) {
  const sp = await searchParams;
  const srvFilter = parseServerFilter(sp.srv);
  const servers = await listServers();
  const srvQs = srvFilter != null ? `&srv=${srvFilter}` : '';

  const kstToday = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const day = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? '') ? sp.date! : kstToday;
  const dayMs = new Date(`${day}T00:00:00+09:00`).getTime();
  const start = new Date(dayMs);
  const end = new Date(dayMs + 24 * 3600 * 1000);
  const fmtKst = (ms: number) => new Date(ms + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const prevDay = fmtKst(dayMs - 24 * 3600 * 1000);
  const nextDay = fmtKst(dayMs + 24 * 3600 * 1000);

  const embWhere: SQL[] = [gte(guildEmblems.createdAt, start), lt(guildEmblems.createdAt, end)];
  if (srvFilter != null) embWhere.push(eq(guilds.serverId, srvFilter));
  const emblems = await db
    .select({
      id: guildEmblems.id,
      url: guildEmblems.emblemUrl,
      color: guildEmblems.emblemColor,
      selection: guildEmblems.selection,
      genPrompt: guildEmblems.genPrompt,
      adminDecision: guildEmblems.adminDecision,
      removedAt: guildEmblems.removedAt,
      createdAt: guildEmblems.createdAt,
      guildName: guilds.name,
      serverId: guilds.serverId,
      activeEmblemId: guilds.activeEmblemId,
    })
    .from(guildEmblems)
    .innerJoin(guilds, eq(guilds.id, guildEmblems.guildId))
    .where(and(...embWhere))
    .orderBy(desc(guildEmblems.createdAt))
    .limit(200);

  const escWhere: SQL[] = [gte(guildEmblemEscrows.createdAt, start), lt(guildEmblemEscrows.createdAt, end)];
  if (srvFilter != null) escWhere.push(eq(guildEmblemEscrows.serverId, srvFilter));
  const escrows = await db
    .select({
      id: guildEmblemEscrows.id,
      serverId: guildEmblemEscrows.serverId,
      guildName: guilds.name,
      nickname: characters.nickname,
      amount: guildEmblemEscrows.amount,
      status: guildEmblemEscrows.status,
      createdAt: guildEmblemEscrows.createdAt,
    })
    .from(guildEmblemEscrows)
    .leftJoin(guilds, eq(guilds.id, guildEmblemEscrows.guildId))
    .leftJoin(
      characters,
      and(
        eq(characters.userId, guildEmblemEscrows.userId),
        eq(characters.serverId, guildEmblemEscrows.serverId),
      ),
    )
    .where(and(...escWhere))
    .orderBy(desc(guildEmblemEscrows.createdAt))
    .limit(200);

  const hhmm = (d: Date) =>
    new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);

  return (
    <div className="mx-auto w-full max-w-[760px] space-y-5 px-4 py-6 text-zinc-100">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-bold">🛡️ 길드 문양 검수</h1>
        <div className="flex items-center gap-2 text-sm">
          <a href={`?date=${prevDay}${srvQs}`} className="rounded-md bg-zinc-800 px-2 py-1">
            ← {prevDay.slice(5)}
          </a>
          <span className="font-mono">{day}</span>
          {day < kstToday ? (
            <a href={`?date=${nextDay}${srvQs}`} className="rounded-md bg-zinc-800 px-2 py-1">
              {nextDay.slice(5)} →
            </a>
          ) : null}
        </div>
      </div>
      <ServerFilter servers={servers} current={srvFilter} basePath="/admin/emblem-review" params={{ date: day }} />

      <section>
        <h2 className="mb-2 text-sm font-bold text-zinc-300">생성 문양 ({emblems.length})</h2>
        {emblems.length === 0 ? (
          <p className="rounded-lg border border-zinc-800 p-4 text-sm text-zinc-500">이 날짜에 생성된 문양이 없습니다.</p>
        ) : (
          <ul className="space-y-2">
            {emblems.map((e) => {
              const sel = selectionKo(e.selection);
              return (
                <li key={String(e.id)} className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-2.5">
                  <div className="flex items-start gap-3">
                    <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-zinc-950">
                      {e.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={e.url}
                          alt=""
                          className={`h-full w-full object-contain ${e.removedAt ? 'opacity-40 grayscale' : ''}`}
                          style={{ imageRendering: 'pixelated' }}
                        />
                      ) : (
                        <span className="text-[10px] text-zinc-600">생성중</span>
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-[13px] font-bold">{e.guildName}</span>
                        <ServerBadge serverId={e.serverId} />
                        {e.activeEmblemId != null && e.activeEmblemId === e.id ? (
                          <span className="shrink-0 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold text-emerald-400">활성</span>
                        ) : null}
                        {e.adminDecision === 'reject' ? (
                          <span className="shrink-0 rounded bg-red-500/15 px-1.5 py-0.5 text-[9px] font-bold text-red-400">리젝</span>
                        ) : e.adminDecision === 'confirm' ? (
                          <span className="shrink-0 rounded bg-zinc-700 px-1.5 py-0.5 text-[9px] font-bold text-zinc-300">통과</span>
                        ) : (
                          <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold text-amber-400">미검수</span>
                        )}
                      </div>
                      <p className="mt-0.5 text-[10px] text-zinc-500">
                        {hhmm(e.createdAt)} · #{String(e.id)}
                        {sel ? <> · <span className="text-zinc-400">{sel}</span></> : ' · 선택 기록 없음(0132 이전 생성)'}
                      </p>
                      {e.genPrompt ? (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-[10px] text-zinc-500">프롬프트 보기</summary>
                          <p className="mt-1 rounded bg-zinc-950 p-2 text-[10px] leading-relaxed text-zinc-400">{e.genPrompt}</p>
                        </details>
                      ) : null}
                    </div>
                    {e.adminDecision == null ? <EmblemDecisionButtons emblemId={String(e.id)} /> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-bold text-zinc-300">유료 재생성 예치 (3,000💎 · {escrows.length})</h2>
        {escrows.length === 0 ? (
          <p className="rounded-lg border border-zinc-800 p-4 text-sm text-zinc-500">이 날짜의 유료 생성 내역이 없습니다.</p>
        ) : (
          <ul className="space-y-1.5">
            {escrows.map((s) => (
              <li key={String(s.id)} className="flex items-center gap-2.5 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-[12px]">
                <span className="w-10 shrink-0 font-mono text-[10px] text-zinc-500">{hhmm(s.createdAt)}</span>
                <span className="min-w-0 flex-1 truncate">
                  <b>{s.guildName ?? '(해산됨)'}</b>
                  <span className="text-zinc-500"> · {s.nickname ?? '유저'}</span>
                </span>
                <ServerBadge serverId={s.serverId} />
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold ${
                    s.status === 'completed'
                      ? 'bg-emerald-500/15 text-emerald-400'
                      : s.status === 'refunded'
                        ? 'bg-zinc-700 text-zinc-300'
                        : 'bg-amber-500/15 text-amber-400'
                  }`}
                >
                  {ESCROW_KO[s.status] ?? s.status}
                </span>
                {s.status === 'completed' ? (
                  <RefundEscrowButton escrowId={String(s.id)} amount={Number(s.amount).toLocaleString('ko-KR')} />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-[11px] leading-relaxed text-zinc-600">
        검토 통과: 무조치 확인 기록. 리젝+환불: 문양을 유저 목록에서 제거(활성이면 즉시 무문양 전환)하고, 연결된
        유료 생성이 있으면 자동 환불 + 길드장·결제자 우편 발송. 아래 환불 버튼은 문양은 유지한 채 예치만 환불합니다.
      </p>
    </div>
  );
}
