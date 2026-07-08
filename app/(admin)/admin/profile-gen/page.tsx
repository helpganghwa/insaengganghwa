import { and, desc, eq, gte, ilike, lt, or, type SQL } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { profileGenerationJobs, userProfiles } from '@/lib/db/schema/avatar';
import { characters } from '@/lib/db/schema/server';
import { profiles } from '@/lib/db/schema/profiles';
import { CATALOG_ITEMS } from '@/lib/game/equipment/catalog';
import { spritePath } from '@/lib/game/equipment/sprite-manifest';
import { pixellabKeyByIdx, keyIdxFromOptions } from '@/lib/game/profile/pixellab-keys';
import { assetUrl } from '@/lib/asset-versions';
import { listServers } from '@/lib/game/servers';

import { AdminSearch } from '../AdminSearch';
import { AdminProfileGenActions } from './AdminProfileGenActions';
import { AdminAvatarViewer } from './AdminAvatarViewer';
import { ServerBadge } from '../ServerBadge';
import { ServerFilter, parseServerFilter } from '../ServerFilter';

// 어드민 데이터 + Pixellab 이미지 fetch — 항상 최신.
export const dynamic = 'force-dynamic';

const NAME_BY_CODE = new Map(CATALOG_ITEMS.map((c) => [c.key, c.nameKo]));
const REASON_KO: Record<string, string> = {
  nsfw: '선정성',
  violence: '폭력성',
  hate: '혐오 표현',
  quality: '형태·품질 오류',
};
const STATUS_KO: Record<string, string> = {
  queued: '대기',
  downloading: '생성중',
  ai_reviewing: '검수중',
  accepted: '통과',
  rejected_ai: 'AI거절',
  failed: '실패',
};
const DECISION_KO: Record<string, string> = {
  confirm: '확인(무조치)',
  grant: '아바타 지급',
  reject: '회수+환불',
};
async function pixellabRotations(charId: string, keyIdx: number): Promise<Record<string, string>> {
  // ⚠️ 캐릭터는 생성에 쓴 키로만 조회 가능 → 잡 options의 keyIdx로 키 선택(레거시=key1).
  if (!process.env.PIXELLAB_API_KEY) return {};
  const key = pixellabKeyByIdx(keyIdx);
  try {
    const r = await fetch(`https://api.pixellab.ai/v2/characters/${charId}`, {
      headers: { authorization: `Bearer ${key}` },
      cache: 'no-store',
    });
    if (!r.ok) return {};
    const j = (await r.json()) as { rotation_urls?: Record<string, string | null> };
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(j.rotation_urls ?? {})) if (v) out[k.replace(/-/g, '_')] = v;
    return out;
  } catch {
    return {};
  }
}

