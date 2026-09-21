import { openServerIds } from '@/lib/game/server-list';
import { readStoredEraSummaries } from '@/lib/game/history/era-store';
import { loadEraInputsForView } from '@/lib/game/history/loaders';

import { EraEditor, SyncAllButton } from './EraEditor';

export const dynamic = 'force-dynamic';

/**
 * 역사 시대 요약 검수(0202·0203) — 역사 페이지의 장(章) 요약은 이야기꾼(AI)이 **제안**하고 운영자가 확인해 적용한다.
 * 자정 공개 뒤 사실표가 바뀐 시대에 제안이 쌓이고, [제안 적용]·[저장] 전까지 역사 페이지의 글은 바뀌지 않는다.
 */
export default async function AdminHistoryErasPage() {
  const servers = await openServerIds();
  const blocks = await Promise.all(
    servers.map(async (serverId) => {
      const [inputs, stored] = await Promise.all([loadEraInputsForView(serverId).catch(() => []), readStoredEraSummaries(serverId)]);
      return { serverId, inputs, stored };
    }),
  );
  return (
    <div className="space-y-8 p-4">
      <div>
        <h1 className="text-lg font-bold">역사 시대 요약</h1>
        <p className="mt-1 text-[12px] text-zinc-400">
          이야기꾼은 제안만 하고, 역사 페이지의 글은 여기서 [제안 적용]이나 [저장]을 눌러야 바뀐다. 진행 중인 시대는 자정 공개 뒤 사실표가 바뀔 때마다 새
          제안이 오고, 끝난 시대는 사실이 변하지 않아 더는 오지 않는다. 처음 생긴 시대는 적용 전까지 집계 문장이 나간다. 잠그면 그 시대에는 제안이 오지 않는다.
        </p>
      </div>
      {blocks.map(({ serverId, inputs, stored }) => (
        <section key={serverId} className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[14px] font-bold">
              서버 {serverId} · 시대 {inputs.length}
              {(() => {
                const n = [...stored.values()].filter((r) => r.proposedSummary != null).length;
                return n > 0 ? <span className="ml-2 text-[12px] font-semibold text-amber-400">적용 대기 {n}</span> : null;
              })()}
            </h2>
            <SyncAllButton serverId={serverId} />
          </div>
          {inputs.length === 0 ? <p className="text-[12px] text-zinc-500">시대가 없습니다.</p> : null}
          {inputs.map((inp, i) => {
            const row = stored.get(inp.facts.from);
            return (
              <EraEditor
                key={`${inp.facts.from}:${row?.updatedAt.getTime() ?? 0}:${row?.proposedAt?.getTime() ?? 0}`}
                serverId={serverId}
                index={i + 1}
                leader={inp.facts.leader}
                from={inp.facts.from}
                to={inp.facts.to}
                days={inp.facts.days}
                ongoing={inp.facts.ongoing}
                summary={row?.summary ?? inp.fallback.summary}
                closing={row?.closing ?? inp.fallback.closing}
                source={row ? row.source : 'none'}
                locked={row?.locked ?? false}
                updatedAt={row ? row.updatedAt.toISOString() : null}
                fallback={inp.fallback}
                proposal={
                  row?.proposedSummary != null
                    ? { summary: row.proposedSummary, closing: row.proposedClosing ?? '', at: row.proposedAt ? row.proposedAt.toISOString() : null }
                    : null
                }
              />
            );
          })}
        </section>
      ))}
    </div>
  );
}
