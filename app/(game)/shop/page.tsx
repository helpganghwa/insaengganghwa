import { eq } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { withTimeout } from '@/lib/db/with-timeout';
import { profiles } from '@/lib/db/schema/profiles';

/**
 * 상점 — WIREFRAMES §8. 다이아 충전 + 기간 특가 패키지(일/주/월) + 월간 프리미엄.
 * 광고 보상은 v1 미도입(사용자 결정). 등급 패키지 없음(등급 시스템 미존재).
 * 결제 백엔드(포트원/IAP/본인인증/영수증)는 후속 — 현재 전 패키지 '준비 중'(CTA 비활성).
 *
 * 효율 사다리(₩/💎, 낮을수록 이득): 일반 충전 < 일일 < 주간 < 월간 < 프리미엄.
 * 기간 특가는 그 기간 1회 한정 구매 — 길게 약속할수록 더 큰 이득(commitment 보상).
 * 모든 수치는 시작값(경제·박스 페이스 시뮬 후 조정).
 */
type Period = 'daily' | 'weekly' | 'monthly';
const PERIOD_TITLE: Record<Period, string> = {
  daily: '일일 특가',
  weekly: '주간 특가',
  monthly: '월간 특가',
};
const PERIOD_LABEL: Record<Period, string> = { daily: '매일 1회', weekly: '주 1회', monthly: '월 1회' };
const PERIOD_VALUE: Record<Period, string> = { daily: '이득', weekly: '더 이득', monthly: '최대 이득' };

// 일반 다이아 충전 — 기준선(₩4.25~5.0/💎). total = diamond + bonus.
const DIAMOND_PACKAGES = [
  { id: 'starter', diamond: 300, bonus: 0, krw: 1500, tag: null },
  { id: 'small', diamond: 1100, bonus: 100, krw: 6000, tag: null },
  { id: 'medium', diamond: 2400, bonus: 400, krw: 13000, tag: '인기' },
  { id: 'large', diamond: 5200, bonus: 1200, krw: 28000, tag: null },
  { id: 'mega', diamond: 12000, bonus: 4000, krw: 68000, tag: '최대 혜택' },
] as const;

// 💎로 구매하는 보급상자 패키지 — 인게임 재화 sink(결제 불필요). 기간별 1종, 효율 월>주>일.
type BoxPackage = { period: Period; id: string; diamondCost: number; boxes: number; tag: string | null };
const BOX_PACKAGES: BoxPackage[] = [
  { period: 'daily', id: 'box_daily', diamondCost: 200, boxes: 8, tag: null },
  { period: 'weekly', id: 'box_weekly', diamondCost: 1200, boxes: 60, tag: null },
  { period: 'monthly', id: 'box_monthly', diamondCost: 4000, boxes: 240, tag: '최고 효율' },
];

// 현금(포트원) 특가 — 기간별 3티어(소·중·대), 💎+📦 즉시 지급. 효율: 일 ~₩4.1 / 주 ~₩3.6 / 월 ~₩3.1.
type CashPackage = {
  period: Period;
  id: string;
  tier: string;
  krw: number;
  diamond: number;
  boxes: number;
  tag: string | null;
};
const CASH_PACKAGES: CashPackage[] = [
  { period: 'daily', id: 'cash_daily_s', tier: '소', krw: 1200, diamond: 290, boxes: 3, tag: null },
  { period: 'daily', id: 'cash_daily_m', tier: '중', krw: 2500, diamond: 610, boxes: 7, tag: null },
  { period: 'daily', id: 'cash_daily_l', tier: '대', krw: 4900, diamond: 1200, boxes: 15, tag: null },
  { period: 'weekly', id: 'cash_weekly_s', tier: '소', krw: 4900, diamond: 1360, boxes: 18, tag: null },
  { period: 'weekly', id: 'cash_weekly_m', tier: '중', krw: 9900, diamond: 2750, boxes: 40, tag: '인기' },
  { period: 'weekly', id: 'cash_weekly_l', tier: '대', krw: 19900, diamond: 5550, boxes: 90, tag: null },
  { period: 'monthly', id: 'cash_monthly_s', tier: '소', krw: 9900, diamond: 3200, boxes: 55, tag: null },
  { period: 'monthly', id: 'cash_monthly_m', tier: '중', krw: 19900, diamond: 6450, boxes: 120, tag: '인기' },
  { period: 'monthly', id: 'cash_monthly_l', tier: '대', krw: 39900, diamond: 12900, boxes: 260, tag: null },
];

