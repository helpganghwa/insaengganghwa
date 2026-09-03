import { desc } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { worldChronicle, zones as zonesTable } from '@/lib/db/schema/guild';
import { getConquestReplay, getZoneAdjacency, type ConquestReplay } from '@/lib/game/guild';

import { loadMeleeReviewItems } from '@/lib/game/melee/headline-service';

import { ServerBadge } from '../ServerBadge';
import { ChronicleEditor } from './PreviewClient';
import { MeleeHeadlineEditor } from './MeleeHeadlineEditor';
import { MeleeRerunButton } from './MeleeRerunButton';

/**
 * 공개 전 검수 — 유저 공개 전에 운영자가 미리 보고 손보는 콘텐츠(2026-07-14).
 *  · 점령전 연대기: 23:05 생성 → 자정 공개. 검수 창 23:05~24:00(공개 후 수정도 즉시 반영).
 */
export const dynamic = 'force-dynamic';
// 재생성 액션이 LLM 2회(초안+재검수)를 호출한다 — 기본 예산이면 도중에 끊긴다.
export const maxDuration = 120;

// 항목별 최근 2개만 — 검수 대상은 항상 최신분(2026-07-15), 과거분은 스크롤 노이즈.
async function loadData() {
  const chronicles = await db
    .select()
    .from(worldChronicle)
    .orderBy(desc(worldChronicle.kstDay))
    .limit(2);
  // 애니메이션 미리보기 재료(2026-07-16) — 연대기 날짜별 리플레이 스크립트 + 구역 좌표.
  const replays = new Map<string, ConquestReplay | null>();
  for (const c of chronicles) {
    replays.set(
      `${c.serverId}:${c.kstDay}`,
      await getConquestReplay(c.serverId, c.kstDay).catch(() => null),
    );
  }
  const adjacency = await getZoneAdjacency(1).catch(() => []);
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
  return { chronicles, replays, zoneRows, adjacency };
}

const isTodayKst = (day: string) =>
  day === new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

