import { and, desc, eq, gte, lt } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { profileGenerationJobs, userProfiles } from '@/lib/db/schema/avatar';
import { characters } from '@/lib/db/schema/server';
import { CATALOG_ITEMS } from '@/lib/game/equipment/catalog';

import { AdminProfileGenActions } from './AdminProfileGenActions';
import { AdminAvatarViewer } from './AdminAvatarViewer';

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
const STATUS_CLS: Record<string, string> = {
  accepted: 'bg-emerald-900/40 text-emerald-300 border-emerald-700',
  rejected_ai: 'bg-red-900/40 text-red-300 border-red-700',
  failed: 'bg-zinc-800 text-zinc-300 border-zinc-600',
};
async function pixellabRotations(charId: string): Promise<Record<string, string>> {
  const key = process.env.PIXELLAB_API_KEY;
  if (!key) return {};
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
  searchParams: Promise<{ status?: string; date?: string }>;
}) {
  // 진입 가드는 (admin)/layout.tsx 일원화.
  const { status, date } = await searchParams;
  // 날짜 필터(KST 하루). 기본 = 오늘(KST). createdAt(UTC timestamptz)을 KST 일자 범위로 조회.
  const kstToday = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const day = /^\d{4}-\d{2}-\d{2}$/.test(date ?? '') ? date! : kstToday;
  const dayMs = new Date(`${day}T00:00:00+09:00`).getTime();
  const start = new Date(dayMs);
  const end = new Date(dayMs + 24 * 3600 * 1000);
  const fmtKst = (ms: number) => new Date(ms + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const prevDay = fmtKst(dayMs - 24 * 3600 * 1000);
  const nextDay = fmtKst(dayMs + 24 * 3600 * 1000);
  const qs = (d: string, s?: string) => `?date=${d}${s ? `&status=${s}` : ''}`;
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
    .leftJoin(userProfiles, eq(userProfiles.id, profileGenerationJobs.userProfileId))
    .where(and(gte(profileGenerationJobs.createdAt, start), lt(profileGenerationJobs.createdAt, end)))
    .orderBy(desc(profileGenerationJobs.createdAt))
    .limit(300);

  const rows = status && STATUS_KO[status] ? all.filter((r) => r.status === status) : all;

  // 8방향 이미지: 통과=저장 rotations, 그 외=Pixellab 캐릭터에서 조회.
  const imgs = await Promise.all(
    rows.map(async (r) => {
      if (r.rotations && Object.keys(r.rotations as object).length) return r.rotations as Record<string, string>;
      if (r.pixellabCharacterId) return pixellabRotations(r.pixellabCharacterId);
      return {} as Record<string, string>;
    }),
  );

  const counts = all.reduce<Record<string, number>>((a, r) => {
    a[r.status] = (a[r.status] ?? 0) + 1;
    return a;
  }, {});

  // 검수 필요(종료 상태인데 운영자 미결정) 건수 — 날짜별 점검 진척 표시.
  const TERMINAL = ['accepted', 'rejected_ai', 'failed'];
  const pendingReview = all.filter((r) => TERMINAL.includes(r.status) && !r.adminDecision).length;

  return (
    <div className="mx-auto w-full max-w-[860px] space-y-4 px-4 py-6 text-zinc-100">
      <h1 className="text-lg font-bold">🎨 아바타 생성 내역 ({rows.length})</h1>
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
      {/* 상태 필터 (날짜 유지) */}
      <div className="flex flex-wrap gap-2 text-xs">
        <a href={qs(day)} className={`rounded-full border px-3 py-1 ${!status ? 'border-amber-500 text-amber-300' : 'border-zinc-700 text-zinc-400'}`}>전체 {all.length}</a>
        {Object.entries(STATUS_KO).map(([k, ko]) => (
          <a key={k} href={qs(day, k)} className={`rounded-full border px-3 py-1 ${status === k ? 'border-amber-500 text-amber-300' : 'border-zinc-700 text-zinc-400'}`}>
            {ko} {counts[k] ?? 0}
          </a>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-zinc-500">내역이 없습니다.</p>
      ) : (
        rows.map((r, i) => {
          const rot = imgs[i]!;
          const opts = (r.options ?? {}) as { gender?: string; race?: string; pose?: string; hairLength?: string };
          const eqs = (r.equipmentSnapshot ?? {}) as { weaponKey?: string; armorKey?: string; accessoryKey?: string };
          const verdict = (r.aiVerdict ?? null) as { pass?: boolean; reasons?: string[]; notes?: string } | null;
          const eqName = (key?: string) => (key ? (NAME_BY_CODE.get(key) ?? key) : '-');
          return (
            <div key={String(r.id)} className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-3">
              {/* 헤더: 유저 + 상태 */}
              <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="font-bold">{r.nickname ?? '(닉네임 없음)'}</span>
                <span className="text-[11px] text-zinc-500">srv {r.serverId} · {r.userId.slice(0, 8)}</span>
                <span className={`rounded-md border px-2 py-0.5 text-[11px] font-bold ${STATUS_CLS[r.status] ?? 'border-zinc-600 text-zinc-300'}`}>
                  {STATUS_KO[r.status] ?? r.status}
                </span>
                <span className="text-[11px] text-zinc-500">{new Date(r.createdAt).toLocaleString('ko-KR')}</span>
                <span className="ml-auto text-[11px] text-zinc-400">💎 escrow {r.diamondEscrow.toString()}</span>
              </div>

              {/* 아바타 — 가로 꽉 채운 1:1, 좌우 스와이프로 8방향 회전 */}
              <AdminAvatarViewer rotations={rot} />

              {/* 메타: 성별/장비 */}
              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <div><span className="text-zinc-500">성별</span> {opts.gender === 'male' ? '남성' : opts.gender === 'female' ? '여성' : (opts.gender ?? '-')}{opts.race ? ` · ${opts.race}` : ''}{opts.hairLength ? ` · 머리 ${opts.hairLength}` : ''}{opts.pose ? ` · 포즈 ${opts.pose}` : ''}</div>
                <div><span className="text-zinc-500">무기</span> {eqName(eqs.weaponKey)}</div>
                <div><span className="text-zinc-500">방어구</span> {eqName(eqs.armorKey)}</div>
                <div><span className="text-zinc-500">장신구</span> {eqName(eqs.accessoryKey)}</div>
              </div>

              {/* AI 판단 */}
              <div className="mt-2 rounded-lg border border-zinc-800 bg-zinc-950/60 p-2 text-xs">
                <span className="font-bold">AI 판단: </span>
                {verdict ? (
                  <>
                    <span className={verdict.pass ? 'text-emerald-400' : 'text-red-400'}>{verdict.pass ? '통과' : '거절'}</span>
                    {verdict.reasons?.length ? <span className="text-zinc-400"> · {verdict.reasons.map((x) => REASON_KO[x] ?? x).join(', ')}</span> : null}
                    {verdict.notes ? <div className="mt-1 text-zinc-300">{verdict.notes}</div> : null}
                  </>
                ) : (
                  <span className="text-zinc-500">{r.rejectReason ?? '없음'}</span>
                )}
                {r.rejectReason && verdict ? <div className="mt-1 text-zinc-500">처리: {r.rejectReason}</div> : null}
              </div>

              {/* 스크립트(생성 프롬프트) */}
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-zinc-400">생성 스크립트(프롬프트) 보기</summary>
                <pre className="mt-1 whitespace-pre-wrap break-words rounded-lg bg-zinc-950/60 p-2 text-[11px] text-zinc-300">{r.descriptionPrompt}</pre>
              </details>

              {/* 조치 */}
              <div className="mt-3">
                <AdminProfileGenActions jobId={String(r.id)} hasAvatar={!!r.userProfileId} escrow={r.diamondEscrow.toString()} decision={r.adminDecision ?? null} />
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
