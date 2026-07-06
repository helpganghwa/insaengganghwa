import { and, eq, gte, inArray, isNull, lt, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { profiles } from '@/lib/db/schema/profiles';
import { characters, servers } from '@/lib/db/schema/server';
import { iapOrders, iapRefunds, paymentAlerts } from '@/lib/db/schema/payment';
import { enhancementJobs } from '@/lib/db/schema/enhance';
import { raids } from '@/lib/db/schema/raid';
import { meleeBattles, meleeParticipants } from '@/lib/db/schema/melee';
import { conquestBattles, guildBattleDeployments } from '@/lib/db/schema/guild';
import { profileGenerationJobs } from '@/lib/db/schema/avatar';
import { pushPending } from '@/lib/db/schema/push';
import { clientErrors } from '@/lib/db/schema/ops';
import { kstStartOfDay, kstDateString } from '@/lib/kst';

/**
 * 운영 대시보드 v1 — "게임이 지금 건강한가"를 30초 안에 판단하는 화면.
 *  ① 핵심 숫자(가입·DAU·매출·활동) ② 헬스 인바리언트("0이어야 정상" 목록 — 크론 사망·
 *  정산 침묵 장애가 별도 heartbeat 없이 여기서 드러난다).
 *
 * 부하: 전부 count/sum 단문 + Promise.all 병렬. 어드민 1인·수동 새로고침 전제라 캐시 없음
 * (자동 새로고침/홈 위젯화 시 60s 캐시 도입 — 풀러 포화 이력 주의).
 */
export const dynamic = 'force-dynamic';

const n = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0;
const won = (v: number | bigint | string) => `₩${Number(v).toLocaleString('ko-KR')}`;

async function loadDashboard() {
  const dayStart = kstStartOfDay();
  const today = kstDateString();
  // KST 이달 1일 00:00의 UTC 인스턴트 — ⚠ kstMonthString()은 'YYYYMM'(하이픈 없음, 월한도
  // 키용)이라 Date 문자열 조립에 쓰면 Invalid Date가 된다(2026-07-06 prod 장애).
  const k = new Date(Date.now() + 9 * 3600_000);
  const monthStart = new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), 1) - 9 * 3600_000);

  const [
    signupsToday,
    dau,
    charsByServer,
    accountsTotal,
    salesToday,
    salesMonth,
    refundsMonth,
    runningJobs,
    raidsToday,
    meleeToday,
    deploysToday,
    // ── 인바리언트 ──
    meleeStuck,
    conquestUnpublished,
    pendingOrders,
    openAlerts,
    pushBacklog,
    clientErr24h,
    genStuck,
  ] = await Promise.all([
    n(db.select({ n: sql<number>`count(*)::int` }).from(profiles).where(gte(profiles.createdAt, dayStart))),
    n(
      db
        .select({ n: sql<number>`count(distinct ${characters.userId})::int` })
        .from(characters)
        .where(gte(characters.lastSeenAt, dayStart)),
    ),
    db
      .select({ serverId: characters.serverId, name: servers.name, c: sql<number>`count(*)::int` })
      .from(characters)
      .innerJoin(servers, eq(servers.id, characters.serverId))
      .groupBy(characters.serverId, servers.name)
      .orderBy(characters.serverId),
    n(db.select({ n: sql<number>`count(*)::int` }).from(profiles)),
    db
      .select({ sum: sql<string>`coalesce(sum(${iapOrders.amountKrw}), 0)::text`, c: sql<number>`count(*)::int` })
      .from(iapOrders)
      .where(and(eq(iapOrders.status, 'paid'), gte(iapOrders.paidAt, dayStart)))
      .then((r) => r[0] ?? { sum: '0', c: 0 }),
    db
      .select({ sum: sql<string>`coalesce(sum(${iapOrders.amountKrw}), 0)::text`, c: sql<number>`count(*)::int` })
      .from(iapOrders)
      .where(and(inArray(iapOrders.status, ['paid', 'refunded']), gte(iapOrders.paidAt, monthStart)))
      .then((r) => r[0] ?? { sum: '0', c: 0 }),
    n(db.select({ n: sql<number>`count(*)::int` }).from(iapRefunds).where(gte(iapRefunds.createdAt, monthStart))),
    n(db.select({ n: sql<number>`count(*)::int` }).from(enhancementJobs).where(eq(enhancementJobs.status, 'running'))),
    n(db.select({ n: sql<number>`count(*)::int` }).from(raids).where(gte(raids.openedAt, dayStart))),
    n(
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(meleeParticipants)
        .innerJoin(meleeBattles, eq(meleeBattles.id, meleeParticipants.battleId))
        .where(eq(meleeBattles.battleDate, today)),
    ),
    n(
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(guildBattleDeployments)
        .where(sql`${guildBattleDeployments.battleKstDay} >= ${today}`),
    ),
    // 발표 안 된 대난투 — 어제 이전 'computed' 잔존(오늘 09~10시 사이 1건은 정상이라 과거만).
    n(
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(meleeBattles)
        .where(and(eq(meleeBattles.status, 'computed'), lt(meleeBattles.battleDate, today))),
    ),
    // 공개 안 된 점령전 — 어제 이전 미공개(오늘 23시 정산분은 자정 공개 전이 정상이라 과거만).
    n(
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(conquestBattles)
        .where(and(isNull(conquestBattles.publishedAt), sql`${conquestBattles.battleKstDay} < ${today}`)),
    ),
    n(
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(iapOrders)
        .where(and(eq(iapOrders.status, 'pending'), lt(iapOrders.createdAt, sql`now() - interval '15 minutes'`))),
    ),
    n(db.select({ n: sql<number>`count(*)::int` }).from(paymentAlerts).where(eq(paymentAlerts.resolved, false))),
    // 푸시 적체 — flush 트리거(first_at+30분) 후에도 15분 이상 안 나간 행.
    n(
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(pushPending)
        .where(lt(pushPending.firstAt, sql`now() - interval '45 minutes'`)),
    ),
    db
      .select({ groups: sql<number>`count(*)::int`, hits: sql<number>`coalesce(sum(${clientErrors.count}), 0)::int` })
      .from(clientErrors)
      .where(gte(clientErrors.lastSeen, sql`now() - interval '24 hours'`))
      .then((r) => r[0] ?? { groups: 0, hits: 0 }),
    // 아바타 생성 정체 — 활성 상태로 20분+ 멈춘 잡(프롬프트/폴링 사망 신호).
    n(
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(profileGenerationJobs)
        .where(
          and(
            inArray(profileGenerationJobs.status, ['queued', 'starting', 'downloading', 'ai_reviewing']),
            lt(profileGenerationJobs.createdAt, sql`now() - interval '20 minutes'`),
          ),
        ),
    ),
  ]);

  return {
    signupsToday,
    dau,
    charsByServer,
    accountsTotal,
    salesToday,
    salesMonth,
    refundsMonth,
    runningJobs,
    raidsToday,
    meleeToday,
    deploysToday,
    invariants: [
      { label: '미발표 대난투 (어제 이전 computed)', value: meleeStuck, hint: 'melee-reveal 크론 확인 — 참가자 보상 우편 미발송 상태' },
      { label: '미공개 점령전 (어제 이전)', value: conquestUnpublished, hint: 'conquest-chronicle 크론 확인 — 소유권·우편 미적용 상태' },
      { label: '15분+ pending 주문', value: pendingOrders, hint: 'payment-recon이 자동 치유 — 지속되면 /admin/payments 확인' },
      { label: '미해결 결제 사고 알림', value: openAlerts, hint: '/admin/alerts에서 처리' },
      { label: '푸시 적체 (45분+)', value: pushBacklog, hint: 'push-flush 크론 확인' },
      { label: '아바타 생성 정체 (20분+)', value: genStuck, hint: 'profile-poll 크론·Pixellab 상태 확인' },
      { label: '클라 에러 24h', value: clientErr24h.groups, hint: `발생 ${clientErr24h.hits}회 — /admin/client-errors`, softLimit: 3 },
    ] as { label: string; value: number; hint: string; softLimit?: number }[],
  };
}

