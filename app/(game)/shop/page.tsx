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
  // 일일 (~₩4.1/💎 — 일반 충전보다 이득)
  { period: 'daily', id: 'cash_daily_s', tier: '소', krw: 1200, diamond: 290, boxes: 3, tag: null },
  { period: 'daily', id: 'cash_daily_m', tier: '중', krw: 2500, diamond: 610, boxes: 7, tag: null },
  { period: 'daily', id: 'cash_daily_l', tier: '대', krw: 4900, diamond: 1200, boxes: 15, tag: null },
  // 주간 (~₩3.6/💎)
  { period: 'weekly', id: 'cash_weekly_s', tier: '소', krw: 4900, diamond: 1360, boxes: 18, tag: null },
  { period: 'weekly', id: 'cash_weekly_m', tier: '중', krw: 9900, diamond: 2750, boxes: 40, tag: '인기' },
  { period: 'weekly', id: 'cash_weekly_l', tier: '대', krw: 19900, diamond: 5550, boxes: 90, tag: null },
  // 월간 (~₩3.1/💎)
  { period: 'monthly', id: 'cash_monthly_s', tier: '소', krw: 9900, diamond: 3200, boxes: 55, tag: null },
  { period: 'monthly', id: 'cash_monthly_m', tier: '중', krw: 19900, diamond: 6450, boxes: 120, tag: '인기' },
  { period: 'monthly', id: 'cash_monthly_l', tier: '대', krw: 39900, diamond: 12900, boxes: 260, tag: null },
];

// 월간 프리미엄 — 매일 💎+📦 drip(30일). 최고 효율(~₩2.3/💎) + 박스 대량.
const PREMIUM = {
  id: 'monthly_premium',
  krw: 29900,
  instant: { diamond: 4000, boxes: 30 },
  daily: { diamond: 300, boxes: 3, days: 30 },
};
const PREMIUM_TOTAL = {
  diamond: PREMIUM.instant.diamond + PREMIUM.daily.diamond * PREMIUM.daily.days,
  boxes: PREMIUM.instant.boxes + PREMIUM.daily.boxes * PREMIUM.daily.days,
};

function Tag({ text, amber }: { text: string; amber?: boolean }) {
  return (
    <span
      className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
        amber
          ? 'bg-amber-500 text-amber-950'
          : 'bg-zinc-100 font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
      }`}
    >
      {text}
    </span>
  );
}

function SoonButton() {
  return (
    <button
      type="button"
      disabled
      className="shrink-0 rounded-full bg-zinc-200 px-3 py-1.5 text-xs font-bold text-zinc-500 dark:bg-zinc-800"
    >
      준비 중
    </button>
  );
}

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
    <div className="space-y-5 px-4 py-4">
      <div className="flex items-baseline justify-between px-1">
        <h1 className="text-sm font-bold">상점</h1>
        <span className="font-mono text-[11px] tabular-nums text-zinc-500">
          보유 💎 {diamond.toLocaleString('ko-KR')}
        </span>
      </div>
      <p className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-3 py-2 text-[11px] leading-relaxed text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900">
        기간 특가는 일반 충전보다 이득 — 길게 약속할수록(일&lt;주&lt;월&lt;프리미엄) 더 큰 혜택.
      </p>

      {/* 기간 특가 — 각 기간: 보급상자(💎 구매) 1종 + 현금 3티어 */}
      {periods.map((period) => {
        const box = BOX_PACKAGES.find((b) => b.period === period)!;
        const cash = CASH_PACKAGES.filter((c) => c.period === period);
        return (
          <section key={period} className="space-y-2">
            <h2 className="px-1 text-xs font-semibold text-zinc-500">{PERIOD_TITLE[period]}</h2>
            <ul className="space-y-2">
              {/* 💎로 구매하는 보급상자 */}
              <li className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-3 py-3 dark:border-zinc-800 dark:bg-zinc-950">
                <span className="text-2xl">📦</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-sm font-semibold">
                    보급상자 <Tag text={PERIOD_LABEL[period]} />
                    {box.tag ? <Tag text={box.tag} amber /> : null}
                  </div>
                  <div className="text-[11px] tabular-nums text-zinc-500">
                    💎{box.diamondCost.toLocaleString('ko-KR')} → 보급상자 {box.boxes}개
                  </div>
                </div>
                <SoonButton />
              </li>

              {/* 현금 3티어(💎+📦) */}
              {cash.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-3 py-3 dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <span className="text-2xl">💎</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-sm font-semibold">
                      {c.tier} <Tag text={PERIOD_LABEL[period]} />
                      {c.tag ? <Tag text={c.tag} amber /> : null}
                    </div>
                    <div className="text-[11px] tabular-nums text-zinc-500">
                      💎{c.diamond.toLocaleString('ko-KR')} + 보급상자 {c.boxes}개 · ₩
                      {c.krw.toLocaleString('ko-KR')}
                    </div>
                  </div>
                  <SoonButton />
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {/* 월간 프리미엄 — 매일 💎+📦 수령(drip) */}
      <section className="space-y-2">
        <h2 className="px-1 text-xs font-semibold text-zinc-500">월간 프리미엄</h2>
        <div className="rounded-xl border border-amber-400 bg-amber-50/50 px-3 py-3 dark:border-amber-700/60 dark:bg-amber-950/20">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-bold">월간 프리미엄 성장 펀드</span>
            <Tag text="30일" />
            <Tag text="최고 혜택" amber />
          </div>
          <div className="mt-1.5 space-y-0.5 text-[11px] text-zinc-600 dark:text-zinc-300">
            <div>
              즉시 💎{PREMIUM.instant.diamond.toLocaleString('ko-KR')} · 📦{PREMIUM.instant.boxes}
            </div>
            <div>
              매일 💎{PREMIUM.daily.diamond.toLocaleString('ko-KR')} · 📦{PREMIUM.daily.boxes} ×{' '}
              {PREMIUM.daily.days}일
            </div>
            <div className="text-[10px] text-zinc-400">
              총 💎{PREMIUM_TOTAL.diamond.toLocaleString('ko-KR')} · 📦{PREMIUM_TOTAL.boxes}
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[11px] font-semibold tabular-nums text-zinc-500">
              ₩{PREMIUM.krw.toLocaleString('ko-KR')}
            </span>
            <SoonButton />
          </div>
        </div>
      </section>

      {/* 다이아 충전 — 기준선 */}
      <section className="space-y-2">
        <h2 className="px-1 text-xs font-semibold text-zinc-500">다이아 충전</h2>
        {!verified ? (
          <p className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-3 py-2.5 text-[11px] leading-relaxed text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900">
            ℹ️ 최초 결제 시 휴대폰 본인인증이 필요합니다(미성년자 보호·전자상거래법).
          </p>
        ) : null}
        <ul className="space-y-2">
          {DIAMOND_PACKAGES.map((pkg) => {
            const total = pkg.diamond + pkg.bonus;
            return (
              <li
                key={pkg.id}
                className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-3 py-3 dark:border-zinc-800 dark:bg-zinc-950"
              >
                <span className="text-2xl">💎</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-sm font-semibold tabular-nums">
                    {total.toLocaleString('ko-KR')}
                    {pkg.bonus > 0 ? (
                      <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                        (+{pkg.bonus.toLocaleString('ko-KR')} 보너스)
                      </span>
                    ) : null}
                    {pkg.tag ? <Tag text={pkg.tag} amber /> : null}
                  </div>
                  <div className="text-[11px] tabular-nums text-zinc-500">
                    ₩{pkg.krw.toLocaleString('ko-KR')}
                  </div>
                </div>
                <SoonButton />
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