export default async function AdminProfileGenPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; date?: string; q?: string; srv?: string }>;
}) {
  // 진입 가드는 (admin)/layout.tsx 일원화.
  const { status, date } = await searchParams;
  const sp = await searchParams;
  const q = sp.q?.trim() ?? '';
  const searching = q.length > 0;
  const srvFilter = parseServerFilter(sp.srv);
  const servers = await listServers();
  const srvQs = srvFilter != null ? `&srv=${srvFilter}` : ''; // 날짜·상태 네비가 서버 필터 보존
  // 날짜 필터(KST 하루). 기본 = 오늘(KST). createdAt(UTC timestamptz)을 KST 일자 범위로 조회.
  const kstToday = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const day = /^\d{4}-\d{2}-\d{2}$/.test(date ?? '') ? date! : kstToday;
  const dayMs = new Date(`${day}T00:00:00+09:00`).getTime();
  const start = new Date(dayMs);
  const end = new Date(dayMs + 24 * 3600 * 1000);
  const fmtKst = (ms: number) => new Date(ms + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const prevDay = fmtKst(dayMs - 24 * 3600 * 1000);
  const nextDay = fmtKst(dayMs + 24 * 3600 * 1000);
  const qs = (d: string, s?: string) => `?date=${d}${s ? `&status=${s}` : ''}${srvQs}`;

  // 검색 모드: 날짜 무시, 유저코드(정확)·닉네임(부분)·거래(job)ID(숫자면 정확)로 전체 조회.
  const searchConds: SQL[] = [ilike(profiles.publicCode, q), ilike(characters.nickname, `%${q}%`)];
  if (/^\d+$/.test(q)) searchConds.push(eq(profileGenerationJobs.id, BigInt(q)));
  const baseWhere = searching
    ? or(...searchConds)
    : and(gte(profileGenerationJobs.createdAt, start), lt(profileGenerationJobs.createdAt, end));
  // 서버 필터 시 AND로 좁힘(검색·날짜 어느 모드든).
  const whereClause =
    srvFilter != null ? and(baseWhere, eq(profileGenerationJobs.serverId, srvFilter)) : baseWhere;

  const all = await db
    .select({
      id: profileGenerationJobs.id,
      userId: profileGenerationJobs.userId,
      serverId: profileGenerationJobs.serverId,
      status: profileGenerationJobs.status,
      options: profileGenerationJobs.options,
      equipmentSnapshot: profileGenerationJobs.equipmentSnapshot,
      descriptionPrompt: profileGenerationJobs.descriptionPrompt,
      aiVerdict: profileGenerationJobs.aiVerdict,
      rejectReason: profileGenerationJobs.rejectReason,
      diamondEscrow: profileGenerationJobs.diamondEscrow,
      pixellabCharacterId: profileGenerationJobs.pixellabCharacterId,
      userProfileId: profileGenerationJobs.userProfileId,
      adminDecision: profileGenerationJobs.adminDecision,
      createdAt: profileGenerationJobs.createdAt,
      nickname: characters.nickname,
      code: profiles.publicCode,
      rotations: userProfiles.rotations,
    })
    .from(profileGenerationJobs)
    .leftJoin(
      characters,
      and(
        eq(characters.userId, profileGenerationJobs.userId),
        eq(characters.serverId, profileGenerationJobs.serverId),
      ),
    )
    .leftJoin(profiles, eq(profiles.id, profileGenerationJobs.userId))
    .leftJoin(userProfiles, eq(userProfiles.id, profileGenerationJobs.userProfileId))
    .where(whereClause)
    .orderBy(desc(profileGenerationJobs.createdAt))
    .limit(300);

  // 4분류 필터: AI 통과 / AI 실패 / 운영자 검수 완료 / 운영자 검수 전.
  const TERMINAL = ['accepted', 'rejected_ai', 'failed'];
  type View = 'ai_pass' | 'ai_fail' | 'admin_done' | 'admin_todo';
  const MATCH: Record<View, (r: (typeof all)[number]) => boolean> = {
    ai_pass: (r) => r.status === 'accepted',
    ai_fail: (r) => r.status === 'rejected_ai' || r.status === 'failed',
    admin_done: (r) => !!r.adminDecision,
    admin_todo: (r) => TERMINAL.includes(r.status) && !r.adminDecision,
  };
  const view: View | null = status && status in MATCH ? (status as View) : null;
  const rows = view ? all.filter(MATCH[view]) : all;
  const vcount = (v: View) => all.filter(MATCH[v]).length;
  const pendingReview = vcount('admin_todo');
  const FILTERS: { k: View; ko: string; on: string }[] = [
    { k: 'ai_pass', ko: 'AI 통과', on: 'border-emerald-500 bg-emerald-900/30 text-emerald-300' },
    { k: 'ai_fail', ko: 'AI 실패', on: 'border-red-500 bg-red-900/30 text-red-300' },
    { k: 'admin_todo', ko: '운영자 검수 전', on: 'border-amber-500 bg-amber-900/30 text-amber-300' },
    { k: 'admin_done', ko: '운영자 검수 완료', on: 'border-emerald-500 bg-emerald-900/30 text-emerald-300' },
  ];

  // 8방향 이미지: 통과=저장 rotations, 그 외=Pixellab 캐릭터에서 조회.
  const imgs = await Promise.all(
    rows.map(async (r) => {
      if (r.rotations && Object.keys(r.rotations as object).length) return r.rotations as Record<string, string>;
      if (r.pixellabCharacterId) return pixellabRotations(r.pixellabCharacterId, keyIdxFromOptions(r.options));
      return {} as Record<string, string>;
    }),
  );

  return (
    <div className="mx-auto w-full max-w-[860px] space-y-3 px-4 py-6 text-zinc-100">
      <h1 className="text-lg font-bold">🎨 아바타 생성 내역 ({rows.length})</h1>
      {/* 검색 — 유저코드/닉네임/거래(job)ID. 검색 중엔 날짜·필터 숨김. */}
      <AdminSearch basePath="/admin/profile-gen" initialQuery={q} />
      <ServerFilter
        basePath="/admin/profile-gen"
        servers={servers}
        current={srvFilter}
        params={{ date: sp.date, status, q: sp.q }}
      />
      {searching ? (
        <p className="text-xs text-zinc-500">검색 “{q}” · {rows.length}건</p>
      ) : (
        <>
          {/* 날짜 네비 (KST 하루) */}
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <a href={qs(prevDay, status)} className="rounded-lg border border-zinc-700 px-3 py-1 text-zinc-300">◀ {prevDay}</a>
            <span className="font-bold text-amber-300">{day}</span>
            <span className="text-[11px] text-zinc-500">(KST · 그날 {all.length}건)</span>
            {pendingReview > 0 && (
              <span className="rounded-full bg-amber-900/40 px-2 py-0.5 text-[11px] font-bold text-amber-300">미검수 {pendingReview}</span>
            )}
            {nextDay <= kstToday ? (
              <a href={qs(nextDay, status)} className="rounded-lg border border-zinc-700 px-3 py-1 text-zinc-300">{nextDay} ▶</a>
            ) : (
              <span className="rounded-lg border border-zinc-800 px-3 py-1 text-zinc-600">{nextDay} ▶</span>
            )}
            {day !== kstToday && (
              <a href={qs(kstToday, status)} className="rounded-lg border border-amber-700 px-3 py-1 text-amber-300">오늘</a>
            )}
          </div>
          {/* 4분류 필터 (날짜 유지) */}
          <div className="flex flex-wrap gap-1.5 text-xs">
            <a href={qs(day)} className={`rounded-full border px-3 py-1 ${!view ? 'border-amber-500 bg-amber-900/30 text-amber-300' : 'border-zinc-700 text-zinc-400'}`}>전체 {all.length}</a>
            {FILTERS.map((f) => (
              <a key={f.k} href={qs(day, f.k)} className={`rounded-full border px-3 py-1 ${view === f.k ? f.on : 'border-zinc-700 text-zinc-400'}`}>
                {f.ko} {vcount(f.k)}
              </a>
            ))}
          </div>
        </>
      )}

      {rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-zinc-500">내역이 없습니다.</p>
      ) : (
        rows.map((r, i) => {
          const rot = imgs[i]!;
          const eqs = (r.equipmentSnapshot ?? {}) as { weaponKey?: string; armorKey?: string; accessoryKey?: string };
          const verdict = (r.aiVerdict ?? null) as { pass?: boolean; reasons?: string[]; notes?: string } | null;
          const gender = (r.options as { gender?: string } | null)?.gender ?? null;
          const eqName = (key?: string) => (key ? (NAME_BY_CODE.get(key) ?? key) : '-');
          const reviewed = !!r.adminDecision;
          const isTerminal = TERMINAL.includes(r.status);
          const [aiLabel, aiCls] =
            r.status === 'accepted'
              ? ['AI 통과', 'bg-emerald-900/40 text-emerald-300 border-emerald-700']
              : r.status === 'rejected_ai'
                ? ['AI 실패', 'bg-red-900/40 text-red-300 border-red-700']
                : r.status === 'failed'
                  ? ['생성 실패', 'bg-zinc-800 text-zinc-400 border-zinc-600']
                  : [STATUS_KO[r.status] ?? r.status, 'bg-zinc-800 text-zinc-400 border-zinc-700'];
          return (
            <div
              key={String(r.id)}
              className={`overflow-hidden rounded-2xl border ${
                reviewed
                  ? 'border-emerald-700/50 bg-emerald-950/15'
                  : isTerminal
                    ? 'border-amber-700/50 bg-zinc-900/50'
                    : 'border-zinc-800 bg-zinc-900/40'
              }`}
            >
              {/* 검수 상태 띠 — 한눈에 완료/미검수 구분 */}
              {reviewed ? (
                <div className="flex items-center gap-1.5 bg-emerald-900/50 px-3 py-1.5 text-xs font-bold text-emerald-300">
                  ✓ 운영자 검수완료 · {DECISION_KO[r.adminDecision!] ?? r.adminDecision}
                </div>
              ) : isTerminal ? (
                <div className="flex items-center gap-1.5 bg-amber-900/40 px-3 py-1.5 text-xs font-bold text-amber-300">
                  ● 운영자 검수 전
                </div>
              ) : null}

              <div className={`p-3 ${reviewed ? 'opacity-70' : ''}`}>
                {/* 2분할 — 좌: 아바타 / 우: 정보 */}
                <div className="flex gap-3">
                  <div className="w-[120px] shrink-0">
                    <AdminAvatarViewer rotations={rot} />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    {/* 헤더: AI배지 · 닉네임 */}
                    <div className="flex items-center gap-1.5">
                      <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${aiCls}`}>{aiLabel}</span>
                      <span className="truncate text-sm font-bold">{r.nickname ?? '(닉네임 없음)'}</span>
                    </div>
                    {/* 식별: 코드 · 다이아 · 서버 · job */}
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-zinc-500">
                      {gender ? (
                        <span className={`font-bold ${gender === 'male' ? 'text-sky-300' : 'text-pink-300'}`}>
                          {gender === 'male' ? '♂ 남성' : '♀ 여성'}
                        </span>
                      ) : null}
                      {r.code ? <span className="font-mono text-sky-400">#{r.code}</span> : null}
                      <span>💎{r.diamondEscrow.toString()}</span>
                      <ServerBadge serverId={r.serverId} />
                      <span>job {String(r.id)}</span>
                    </div>
                    <div className="text-[10px] text-zinc-500">{new Date(r.createdAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false })}</div>
                    {/* 장비 3종 — 스프라이트 이미지 가로 배치(무기·방어구·장신구). */}
                    <div className="flex gap-1.5 pt-0.5">
                      {[eqs.weaponKey, eqs.armorKey, eqs.accessoryKey].map((k, idx) => {
                        const p = k ? spritePath(k) : null;
                        return (
                          <div
                            key={idx}
                            title={eqName(k)}
                            className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md border border-zinc-800 bg-zinc-900/60"
                          >
                            {p ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={assetUrl(p)}
                                alt={eqName(k)}
                                className="absolute inset-0 h-full w-full object-contain"
                                style={{ imageRendering: 'pixelated' }}
                              />
                            ) : (
                              <span className="flex h-full items-center justify-center text-[9px] text-zinc-600">-</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {/* AI 판단 */}
                    <div className="text-[11px]">
                      <span className="text-zinc-500">AI</span>{' '}
                      {verdict ? (
                        <>
                          <span className={verdict.pass ? 'text-emerald-400' : 'text-red-400'}>{verdict.pass ? '통과' : '거절'}</span>
                          {verdict.reasons?.length ? <span className="text-zinc-400"> · {verdict.reasons.map((x) => REASON_KO[x] ?? x).join(', ')}</span> : null}
                          {verdict.notes ? <span className="text-zinc-400"> — {verdict.notes}</span> : null}
                        </>
                      ) : (
                        <span className="text-zinc-500">{r.rejectReason ?? '없음'}</span>
                      )}
                      {r.rejectReason && verdict ? <span className="text-zinc-600"> · 처리: {r.rejectReason}</span> : null}
                    </div>
                  </div>
                </div>

                {/* 스크립트(전체폭) */}
                <details className="mt-2">
                  <summary className="cursor-pointer text-[11px] text-zinc-500">프롬프트 보기</summary>
                  <pre className="mt-1 whitespace-pre-wrap break-words rounded-lg bg-zinc-950/60 p-2 text-[10px] text-zinc-300">{r.descriptionPrompt}</pre>
                </details>

                {/* 조치(전체폭) */}
                <div className="mt-3">
                  <AdminProfileGenActions
                    jobId={String(r.id)}
                    hasAvatar={!!r.userProfileId}
                    canGrant={!r.userProfileId && (r.status === 'rejected_ai' || r.status === 'failed')}
                    escrow={r.diamondEscrow.toString()}
                    decision={r.adminDecision ?? null}
                  />
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
