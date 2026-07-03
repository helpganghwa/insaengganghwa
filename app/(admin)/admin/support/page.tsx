import Link from 'next/link';

import { listInquiries } from '@/lib/game/support/inquiry';
import { INQUIRY_LABEL } from '@/lib/game/support/types';
import { listServers } from '@/lib/game/servers';

import { ServerBadge } from '../ServerBadge';
import { ServerFilter, parseServerFilter } from '../ServerFilter';
import { AdminSupportAnswer } from './AdminSupportAnswer';
import { AdminSupportDelete } from './AdminSupportDelete';

export const dynamic = 'force-dynamic';

function fmt(d: Date): string {
  return new Date(d).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false });
}

const STATUS_TABS: { id: 'open' | 'answered' | 'all'; label: string }[] = [
  { id: 'open', label: '미답변' },
  { id: 'answered', label: '답변완료' },
  { id: 'all', label: '전체' },
];

export default async function AdminSupportPage({
  searchParams,
}: {
  searchParams: Promise<{ srv?: string; status?: string }>;
}) {
  // 진입 가드는 (admin)/layout.tsx 일원화.
  const { srv, status } = await searchParams;
  const srvFilter = parseServerFilter(srv);
  const st: 'open' | 'answered' | 'all' =
    status === 'answered' ? 'answered' : status === 'all' ? 'all' : 'open';
  const servers = await listServers();
  const rows = await listInquiries(st, srvFilter, 150);

  const tabHref = (id: string) => {
    const p = new URLSearchParams();
    p.set('status', id);
    if (srv) p.set('srv', srv);
    return `/admin/support?${p.toString()}`;
  };

  return (
    <div className="px-4 py-4">
      <h1 className="text-lg font-bold">고객센터 문의 ({rows.length})</h1>

      <div className="mt-2 flex items-center gap-1.5">
        {STATUS_TABS.map((t) => (
          <Link
            key={t.id}
            href={tabHref(t.id)}
            className={`rounded-full px-3 py-1 text-[12px] font-semibold ${
              st === t.id
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <div className="mt-2">
        <ServerFilter basePath="/admin/support" servers={servers} current={srvFilter} />
      </div>

      {rows.length === 0 ? (
        <p className="mt-8 text-center text-sm text-zinc-400">문의가 없습니다.</p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {rows.map((r) => {
            const snap = (r.contextSnapshot ?? {}) as { nickname?: string | null; code?: string | null };
            return (
              <li
                key={String(r.id)}
                className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800"
              >
                <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 font-bold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                    {INQUIRY_LABEL[r.type] ?? r.type}
                  </span>
                  <ServerBadge serverId={r.serverId} />
                  <span className="font-semibold">{snap.nickname ?? '알 수 없음'}</span>
                  {snap.code ? <span className="tabular-nums text-zinc-400">#{snap.code}</span> : null}
                  <span className="ml-auto text-[11px] text-zinc-400">{fmt(r.createdAt)}</span>
                  {r.status === 'answered' ? (
                    <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                      답변완료
                    </span>
                  ) : (
                    <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700 dark:bg-red-950/40 dark:text-red-300">
                      미답변
                    </span>
                  )}
                  <AdminSupportDelete inquiryId={String(r.id)} />
                </div>

                <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-zinc-700 dark:text-zinc-200">
                  {r.body}
                </p>

                {r.status === 'answered' ? (
                  <div className="mt-2 rounded-lg bg-zinc-50 p-2.5 dark:bg-zinc-900">
                    <div className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                      답변 {r.answeredAt ? `· ${fmt(r.answeredAt)}` : ''}
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-300">
                      {r.answerBody}
                    </p>
                  </div>
                ) : (
                  <AdminSupportAnswer inquiryId={String(r.id)} />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
