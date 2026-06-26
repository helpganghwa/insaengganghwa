import { and, desc, eq, gt, inArray } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { characters } from '@/lib/db/schema/server';
import { profiles } from '@/lib/db/schema/profiles';
import { userProfiles, profileReports } from '@/lib/db/schema/avatar';

import { AdminReportActions } from './AdminReportActions';

const REASON_LABEL: Record<string, string> = {
  nickname: '닉네임',
  avatar: '아바타',
  bug_abuse: '버그 악용',
  other: '기타',
  // 레거시 사유(과거 데이터 호환).
  nsfw: '선정',
  violence: '폭력',
  hate: '혐오',
  impersonation: '사칭',
  quality: '부적절',
};

function fmt(d: Date): string {
  return d.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false });
}

export default async function AdminReportsPage() {
  // 진입 가드는 (admin)/layout.tsx 일원화.
  // 신고 대상 프로필 + 소유자(닉네임은 해당 서버 캐릭터, 코드는 계정).
  const reported = await db
    .select({
      id: userProfiles.id,
      userId: userProfiles.userId,
      serverId: userProfiles.serverId,
      nickname: characters.nickname,
      code: profiles.publicCode,
      rotations: userProfiles.rotations,
      activeDirection: userProfiles.activeDirection,
      reportCount: userProfiles.reportCount,
      createdAt: userProfiles.createdAt,
      bannedAt: profiles.bannedAt,
      banUntil: profiles.banUntil,
    })
    .from(userProfiles)
    .leftJoin(
      characters,
      and(eq(characters.userId, userProfiles.userId), eq(characters.serverId, userProfiles.serverId)),
    )
    .leftJoin(profiles, eq(profiles.id, userProfiles.userId))
    .where(gt(userProfiles.reportCount, 0))
    .orderBy(desc(userProfiles.reportCount));

  const profileIds = reported.map((r) => r.id);

  // 각 대상의 개별 신고(신고자·사유·내용·시각).
  const reportRows = profileIds.length
    ? await db
        .select({
          profileId: profileReports.profileId,
          reporterUserId: profileReports.reporterUserId,
          reason: profileReports.reason,
          note: profileReports.note,
          createdAt: profileReports.createdAt,
        })
        .from(profileReports)
        .where(inArray(profileReports.profileId, profileIds))
        .orderBy(desc(profileReports.createdAt))
    : [];

  // 신고자 신원(코드·닉네임) — 행 곱셈 방지로 별도 조회 후 맵.
  const reporterIds = [...new Set(reportRows.map((r) => r.reporterUserId))];
  const [reporterCodes, reporterNicks] = reporterIds.length
    ? await Promise.all([
        db
          .select({ id: profiles.id, code: profiles.publicCode })
          .from(profiles)
          .where(inArray(profiles.id, reporterIds)),
        db
          .select({ userId: characters.userId, nickname: characters.nickname })
          .from(characters)
          .where(inArray(characters.userId, reporterIds)),
      ])
    : [[], []];
  const codeByUser = new Map(reporterCodes.map((r) => [r.id, r.code]));
  const nickByUser = new Map<string, string>();
  for (const r of reporterNicks) if (!nickByUser.has(r.userId)) nickByUser.set(r.userId, r.nickname);

  // 대상별 그룹: 사유 요약 + 개별 신고 목록.
  const reasonMap = new Map<string, Map<string, number>>();
  const reportsByProfile = new Map<
    string,
    { reporterCode: string | null; reporterNick: string | null; reason: string; note: string | null; createdAt: Date }[]
  >();
  for (const r of reportRows) {
    const rm = reasonMap.get(r.profileId) ?? new Map<string, number>();
    rm.set(r.reason, (rm.get(r.reason) ?? 0) + 1);
    reasonMap.set(r.profileId, rm);
    const arr = reportsByProfile.get(r.profileId) ?? [];
    arr.push({
      reporterCode: codeByUser.get(r.reporterUserId) ?? null,
      reporterNick: nickByUser.get(r.reporterUserId) ?? null,
      reason: r.reason,
      note: r.note,
      createdAt: r.createdAt,
    });
    reportsByProfile.set(r.profileId, arr);
  }

  return (
    <div className="mx-auto w-full max-w-[560px] space-y-3 px-4 py-6">
      <h1 className="text-lg font-bold">🚩 프로필 신고 ({reported.length})</h1>
      {reported.length === 0 ? (
        <p className="py-10 text-center text-sm text-zinc-500">신고된 프로필이 없습니다.</p>
      ) : (
        reported.map((p) => {
          const rot = p.rotations as Record<string, string>;
          const charImg = rot[p.activeDirection] ?? null;
          const reasons = [...(reasonMap.get(p.id) ?? new Map())].sort((a, b) => b[1] - a[1]);
          const reports = reportsByProfile.get(p.id) ?? [];
          const banned = !!p.bannedAt && (!p.banUntil || p.banUntil.getTime() > Date.now());
          return (
            <div key={p.id} className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
              {/* 신고받은 사람 */}
              <div className="flex gap-3">
                <div className="relative h-20 w-20 shrink-0 isolate overflow-hidden rounded-lg bg-gradient-to-b from-zinc-700 to-zinc-950">
                  {charImg && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={charImg} alt="" aria-hidden className="absolute inset-0 h-full w-full object-contain object-bottom" style={{ imageRendering: 'pixelated' }} />
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="truncate text-sm font-semibold">{p.nickname ?? '(닉네임 없음)'}</span>
                    {p.code && <span className="font-mono text-[10px] text-sky-600 dark:text-sky-400">#{p.code}</span>}
                    <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700 dark:bg-red-950/50 dark:text-red-300">
                      신고 {p.reportCount}
                    </span>
                    {banned && <span className="shrink-0 rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-bold text-red-400">정지됨</span>}
                  </div>
                  <div className="mt-0.5 text-[10px] text-zinc-500">
                    srv{p.serverId} · 프로필 생성 {fmt(p.createdAt)}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {reasons.map(([reason, c]) => (
                      <span key={reason} className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                        {REASON_LABEL[reason] ?? reason} {c}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* 개별 신고 목록 — 신고자·사유·내용·시각 */}
              {reports.length > 0 && (
                <ul className="mt-2 space-y-1 border-t border-zinc-100 pt-2 dark:border-zinc-800">
                  {reports.map((r, i) => (
                    <li key={i} className="text-[11px] leading-snug">
                      <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                        {r.reporterNick ?? '?'}
                      </span>
                      {r.reporterCode && (
                        <span className="ml-1 font-mono text-[10px] text-sky-600 dark:text-sky-400">#{r.reporterCode}</span>
                      )}
                      <span className="text-zinc-500"> · {REASON_LABEL[r.reason] ?? r.reason}</span>
                      <span className="ml-1 text-[10px] text-zinc-400">{fmt(r.createdAt)}</span>
                      {r.note && (
                        <div className="mt-0.5 rounded bg-amber-50 px-2 py-1 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                          {r.note}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              <AdminReportActions profileId={p.id} banned={banned} />
            </div>
          );
        })
      )}
    </div>
  );
}
