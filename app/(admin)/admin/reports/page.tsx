import { desc, eq, gt, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { profiles } from '@/lib/db/schema/profiles';
import { userProfiles, profileReports } from '@/lib/db/schema/avatar';

import { AdminReportActions } from './AdminReportActions';

const REASON_LABEL: Record<string, string> = {
  nsfw: '선정',
  violence: '폭력',
  hate: '혐오',
  impersonation: '사칭',
  quality: '부적절',
  other: '기타',
};

export default async function AdminReportsPage() {
  // 진입 가드는 (admin)/layout.tsx 일원화.
  const [reported, reasonRows] = await Promise.all([
    db
      .select({
        id: userProfiles.id,
        nickname: profiles.nickname,
        rotations: userProfiles.rotations,
        activeDirection: userProfiles.activeDirection,
        reportCount: userProfiles.reportCount,
        hiddenAt: userProfiles.hiddenAt,
      })
      .from(userProfiles)
      .innerJoin(profiles, eq(profiles.id, userProfiles.userId))
      .where(gt(userProfiles.reportCount, 0))
      .orderBy(desc(userProfiles.reportCount)),
    db
      .select({
        profileId: profileReports.profileId,
        reason: profileReports.reason,
        c: sql<number>`count(*)::int`,
      })
      .from(profileReports)
      .groupBy(profileReports.profileId, profileReports.reason),
  ]);

  const reasonMap = new Map<string, { reason: string; c: number }[]>();
  for (const r of reasonRows) {
    const arr = reasonMap.get(r.profileId) ?? [];
    arr.push({ reason: r.reason, c: Number(r.c) });
    reasonMap.set(r.profileId, arr);
  }

  return (
    <div className="mx-auto w-full max-w-[480px] space-y-3 px-4 py-6">
      <h1 className="text-lg font-bold">🚩 프로필 신고 ({reported.length})</h1>
      {reported.length === 0 ? (
        <p className="py-10 text-center text-sm text-zinc-500">신고된 프로필이 없습니다.</p>
      ) : (
        reported.map((p) => {
          const rot = p.rotations as Record<string, string>;
          const charImg = rot[p.activeDirection] ?? null;
          const reasons = (reasonMap.get(p.id) ?? []).sort((a, b) => b.c - a.c);
          return (
            <div
              key={p.id}
              className={`flex gap-3 rounded-xl border p-3 ${
                p.hiddenAt
                  ? 'border-zinc-300 bg-zinc-100 opacity-70 dark:border-zinc-700 dark:bg-zinc-900'
                  : 'border-zinc-200 dark:border-zinc-800'
              }`}
            >
              <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-gradient-to-b from-zinc-700 to-zinc-950">
                {charImg && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={charImg} alt="" aria-hidden className="absolute inset-0 h-full w-full object-contain object-bottom" style={{ imageRendering: 'pixelated', transform: 'scale(1.4)', transformOrigin: 'center bottom' }} />
                )}
              </div>
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold">{p.nickname}</span>
                  <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700 dark:bg-red-950/50 dark:text-red-300">
                    신고 {p.reportCount}
                  </span>
                  {p.hiddenAt && (
                    <span className="shrink-0 text-[11px] text-zinc-500">비공개됨</span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {reasons.map((r) => (
                    <span key={r.reason} className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                      {REASON_LABEL[r.reason] ?? r.reason} {r.c}
                    </span>
                  ))}
                </div>
                <AdminReportActions profileId={p.id} hidden={!!p.hiddenAt} />
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
