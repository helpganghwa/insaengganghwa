import { openServerIds } from '@/lib/game/server-list';
import { readStoredEraSummaries } from '@/lib/game/history/era-store';
import { loadEraInputs } from '@/lib/game/history/loaders';

import { EraEditor, SyncAllButton } from './EraEditor';

export const dynamic = 'force-dynamic';

/**
 * 역사 시대 요약 검수(0202, 2026-09-18) — 역사 페이지의 장(章) 요약은 이야기꾼(AI)이 쓰고 코드가 검증하지만
 * 연대기처럼 운영자가 마지막 말을 갖는다. 저장하면 잠기고(크론이 덮어쓰지 않음), 다시 생성은 잠금을 푼 뒤에.
 */
export default async function AdminHistoryErasPage() {
  const servers = await openServerIds();
  const blocks = await Promise.all(
    servers.map(async (serverId) => {
      const [inputs, stored] = await Promise.all([loadEraInputs(serverId).catch(() => []), readStoredEraSummaries(serverId)]);
      return { serverId, inputs, stored };
    }),
  );
  return (
    <div className="space-y-8 p-4">
      <div>
        <h1 className="text-lg font-bold">역사 시대 요약</h1>
        <p className="mt-1 text-[12px] text-zinc-400">
          시대는 시작일로 식별한다. 끝난 시대는 사실이 변하지 않아 한 번 생성되면 그대로이고, 진행 중인 시대는 자정 공개 뒤 사실표가 바뀌면 다시 생성된다.
          저장하면 잠겨서 자동 갱신이 멈춘다. 저장·잠금 해제 즉시 역사 페이지 캐시가 비워진다.
        </p>
      </div>
      {blocks.map(({ serverId, inputs, stored }) => (
        <section key={serverId} className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[14px] font-bold">서버 {serverId} · 시대 {inputs.length}</h2>
            <SyncAllButton serverId={serverId} />
          </div>
          {inputs.length === 0 ? <p className="text-[12px] text-zinc-500">시대가 없습니다.</p> : null}
          {inputs.map((inp, i) => {
            const row = stored.get(inp.facts.from);
            return (
              <EraEditor
                key={inp.facts.from}
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
              />
            );
          })}
        </section>
      ))}
    </div>
  );
}
