import { pgGuard } from '@/lib/db/guarded';
import { kstStartOfDay, kstDateString } from '@/lib/kst';
import { getStaleCrons } from '@/lib/cron/heartbeat';
import { buildProbabilityPayloadCore, probabilityFingerprint } from '@/lib/game/probability-payload';

/**
 * 운영 대시보드 v1 — "게임이 지금 건강한가"를 30초 안에 판단하는 화면.
 *  ① 핵심 숫자(가입·DAU·매출·활동) ② 헬스 인바리언트("0이어야 정상" 목록 — 크론 사망·
 *  정산 침묵 장애가 별도 heartbeat 없이 여기서 드러난다).
 *
 * 부하: 스칼라 서브쿼리로 묶은 **단일 쿼리 1왕복** + pgGuard(취소형 타임아웃).
 * 병렬 21쿼리 시절엔 접근 한 번이 인스턴스 풀(max 8)을 통째로 점유했고, 풀러에서 멈춘
 * 커넥션이 슬롯을 물면 같은 인스턴스의 게임 페이지 전체가 줄줄이 매달렸다
 * (2026-07-07 prod 장애 — 대시보드 접근 → 전 페이지 300s 타임아웃). 어드민 1인·수동
 * 새로고침 전제라 캐시 없음(자동 새로고침/홈 위젯화 시 60s 캐시 도입).
 */
export const dynamic = 'force-dynamic';

const won = (v: number | bigint | string) => `₩${Number(v).toLocaleString('ko-KR')}`;

/**
 * 확률 공시 스냅샷 최신성(게임산업법 §33 게이트, 감사 F-5) — balance.ts/활성 카탈로그의
 * 현재 공시 전문 지문 ↔ 최신 probability_snapshots 지문 비교. 다르면 "미기록 변경" 1.
 * 스냅샷이 아예 없어도 1(기록 필요). 기록: record-probability-snapshot.ts --confirm.
 */
function snapshotStaleFrom(slotCounts: { slot: string; n: number }[], stored: unknown): number {
  const current = probabilityFingerprint(buildProbabilityPayloadCore(slotCounts));
  if (!stored) return 1;
  // 저장본에서 note(기록 사유, 코어 외 항목) 제거 후 비교 — jsonb 키 순서는 지문이 흡수.
  const { note: _note, ...core } = stored as Record<string, unknown>;
  // supply 배열 순서 정규화(2026-07-13) — 빌더는 이미 slot 정렬로 기록하지만, 정렬 도입 전
  // 레거시·수동 스냅샷은 삽입순(weapon/armor/accessory)이라 지문만 어긋나 오탐(빨간불)이 났다.
  // 슬롯 순 정렬만 맞추므로 확률 '값' 변경은 그대로 감지된다(§33 게이트 유지).
  if (Array.isArray((core as { supply?: unknown }).supply)) {
    (core as { supply: { slot: string }[] }).supply = [
      ...(core as { supply: { slot: string }[] }).supply,
    ].sort((a, b) => a.slot.localeCompare(b.slot));
  }
  return probabilityFingerprint(core) === current ? 0 : 1;
}

type DashRow = {
  signups_today: number;
  dau: number;
  chars_by_server: { serverId: number; name: string; c: number }[];
  accounts_total: number;
  sales_today: { sum: string; c: number };
  sales_month: { sum: string; c: number };
  refunds_month: number;
  running_jobs: number;
  raids_today: number;
  melee_today: number;
  deploys_today: number;
  melee_stuck: number;
  conquest_unpublished: number;
  pending_orders: number;
  open_alerts: number;
  push_backlog: number;
  client_err: { groups: number; hits: number };
  gen_stuck: number;
  slot_counts: { slot: string; n: number }[];
  snapshot_payload: unknown;
};