export default async function AdminPreviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const meleeDate = typeof sp.melee === 'string' ? sp.melee : null;
  // 탭(2026-09-02) — 검수 창이 다르다: 대난투 09:00~10:00, 점령전 23:05~24:00. 기본 탭은 시간대로(20시 이후 점령전).
  const kstHour = (new Date().getUTCHours() + 9) % 24;
  const tab: 'melee' | 'conquest' = sp.tab === 'conquest' || sp.tab === 'melee' ? sp.tab : kstHour >= 20 ? 'conquest' : 'melee';
  const tabCls = (on: boolean) =>
    `rounded-lg px-3 py-1.5 text-sm font-bold ${on ? 'bg-zinc-100 text-zinc-900 dark:bg-zinc-100' : 'border border-zinc-700 text-zinc-300'}`;
  const [{ chronicles, replays, zoneRows, adjacency }, meleeItems] = await Promise.all([
    loadData(),
    // 대난투 헤드라인(0184) — 최근 2배틀 + ?melee=YYYY-MM-DD로 과거 배틀 지정(생성·편집 검수용).
    loadMeleeReviewItems({ limit: 2, extraDate: meleeDate }).catch(() => []),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
      <h1 className="text-xl font-bold">공개 전 검수</h1>
      <nav className="flex items-center gap-2" aria-label="검수 대상">
        <a href="/admin/preview?tab=melee" className={tabCls(tab === 'melee')} aria-current={tab === 'melee' ? 'page' : undefined}>
          대난투 <span className="font-normal opacity-70">09:00~10:00</span>
        </a>
        <a href="/admin/preview?tab=conquest" className={tabCls(tab === 'conquest')} aria-current={tab === 'conquest' ? 'page' : undefined}>
          점령전 <span className="font-normal opacity-70">23:05~24:00</span>
        </a>
      </nav>

      {/* ── 대난투 헤드라인 ── */}
      {tab === 'melee' ? (
      <section>
        <h2 className="text-sm font-bold text-zinc-400">
          대난투 헤드라인 <span className="font-normal">— 09:00 생성 → 10:00 발표(우편)(검수 창 09:00~10:00)</span>
        </h2>
        <form method="get" className="mt-2 flex items-center gap-2 text-[12px]">
          <input type="hidden" name="tab" value="melee" />
          <label htmlFor="melee-date" className="text-zinc-400">다른 날짜 보기</label>
          <input id="melee-date" type="date" name="melee" defaultValue={meleeDate ?? ''} className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1" />
          <button type="submit" className="rounded border border-zinc-700 px-2 py-1 font-bold text-zinc-300">불러오기</button>
        </form>
        {meleeItems.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">산출된 배틀이 없습니다.</p>
        ) : (
          <div className="mt-2 space-y-4">
            {meleeItems.map((m) => (
              <div key={`${m.serverId}:${m.battleDate}`} className="rounded-xl border border-zinc-800 p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2 text-[12px]">
                  <ServerBadge serverId={m.serverId} />
                  <span className="font-mono">{m.battleDate}</span>
                  <span className="text-zinc-500">참가 {m.participantCount.toLocaleString('ko-KR')}명</span>
                  {m.status === 'computed' ? (
                    <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">산출됨 — 10:00 발표 예정</span>
                  ) : (
                    <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">발표됨</span>
                  )}
                  {/* 배틀 재실행 — 발표 전 오늘 배틀만(액션이 날짜·상태를 다시 검증). */}
                  {m.status === 'computed' ? <MeleeRerunButton serverId={m.serverId} battleDate={m.battleDate} /> : null}
                </div>
                {/* 1~10위(2026-09-03) — 헤드라인 문장이 가리키는 사람·수치를 같은 화면에서 대조한다. 배틀 시점 스냅샷. */}
                {m.top10.length > 0 ? (
                  <div className="mb-3 overflow-x-auto rounded-lg border border-zinc-800">
                    <table className="w-full text-[11px] tabular-nums">
                      <thead className="bg-zinc-900/60 text-[10px] text-zinc-500">
                        <tr>
                          <th className="px-2 py-1 text-left font-bold">순위</th>
                          <th className="px-2 py-1 text-left font-bold">닉네임</th>
                          <th className="px-2 py-1 text-left font-bold">길드</th>
                          <th className="px-2 py-1 text-right font-bold">전투력</th>
                          <th className="px-2 py-1 text-right font-bold">공격</th>
                          <th className="px-2 py-1 text-right font-bold">방어</th>
                          <th className="px-2 py-1 text-right font-bold">탈락 R</th>
                        </tr>
                      </thead>
                      <tbody>
                        {m.top10.map((t) => (
                          <tr key={t.rank} className={t.rank <= 3 ? 'bg-amber-500/5 font-semibold' : ''}>
                            <td className="px-2 py-1">{t.rank}</td>
                            <td className="max-w-[9rem] truncate px-2 py-1">{t.nick}</td>
                            <td className="max-w-[7rem] truncate px-2 py-1 text-zinc-400">{t.guildName ?? '-'}</td>
                            <td className="px-2 py-1 text-right">{t.cp.toLocaleString('ko-KR')}</td>
                            <td className="px-2 py-1 text-right">{t.attacks}</td>
                            <td className="px-2 py-1 text-right">{t.defenses}</td>
                            <td className="px-2 py-1 text-right text-zinc-400">{t.eliminatedRound == null ? '생존' : t.eliminatedRound}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
                {/* key에 생성·수정 시각 포함 — 생성/재생성 후 refresh로 내려온 새 값이 편집 중 상태에 덮이지 않게 리마운트. */}
                <MeleeHeadlineEditor
                  key={`${m.serverId}:${m.battleDate}:${m.headlines?.generatedAt ?? ''}:${m.headlines?.editedAt ?? ''}`}
                  serverId={m.serverId}
                  battleDate={m.battleDate}
                  status={m.status}
                  participantCount={m.participantCount}
                  podium={m.podium}
                  headlines={m.headlines}
                />
              </div>
            ))}
          </div>
        )}
      </section>
      ) : null}

      {/* ── 점령전 연대기 ── */}
      {tab === 'conquest' ? (
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
                {/* key에 본문 포함(2026-07-30) — 재생성 후 refresh로 내려온 새 텍스트가
                    편집 중이던 로컬 상태에 덮이지 않고 리마운트로 반영되게. */}
                <ChronicleEditor
                  key={`${c.serverId}:${c.kstDay}:${c.todayText.length}:${c.headline.length}`}
                  serverId={c.serverId}
                  kstDay={c.kstDay}
                  headline={c.headline}
                  todayText={c.todayText}
                  replay={replays.get(`${c.serverId}:${c.kstDay}`) ?? null}
                  zones={zoneRows.filter((z) => z.serverId === c.serverId)}
                  adjacency={adjacency}
                />
                {/* AI 재검수 내역(0119) — 초안에서 바뀐 구절 diff. 사람 검수는 이 목록만 훑으면 됨. */}
                {Array.isArray(c.reviewNotes) && c.reviewNotes.length > 0 ? (
                  <div className="mt-2 rounded-lg bg-zinc-900 px-3 py-2">
                    <p className="text-[10px] font-bold text-zinc-400">
                      🤖 AI 재검수 {(c.reviewNotes as { kind: string }[]).length}건 수정
                    </p>
                    <ul className="mt-1 space-y-1">
                      {(c.reviewNotes as { kind: string; before: string; after: string; reason: string }[]).map(
                        (n, i) => (
                          <li key={i} className="text-[11px] leading-relaxed text-zinc-400">
                            <span
                              className={`mr-1 rounded px-1 py-px text-[9px] font-bold ${
                                n.kind === 'fact'
                                  ? 'bg-red-500/20 text-red-300'
                                  : 'bg-sky-500/20 text-sky-300'
                              }`}
                            >
                              {n.kind === 'fact' ? '사실' : '문체'}
                            </span>
                            <span className="text-zinc-500 line-through">{n.before}</span>
                            {' → '}
                            <span className="text-zinc-200">{n.after}</span>
                            <span className="text-zinc-600"> — {n.reason}</span>
                          </li>
                        ),
                      )}
                    </ul>
                  </div>
                ) : c.reviewNotes != null ? (
                  <p className="mt-2 text-[10px] text-zinc-500">🤖 AI 재검수 — 수정 없음(초안 통과)</p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>
      ) : null}
    </main>
  );
}