export default async function AdminDashboardPage() {
  const d = await loadDashboard();
  const asOf = new Date().toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' });
  const bad = d.invariants.filter((i) => i.value > (i.softLimit ?? 0));

  const Card = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2.5">
      <p className="text-[11px] text-zinc-500">{label}</p>
      <p className="mt-0.5 text-lg font-bold tabular-nums">{value}</p>
      {sub ? <p className="text-[11px] text-zinc-500">{sub}</p> : null}
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-[760px] space-y-5 px-4 py-6 text-zinc-100">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-bold">📊 운영 대시보드</h1>
        <span className="text-[11px] text-zinc-500">KST {asOf} 기준 · 새로고침으로 갱신</span>
      </div>

      {/* 헬스 요약 한 줄 — 정상이면 초록, 아니면 문제 개수 */}
      <div
        className={`rounded-xl border px-3 py-2.5 text-sm font-bold ${
          bad.length === 0
            ? 'border-emerald-800 bg-emerald-950/40 text-emerald-300'
            : 'border-red-800 bg-red-950/40 text-red-300'
        }`}
      >
        {bad.length === 0 ? '✅ 모든 헬스 인바리언트 정상' : `🚨 확인 필요 ${bad.length}건 — 아래 인바리언트 참조`}
      </div>

      <section className="space-y-2">
        <h2 className="text-xs font-bold text-zinc-500">오늘 (KST)</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Card label="신규 가입" value={d.signupsToday.toLocaleString()} />
          <Card label="DAU (접속 유저)" value={d.dau.toLocaleString()} />
          <Card label="오늘 매출" value={won(d.salesToday.sum)} sub={`${d.salesToday.c}건`} />
          <Card label="레이드 개설" value={d.raidsToday.toLocaleString()} />
          <Card label="진행 중 강화" value={d.runningJobs.toLocaleString()} />
          <Card label="대난투 참가" value={d.meleeToday.toLocaleString()} />
          <Card label="점령전 배치" value={d.deploysToday.toLocaleString()} />
          <Card label="이달 매출" value={won(d.salesMonth.sum)} sub={`${d.salesMonth.c}건 · 환불 ${d.refundsMonth}건`} />
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-xs font-bold text-zinc-500">누적</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Card label="총 계정" value={d.accountsTotal.toLocaleString()} />
          {d.charsByServer.map((s) => (
            <Card key={s.serverId} label={`캐릭터 · ${s.name}`} value={s.c.toLocaleString()} />
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-xs font-bold text-zinc-500">헬스 인바리언트 — 0이어야 정상</h2>
        <ul className="divide-y divide-zinc-800 rounded-xl border border-zinc-800 bg-zinc-900/60">
          {d.invariants.map((i) => {
            const ok = i.value <= (i.softLimit ?? 0);
            return (
              <li key={i.label} className="flex items-center gap-3 px-3 py-2.5">
                <span
                  className={`min-w-[2.5rem] rounded-full px-2 py-0.5 text-center text-xs font-bold tabular-nums ${
                    ok ? 'bg-emerald-950/60 text-emerald-400' : 'bg-red-950/60 text-red-300'
                  }`}
                >
                  {i.value}
                </span>
                <div className="min-w-0">
                  <p className="text-sm">{i.label}</p>
                  <p className="truncate text-[11px] text-zinc-500">{i.hint}</p>
                </div>
              </li>
            );
          })}
        </ul>
        <p className="text-[11px] text-zinc-600">
          크론이 죽으면 별도 알림 없이도 위 값이 누적됩니다 — 오픈 초기엔 매일 아침 1회 확인 권장.
        </p>
      </section>
    </div>
  );
}
