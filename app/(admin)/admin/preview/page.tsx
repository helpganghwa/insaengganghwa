import { desc, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { worldChronicle, zones as zonesTable } from '@/lib/db/schema/guild';
import { getConquestReplay, type ConquestReplay } from '@/lib/game/guild';

import { ServerBadge } from '../ServerBadge';
import { AdminAvatarViewer } from '../profile-gen/AdminAvatarViewer';
import { ChronicleEditor, TrophyRegenButton } from './PreviewClient';

/**
 * 공개 전 검수 — 유저 공개 전에 운영자가 미리 보고 손보는 콘텐츠(2026-07-14).
 *  · 점령전 연대기: 23:05 생성 → 자정 공개. 검수 창 23:05~24:00(공개 후 수정도 즉시 반영).
 *  · 대난투 우승 트로피: 9시대 생성 → 10:00 공개. 재생성은 트로피 크론(KST 9~12시) 창에서 진행.
 */
export const dynamic = 'force-dynamic';

// 항목별 최근 2개만 — 검수 대상은 항상 최신분(2026-07-15), 과거분은 스크롤 노이즈.
async function loadData() {
  const [chronicles, battles] = await Promise.all([
    db
      .select()
      .from(worldChronicle)
      .orderBy(desc(worldChronicle.kstDay))
      .limit(2),
    db.execute(sql`
      select mb.id::text as id, mb.server_id, mb.battle_date::text as battle_date,
             mb.status::text as status, mb.trophy_status, mb.trophy_attempts,
             mb.finale->>'trophyAvatar' as trophy_avatar,
             c.nickname as champion
      from melee_battles mb
      left join characters c on c.user_id = mb.champion_user_id and c.server_id = mb.server_id
      order by mb.battle_date desc, mb.server_id
      limit 2
    `) as unknown as Promise<
      {
        id: string;
        server_id: number;
        battle_date: string;
        status: string;
        trophy_status: string | null;
        trophy_attempts: number;
        trophy_avatar: string | null;
        champion: string | null;
      }[]
    >,
  ]);
  // 애니메이션 미리보기 재료(2026-07-16) — 연대기 날짜별 리플레이 스크립트 + 구역 좌표.
  const replays = new Map<string, ConquestReplay | null>();
  for (const c of chronicles) {
    replays.set(
      `${c.serverId}:${c.kstDay}`,
      await getConquestReplay(c.serverId, c.kstDay).catch(() => null),
    );
  }
  const zoneRows = await db
    .select({
      id: zonesTable.id,
      name: zonesTable.name,
      mapX: zonesTable.mapX,
      mapY: zonesTable.mapY,
      region: zonesTable.region,
      serverId: zonesTable.serverId,
    })
    .from(zonesTable);
  return { chronicles, battles, replays, zoneRows };
}

const isTodayKst = (day: string) =>
  day === new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

export default async function AdminPreviewPage() {
  const { chronicles, battles, replays, zoneRows } = await loadData();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
      <h1 className="text-xl font-bold">공개 전 검수</h1>

      {/* ── 점령전 연대기 ── */}
      <section>
        <h2 className="text-sm font-bold text-zinc-400">
          점령전 연대기 <span className="font-normal">— 23:05 생성 → 자정 공개(검수 창 23:05~24:00)</span>
        </h2>
        {chronicles.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">연대기가 없습니다.</p>
        ) : (
          <div className="mt-2 space-y-4">
            {chronicles.map((c) => (
              <div key={`${c.serverId}:${c.kstDay}`} className="rounded-xl border border-zinc-800 p-3">
                <div className="mb-2 flex items-center gap-2 text-[12px]">
                  <ServerBadge serverId={c.serverId} />
                  <span className="font-mono">{c.kstDay}</span>
                  {isTodayKst(c.kstDay) ? (
                    <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
                      오늘 — 자정 공개 예정
                    </span>
                  ) : (
                    <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">공개됨</span>
                  )}
                </div>
                <ChronicleEditor
                  serverId={c.serverId}
                  kstDay={c.kstDay}
                  headline={c.headline}
                  todayText={c.todayText}
                  replay={replays.get(`${c.serverId}:${c.kstDay}`) ?? null}
                  zones={zoneRows.filter((z) => z.serverId === c.serverId)}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── 대난투 우승 트로피 ── */}
      <section>
        <h2 className="text-sm font-bold text-zinc-400">
          대난투 우승 트로피 <span className="font-normal">— 9시대 생성 → 10:00 공개(재생성은 KST 9~12시 창)</span>
        </h2>
        {battles.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">최근 배틀이 없습니다.</p>
        ) : (
          <div className="mt-2 space-y-3">
            {battles.map((b) => (
              <div key={b.id} className="flex items-center gap-3 rounded-xl border border-zinc-800 p-3">
                {/* 트로피 아바타 미리보기 — 클릭 시 확대(픽셀 디테일 검수, profile-gen 뷰어 재사용) */}
                <div className="w-[120px] shrink-0">
                  {b.trophy_avatar ? (
                    <AdminAvatarViewer rotations={{ south: b.trophy_avatar }} />
                  ) : (
                    <div className="flex aspect-square w-full items-center justify-center rounded-lg bg-zinc-900 text-[10px] text-zinc-500">
                      {b.trophy_status === 'generating' ? '생성 중…' : b.trophy_status === 'failed' ? '실패' : '대기'}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1 text-[13px]">
                  <div className="flex items-center gap-2">
                    <ServerBadge serverId={b.server_id} />
                    <span className="font-mono text-[11px] text-zinc-400">{b.battle_date}</span>
                    <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
                      배틀 {b.status} · 트로피 {b.trophy_status ?? '미시작'} (시도 {b.trophy_attempts})
                    </span>
                  </div>
                  <div className="mt-1">
                    우승 <span className="font-bold">{b.champion ?? '(닉네임 미상)'}</span>
                  </div>
                  <div className="mt-1.5">
                    <TrophyRegenButton battleId={b.id} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
