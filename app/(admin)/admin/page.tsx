import Link from 'next/link';
import { and, eq, gt, gte, inArray, isNull, lt, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { paymentAlerts } from '@/lib/db/schema/payment';
import { clientErrors } from '@/lib/db/schema/ops';
import { userProfiles, profileGenerationJobs } from '@/lib/db/schema/avatar';

/**
 * 관리자 허브 — /admin. (admin) 레이아웃이 접근을 게이트하므로 여기선 메뉴만.
 * 각 운영 페이지로 진입하는 카드 링크 + 미처리 건수 배지. 새 admin 페이지 추가 시 MENU에 1줄 추가.
 */
export const dynamic = 'force-dynamic';

/** 페이지별 미처리(액션 필요) 건수 — href 키로 배지 매핑. */
async function pendingCounts(): Promise<Record<string, number>> {
  const one = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0;
  // 아바타 검수 배지 = 오늘(KST) 미검수 = 종결 상태(통과/AI거절/실패)인데 운영자 결정 전.
  const kstToday = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const dayMs = new Date(`${kstToday}T00:00:00+09:00`).getTime();
  const dayStart = new Date(dayMs);
  const dayEnd = new Date(dayMs + 24 * 3600 * 1000);
  const [alerts, reports, genTodo, cerrors] = await Promise.all([
    // 미해결 결제 사고.
    one(
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(paymentAlerts)
        .where(eq(paymentAlerts.resolved, false)),
    ),
    // 신고 누적 + 아직 비공개 조치 전.
    one(
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(userProfiles)
        .where(and(gt(userProfiles.reportCount, 0), isNull(userProfiles.hiddenAt))),
    ),
    // 오늘 미검수(운영자 결정 전 종결 잡).
    one(
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(profileGenerationJobs)
        .where(
          and(
            inArray(profileGenerationJobs.status, ['accepted', 'rejected_ai', 'failed']),
            isNull(profileGenerationJobs.adminDecision),
            gte(profileGenerationJobs.createdAt, dayStart),
            lt(profileGenerationJobs.createdAt, dayEnd),
          ),
        ),
    ),
    // 미해결 클라이언트 에러 그룹.
    one(
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(clientErrors)
        .where(eq(clientErrors.resolved, false)),
    ),
  ]);
  return {
    '/admin/alerts': alerts,
    '/admin/reports': reports,
    '/admin/profile-gen': genTodo,
    '/admin/client-errors': cerrors,
  };
}

const MENU: { href: string; icon: string; title: string; desc: string; external?: boolean }[] = [
  {
    href: '/admin/profile-gen',
    icon: '🎨',
    title: '아바타 생성 검수',
    desc: '생성 성공·실패 내역 조회, 통과 회수+환불 / 실패 아바타 지급 (분쟁 처리)',
  },
  {
    href: '/admin/reports',
    icon: '🚩',
    title: '프로필 신고',
    desc: '신고 누적 프로필 확인 및 비공개 조치',
  },
  {
    href: '/admin/announcements',
    icon: '📋',
    title: '공지사항',
    desc: '전역 공지 작성·발행·고정 (홈 게시판·강제 팝업 노출)',
  },
  {
    href: '/admin/mail',
    icon: '📬',
    title: '운영자 우편 발송',
    desc: '유저에게 다이아·보급상자·공지 우편 발송',
  },
  {
    href: '/admin/payments',
    icon: '💳',
    title: '결제 내역 · 환불',
    desc: '결제건 조회, 결제완료 건 환불(포트원 취소 + 재화 회수)',
  },
  {
    href: '/admin/alerts',
    icon: '🔔',
    title: '결제 사고 알림',
    desc: '미지급·환불 미회수·금액불일치 등 사고 감지 내역, 자동치유 재시도/해결 처리',
  },
  {
    href: '/admin/maintenance',
    icon: '🔧',
    title: '서버 점검',
    desc: '점검/긴급정지 토글(시간지정·무기한). 일반 유저는 점검화면, 어드민은 정상 접근',
  },
  {
    href: '/admin/client-errors',
    icon: '🐞',
    title: '클라이언트 에러',
    desc: '사용자 기기 전역 에러 수집(그룹화·발생횟수). 해결 처리',
  },
];

export default async function AdminHubPage() {
  const counts = await pendingCounts();
  return (
    <div className="mx-auto w-full max-w-[760px] space-y-4 px-4 py-6 text-zinc-100">
      <h1 className="text-xl font-bold">🛠️ 관리자 메뉴</h1>
      <p className="text-xs text-zinc-500">운영 페이지로 이동합니다. 숫자 배지 = 미처리 건수.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {MENU.map((m) => {
          const n = counts[m.href] ?? 0;
          const inner = (
            <>
              <div className="relative text-2xl">
                {m.icon}
                {n > 0 && (
                  <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
                    {n > 99 ? '99+' : n}
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 font-bold">
                  {m.title}
                  {n > 0 && <span className="text-xs font-bold text-red-400">{n}</span>}
                </div>
                <div className="mt-0.5 text-xs text-zinc-400">{m.desc}</div>
              </div>
            </>
          );
          const cls = `flex items-start gap-3 rounded-2xl border bg-zinc-900/50 p-4 transition hover:bg-zinc-900 ${
            n > 0 ? 'border-red-800/60 hover:border-red-600' : 'border-zinc-800 hover:border-amber-600'
          }`;
          return m.external ? (
            <a key={m.href} href={m.href} className={cls}>
              {inner}
            </a>
          ) : (
            <Link key={m.href} href={m.href} className={cls}>
              {inner}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
