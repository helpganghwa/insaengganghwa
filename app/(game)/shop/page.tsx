import Link from 'next/link';
import { eq } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { profiles } from '@/lib/db/schema/profiles';
import { formatCompactKR } from '@/lib/ui/format-number';
import {
  AD_DAILY_CAP,
  AD_REWARD_SUPPLY_BOXES,
  SHARE_DAILY_REWARD_DIAMOND,
} from '@/lib/game/balance';

/**
 * 상점 — WIREFRAMES §8. 단일 프리미엄 재화(다이아) 충전 + 무료 획득(광고/공유).
 * 등급 패키지 없음(등급 시스템 미존재). 결제 백엔드(포트원/IAP/본인인증/영수증)는
 * 후속 — 현재 상점 UI + 무료 획득 동선만, 충전 CTA는 비활성('준비 중').
 */
const DIAMOND_PACKAGES = [
  { id: 'starter', diamond: 1200, bonus: 0, krw: 1200, tag: null },
  { id: 'small', diamond: 6500, bonus: 500, krw: 6500, tag: null },
  { id: 'medium', diamond: 14000, bonus: 2000, krw: 13000, tag: '인기' },
  { id: 'large', diamond: 30000, bonus: 6000, krw: 26000, tag: null },
  { id: 'mega', diamond: 78000, bonus: 22000, krw: 65000, tag: '최대 혜택' },
] as const;

export default async function ShopPage() {
  const userId = await getSessionUserId();
  if (!userId) return null;

  const [p] = await db
    .select({ diamond: profiles.diamond, verifiedAt: profiles.identityVerifiedAt })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);
  const diamond = p?.diamond ?? 0n;
  const verified = p?.verifiedAt != null;

  return (
    <div className="space-y-5 px-4 py-4">
      <header className="flex items-baseline gap-2">
        <Link href="/" className="text-sm text-zinc-500">
          ←
        </Link>
        <h1 className="text-lg font-semibold">💎 상점</h1>
        <span className="ml-auto font-mono text-sm tabular-nums text-zinc-600 dark:text-zinc-300">
          보유 💎 {formatCompactKR(diamond)}
        </span>
      </header>

      {/* 무료 획득 — 광고/공유 (실제 동작 동선) */}
      <section className="space-y-2">
        <h2 className="px-1 text-xs font-semibold text-zinc-500">무료로 받기</h2>
        <Link
          href="/gacha"
          className="flex items-center justify-between rounded-xl border border-amber-300 bg-amber-50 px-3 py-3 dark:border-amber-800 dark:bg-amber-950/40"
        >
          <span className="flex flex-col">
            <span className="text-sm font-semibold text-amber-900 dark:text-amber-200">
              📺 광고 보고 보급 상자
            </span>
            <span className="text-[11px] text-amber-700/80 dark:text-amber-300/80">
              1회 = 슬롯 랜덤 보급 상자 {AD_REWARD_SUPPLY_BOXES}개 · 하루 {AD_DAILY_CAP}회
            </span>
          </span>
          <span className="text-amber-500">→</span>
        </Link>
        <Link
          href="/me"
          className="flex items-center justify-between rounded-xl border border-zinc-200 px-3 py-3 dark:border-zinc-800"
        >
          <span className="flex flex-col">
            <span className="text-sm font-semibold">🔗 공유 보상</span>
            <span className="text-[11px] text-zinc-500">
              하루 1회 공유 시 💎 {SHARE_DAILY_REWARD_DIAMOND}
            </span>
          </span>
          <span className="text-zinc-400">→</span>
        </Link>
      </section>

      {/* 다이아 충전 — 결제 백엔드 연동 전(준비 중) */}
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
                    {formatCompactKR(total)}
                    {pkg.bonus > 0 ? (
                      <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                        (+{formatCompactKR(pkg.bonus)} 보너스)
                      </span>
                    ) : null}
                    {pkg.tag ? (
                      <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[9px] font-bold text-amber-950">
                        {pkg.tag}
                      </span>
                    ) : null}
                  </div>
                  <div className="text-[11px] text-zinc-500 tabular-nums">
                    ₩{pkg.krw.toLocaleString('ko-KR')}
                  </div>
                </div>
                <button
                  type="button"
                  disabled
                  className="shrink-0 rounded-full bg-zinc-200 px-3 py-1.5 text-xs font-bold text-zinc-500 dark:bg-zinc-800"
                >
                  준비 중
                </button>
              </li>
            );
          })}
        </ul>
        <p className="px-1 text-[11px] leading-relaxed text-zinc-400">
          결제 기능은 정식 오픈 시 제공됩니다. 다이아는 강화 시간 단축(1 다이아 = 1분)·레이드
          개설·추가 공격 등에 사용됩니다. 미사용·환불 정책은 이용약관에 따릅니다.
        </p>
      </section>
    </div>
  );
}