// 월간 프리미엄 — 매일 💎+📦 drip(30일). 최고 효율(~₩2.3/💎) + 박스 대량.
const PREMIUM = {
  krw: 29900,
  instant: { diamond: 4000, boxes: 30 },
  daily: { diamond: 300, boxes: 3, days: 30 },
};
const PREMIUM_TOTAL = {
  diamond: PREMIUM.instant.diamond + PREMIUM.daily.diamond * PREMIUM.daily.days,
  boxes: PREMIUM.instant.boxes + PREMIUM.daily.boxes * PREMIUM.daily.days,
};

function Chip({ text, tone = 'muted' }: { text: string; tone?: 'muted' | 'amber' | 'emerald' }) {
  const cls =
    tone === 'amber'
      ? 'bg-amber-500 text-amber-950'
      : tone === 'emerald'
        ? 'bg-emerald-500/15 text-emerald-600 ring-1 ring-emerald-500/30 dark:text-emerald-400'
        : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400';
  return <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${cls}`}>{text}</span>;
}

function SoonButton() {
  return (
    <button
      type="button"
      disabled
      className="shrink-0 rounded-full bg-zinc-200/80 px-3 py-1.5 text-[11px] font-bold text-zinc-500 dark:bg-zinc-800"
    >
      준비 중
    </button>
  );
}

/** 공통 패키지 행 — 좌(아이콘)·중(제목/내용)·우(가격+버튼). */
function Row({
  icon,
  title,
  chips,
  detail,
  price,
}: {
  icon: string;
  title: string;
  chips?: React.ReactNode;
  detail: string;
  price?: string;
}) {
  return (
    <li className="flex items-center gap-3 px-3.5 py-3">
      <span className="text-2xl leading-none">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[13px] font-bold">
          {title}
          {chips}
        </div>
        <div className="mt-0.5 text-[11px] tabular-nums text-zinc-500">{detail}</div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {price ? <span className="text-[12px] font-bold tabular-nums">{price}</span> : null}
        <SoonButton />
      </div>
    </li>
  );
}

const won = (n: number) => `₩${n.toLocaleString('ko-KR')}`;

export default async function ShopPage() {
  const userId = await getSessionUserId();
  if (!userId) return null;

  // 콜드 DB 커넥션 hang 시 페이지 무한 대기 방지 — 실패 시 빈 결과로 degrade(2026-05-29).
  const pRows = await withTimeout(
    db
      .select({ diamond: profiles.diamond, verifiedAt: profiles.identityVerifiedAt })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1),
    3500,
    'shop.profile',
  ).catch(() => [] as { diamond: bigint; verifiedAt: Date | null }[]);
  const [p] = pRows;
  const diamond = p?.diamond ?? 0n;
  const verified = p?.verifiedAt != null;

  const periods: Period[] = ['daily', 'weekly', 'monthly'];

  return (
    <div className="space-y-4 px-3 py-3">
      {/* 헤로 배너 — 보물 + 보유 다이아 + 효율 안내 */}
      <div className="relative overflow-hidden rounded-2xl border border-amber-700/40 bg-gradient-to-br from-amber-950/70 via-zinc-900 to-zinc-950 px-4 py-4 shadow-[0_0_30px_rgba(245,158,11,0.12)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/sprites/shop-hero.png?v=1"
          alt=""
          aria-hidden
          className="pointer-events-none absolute -bottom-3 -right-3 h-32 w-32 object-contain opacity-90 drop-shadow-[0_0_12px_rgba(245,158,11,0.4)]"
          style={{ imageRendering: 'pixelated' }}
        />
        <div className="relative max-w-[64%]">
          <h1 className="text-base font-extrabold text-amber-50">상점</h1>
          <p className="mt-1 text-[11px] leading-relaxed text-amber-200/70">
            기간 특가는 일반 충전보다 이득 — 길게 약속할수록 혜택 ↑
          </p>
          <div className="mt-2.5 inline-flex items-center gap-1 rounded-full bg-black/40 px-2.5 py-1 text-[12px] font-bold tabular-nums text-amber-100 ring-1 ring-amber-500/30">
            💎 {diamond.toLocaleString('ko-KR')}
          </div>
        </div>
      </div>

      {/* 기간 특가 — 각 기간: 보급상자(💎 구매) 1종 + 현금 3티어 */}
      {periods.map((period) => {
        const box = BOX_PACKAGES.find((b) => b.period === period)!;
        const cash = CASH_PACKAGES.filter((c) => c.period === period);
        return (
          <section
            key={period}
            className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
          >
            <div className="flex items-center justify-between border-b border-zinc-100 bg-zinc-50 px-3.5 py-2.5 dark:border-zinc-800/70 dark:bg-zinc-900/50">
              <h2 className="text-[13px] font-bold">{PERIOD_TITLE[period]}</h2>
              <Chip text={`일반보다 ${PERIOD_VALUE[period]}`} tone="emerald" />
            </div>
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
              <Row
                icon="📦"
                title="보급상자"
                chips={
                  <>
                    <Chip text={PERIOD_LABEL[period]} />
                    {box.tag ? <Chip text={box.tag} tone="amber" /> : null}
                  </>
                }
                detail={`💎${box.diamondCost.toLocaleString('ko-KR')} → 보급상자 ${box.boxes}개`}
              />
              {cash.map((c) => (
                <Row
                  key={c.id}
                  icon="💎"
                  title={c.tier}
                  chips={
                    <>
                      <Chip text={PERIOD_LABEL[period]} />
                      {c.tag ? <Chip text={c.tag} tone="amber" /> : null}
                    </>
                  }
                  detail={`💎${c.diamond.toLocaleString('ko-KR')} + 보급상자 ${c.boxes}개`}
                  price={won(c.krw)}
                />
              ))}
            </ul>
          </section>
        );
      })}

      {/* 월간 프리미엄 — 매일 💎+📦 수령(drip) */}
      <section className="overflow-hidden rounded-2xl border-2 border-amber-400/70 bg-gradient-to-br from-amber-50/60 to-white shadow-[0_0_24px_rgba(245,158,11,0.15)] dark:border-amber-600/50 dark:from-amber-950/30 dark:to-zinc-950">
        <div className="flex items-center justify-between border-b border-amber-200/60 px-3.5 py-2.5 dark:border-amber-800/40">
          <h2 className="flex items-center gap-1.5 text-[13px] font-extrabold">
            👑 월간 프리미엄
          </h2>
          <Chip text="최고 혜택" tone="amber" />
        </div>
        <div className="px-3.5 py-3">
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="rounded-xl bg-black/[0.03] px-3 py-2 dark:bg-white/[0.04]">
              <div className="text-[10px] font-semibold text-zinc-500">즉시</div>
              <div className="mt-0.5 font-bold tabular-nums">
                💎{PREMIUM.instant.diamond.toLocaleString('ko-KR')} · 📦{PREMIUM.instant.boxes}
              </div>
            </div>
            <div className="rounded-xl bg-black/[0.03] px-3 py-2 dark:bg-white/[0.04]">
              <div className="text-[10px] font-semibold text-zinc-500">매일 ×{PREMIUM.daily.days}일</div>
              <div className="mt-0.5 font-bold tabular-nums">
                💎{PREMIUM.daily.diamond.toLocaleString('ko-KR')} · 📦{PREMIUM.daily.boxes}
              </div>
            </div>
          </div>
          <div className="mt-2.5 flex items-center justify-between">
            <span className="text-[11px] tabular-nums text-zinc-500">
              총 💎{PREMIUM_TOTAL.diamond.toLocaleString('ko-KR')} · 📦{PREMIUM_TOTAL.boxes} ·{' '}
              <span className="font-bold text-zinc-700 dark:text-zinc-200">{won(PREMIUM.krw)}</span>
            </span>
            <SoonButton />
          </div>
        </div>
      </section>

      {/* 다이아 충전 — 기준선 */}
      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="border-b border-zinc-100 bg-zinc-50 px-3.5 py-2.5 dark:border-zinc-800/70 dark:bg-zinc-900/50">
          <h2 className="text-[13px] font-bold">다이아 충전</h2>
        </div>
        {!verified ? (
          <p className="border-b border-zinc-100 px-3.5 py-2 text-[11px] leading-relaxed text-zinc-500 dark:border-zinc-800/60">
            ℹ️ 최초 결제 시 휴대폰 본인인증이 필요합니다(미성년자 보호·전자상거래법).
          </p>
        ) : null}
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
          {DIAMOND_PACKAGES.map((pkg) => {
            const total = pkg.diamond + pkg.bonus;
            return (
              <Row
                key={pkg.id}
                icon="💎"
                title={total.toLocaleString('ko-KR')}
                chips={
                  <>
                    {pkg.bonus > 0 ? <Chip text={`+${pkg.bonus.toLocaleString('ko-KR')}`} tone="emerald" /> : null}
                    {pkg.tag ? <Chip text={pkg.tag} tone="amber" /> : null}
                  </>
                }
                detail={`다이아 ${pkg.diamond.toLocaleString('ko-KR')}${pkg.bonus > 0 ? ` + 보너스 ${pkg.bonus.toLocaleString('ko-KR')}` : ''}`}
                price={won(pkg.krw)}
              />
            );
          })}
        </ul>
      </section>
    </div>
  );
}