async function loadDashboard() {
  // ⚠ raw 클라이언트(pgGuard)에 Date 객체 파라미터 금지 — drizzle(driver.js)이 공유 postgres
  // 클라이언트의 timestamp 직렬화기(1184 등)를 identity로 교체해, Date가 미변환으로 소켓에
  // 내려가 TypeError가 난다(2026-07-07 prod digest 3386322421). ISO 문자열 + ::timestamptz.
  const dayStart = kstStartOfDay().toISOString();
  const today = kstDateString();
  // KST 이달 1일 00:00의 UTC 인스턴트 — ⚠ kstMonthString()은 'YYYYMM'(하이픈 없음, 월한도
  // 키용)이라 Date 문자열 조립에 쓰면 Invalid Date가 된다(2026-07-06 prod 장애).
  const k = new Date(Date.now() + 9 * 3600_000);
  const monthStart = new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), 1) - 9 * 3600_000).toISOString();

  // 전 지표를 스칼라 서브쿼리 한 문장으로 — 풀 슬롯 1개·1왕복. 각 서브쿼리는 전부 소형
  // count/sum이라 플래너가 순차 실행해도 수십 ms. 10s 타임아웃 시 쿼리 취소로 슬롯 즉시 회수.
  const rows = await pgGuard<DashRow[]>(
    (sql) => sql<DashRow[]>`
      select
        (select count(*)::int from profiles where created_at >= ${dayStart}::timestamptz) as signups_today,
        (select count(distinct user_id)::int from characters where last_seen_at >= ${dayStart}::timestamptz) as dau,
        (select coalesce(json_agg(t), '[]'::json) from (
           select c.server_id as "serverId", s.name, count(*)::int as c
           from characters c join servers s on s.id = c.server_id
           group by c.server_id, s.name order by c.server_id) t) as chars_by_server,
        (select count(*)::int from profiles) as accounts_total,
        (select json_build_object('sum', coalesce(sum(amount_krw), 0)::text, 'c', count(*)::int)
           from iap_orders where status = 'paid' and paid_at >= ${dayStart}::timestamptz) as sales_today,
        (select json_build_object('sum', coalesce(sum(amount_krw), 0)::text, 'c', count(*)::int)
           from iap_orders where status in ('paid', 'refunded') and paid_at >= ${monthStart}::timestamptz) as sales_month,
        (select count(*)::int from iap_refunds where created_at >= ${monthStart}::timestamptz) as refunds_month,
        (select count(*)::int from enhancement_jobs where status = 'running') as running_jobs,
        (select count(*)::int from raids where opened_at >= ${dayStart}::timestamptz) as raids_today,
        (select count(*)::int from melee_participants mp
           join melee_battles mb on mb.id = mp.battle_id
           where mb.battle_date = ${today}) as melee_today,
        (select count(*)::int from guild_battle_deployments where battle_kst_day >= ${today}) as deploys_today,
        -- 발표 안 된 대난투 — 어제 이전 'computed' 잔존(오늘 09~10시 사이 1건은 정상이라 과거만).
        (select count(*)::int from melee_battles
           where status = 'computed' and battle_date < ${today}) as melee_stuck,
        -- 공개 안 된 점령전 — 어제 이전 미공개(오늘 23시 정산분은 자정 공개 전이 정상이라 과거만).
        (select count(*)::int from conquest_battles
           where published_at is null and battle_kst_day < ${today}) as conquest_unpublished,
        (select count(*)::int from iap_orders
           where status = 'pending' and created_at < now() - interval '15 minutes') as pending_orders,
        (select count(*)::int from payment_alerts where resolved = false) as open_alerts,
        -- 푸시 적체 — flush 트리거(first_at+30분) 후에도 15분 이상 안 나간 행.
        (select count(*)::int from push_pending
           where first_at < now() - interval '45 minutes') as push_backlog,
        (select json_build_object('groups', count(*)::int, 'hits', coalesce(sum("count"), 0)::int)
           from client_errors where last_seen >= now() - interval '24 hours') as client_err,
        -- 아바타 생성 정체 — 활성 상태로 20분+ 멈춘 잡(프롬프트/폴링 사망 신호).
        (select count(*)::int from profile_generation_jobs
           where status in ('queued', 'starting', 'downloading', 'ai_reviewing')
             and created_at < now() - interval '20 minutes') as gen_stuck,
        (select coalesce(json_agg(t), '[]'::json) from (
           select slot, count(*)::int as n from catalog_items where active = true group by slot) t) as slot_counts,
        (select payload from probability_snapshots order by effective_at desc limit 1) as snapshot_payload
    `,
    10_000,
    'admin.dashboard',
  );
  const r = rows[0];
  if (!r) throw new Error('DASHBOARD_EMPTY');

  const {
    signups_today: signupsToday,
    dau,
    chars_by_server: charsByServer,
    accounts_total: accountsTotal,
    sales_today: salesToday,
    sales_month: salesMonth,
    refunds_month: refundsMonth,
    running_jobs: runningJobs,
    raids_today: raidsToday,
    melee_today: meleeToday,
    deploys_today: deploysToday,
    melee_stuck: meleeStuck,
    conquest_unpublished: conquestUnpublished,
    pending_orders: pendingOrders,
    open_alerts: openAlerts,
    push_backlog: pushBacklog,
    client_err: clientErr24h,
    gen_stuck: genStuck,
  } = r;
  const probStale = snapshotStaleFrom(r.slot_counts, r.snapshot_payload);
  // 크론 dead-man — 허용 간격 초과(또는 한 번도 성공 없음). 총체적 정지(CRON_SECRET 사고) 포함.
  const staleCrons = await getStaleCrons(Date.now()).catch(() => []);

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
      { label: '정지 크론 (dead-man)', value: staleCrons.length, hint: staleCrons.length ? `정지: ${staleCrons.map((s) => s.name).join(', ')} — CRON_SECRET·Vercel Cron 확인` : '전 크론 정상 beat' },
      { label: '미발표 대난투 (어제 이전 computed)', value: meleeStuck, hint: 'melee-reveal 크론 확인 — 참가자 보상 우편 미발송 상태' },
      { label: '미공개 점령전 (어제 이전)', value: conquestUnpublished, hint: 'conquest-chronicle 크론 확인 — 소유권·우편 미적용 상태' },
      { label: '15분+ pending 주문', value: pendingOrders, hint: 'payment-recon이 자동 치유 — 지속되면 /admin/payments 확인' },
      { label: '미해결 결제 사고 알림', value: openAlerts, hint: '/admin/alerts에서 처리' },
      { label: '푸시 적체 (45분+)', value: pushBacklog, hint: 'push-flush 크론 확인' },
      { label: '아바타 생성 정체 (20분+)', value: genStuck, hint: 'profile-poll 크론·Pixellab 상태 확인' },
      { label: '클라 에러 24h', value: clientErr24h.groups, hint: `발생 ${clientErr24h.hits}회 — /admin/client-errors`, softLimit: 3 },
      { label: '확률 공시 스냅샷 미기록 변경 (§33)', value: probStale, hint: 'balance/카탈로그 변경분 미기록 — record-probability-snapshot.ts --confirm 실행' },
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
