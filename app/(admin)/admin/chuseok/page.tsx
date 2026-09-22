import { requireAdmin } from '@/lib/auth/require-admin';
import { CHUSEOK_ACCRUE_END_ISO, CHUSEOK_CLAIM_END_ISO, CHUSEOK_START_ISO, chuseokPhase } from '@/lib/game/chuseok/config';
import { contestSettledAt, getContestBoard } from '@/lib/game/chuseok/contest';
import { listServers } from '@/lib/game/servers';

import { SettleButton } from './SettleButton';

export const dynamic = 'force-dynamic';

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false }) : '-');

/**
 * 한가위 강화 대회 정산(2026-09-22) — 서버별로 마감 시각 기준 최종 순위를 미리 보고, 10/1에 [정산·지급]을
 * 한 번 누른다. 지급 = 순위 우편(💎·📦) + 칭호(도달 등수 이하 전부). 정지·탈퇴 계정은 자동 제외·승계.
 */
export default async function AdminChuseokPage() {
  await requireAdmin();
  const phase = chuseokPhase();
  const servers = await listServers();
  const boards = await Promise.all(servers.map(async (s) => ({ server: s, board: await getContestBoard(s.id, null), settledAt: await contestSettledAt(s.id) })));
  return (
    <main className="mx-auto w-full max-w-[760px] px-4 py-5">
      <h1 className="text-lg font-bold">한가위 강화 대회 정산</h1>
      <p className="mb-4 mt-1 text-[12px] leading-relaxed text-zinc-500">
        기간 {CHUSEOK_START_ISO.slice(0, 16).replace('T', ' ')} ~ {CHUSEOK_ACCRUE_END_ISO.slice(0, 16).replace('T', ' ')} (KST) · 결과·교환 마감 {CHUSEOK_CLAIM_END_ISO.slice(0, 10)} · 지금 국면 <b>{phase}</b>.
        아래 순위는 <b>마감 시각 기준</b>(대회 중이면 지금 기준)으로 강화 기록에서 계산한 값입니다. 정산은 서버당 한 번만 되고, 이미 정산된 서버는 확정 표를 보여 줍니다.
      </p>
      {boards.map(({ server, board, settledAt }) => (
        <section key={server.id} className="mb-6 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-[14px] font-bold">
              {server.id}서버 · {server.name} <span className="ml-1 text-[11px] font-medium text-zinc-500">{server.status}</span>
            </h2>
            {settledAt ? (
              <span className="text-[11.5px] font-bold text-emerald-600">정산 완료 {fmt(settledAt)}</span>
            ) : (
              <SettleButton serverId={server.id} disabled={phase === 'accrue' || phase === 'before'} />
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {board.items.map((it) => (
              <div key={it.code} className="rounded-lg border border-zinc-200 p-2 dark:border-zinc-800">
                <div className="mb-1 flex items-baseline justify-between">
                  <b className="text-[12.5px]">{it.name}</b>
                  <span className="text-[10.5px] text-zinc-500">
                    {it.set === 'moon' ? '달토끼' : '한복'} · 참가 {it.participants}
                  </span>
                </div>
                {it.rows.length === 0 ? (
                  <p className="text-[11px] text-zinc-500">참가자 없음</p>
                ) : (
                  <ol className="space-y-0.5 text-[11.5px]">
                    {it.rows.map((r) => (
                      <li key={r.rank} className="flex items-center gap-2 tabular-nums">
                        <span className="w-5 text-zinc-500">{r.rank}</span>
                        <span className="min-w-0 flex-1 truncate">{r.nickname}</span>
                        <span className="font-mono">+{r.level}</span>
                        <span className="w-[112px] text-right text-[10.5px] text-zinc-500">{fmt(r.reachedAt)}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
