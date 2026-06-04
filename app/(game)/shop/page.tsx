import { eq } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { withTimeout } from '@/lib/db/with-timeout';
import { profiles } from '@/lib/db/schema/profiles';

/**
 * 상점 — WIREFRAMES §8. 단일 프리미엄 재화(다이아) 충전 + 무료 획득(공유).
 * 광고 보상은 v1 미도입(사용자 결정) — 모바일 웹 SSV 인프라 한계.
 * 등급 패키지 없음(등급 시스템 미존재). 결제 백엔드(포트원/IAP/본인인증/영수증)는
 * 후속 — 현재 상점 UI + 무료 획득 동선만, 충전 CTA는 비활성('준비 중').
 */
// 시간 가치 기준 — 다이아 1개 = 1분 강화 단축. 하루(1,440💎) 단가가 소액 ~₩7,200 →
// 대량 ~₩6,120로 완만(소액도 손해 적게). total = diamond(base) + bonus.
// TODO(결제 백엔드): 첫 결제 2배(1회 한정) — 신규 전환 훅. IAP 연동 시 구현.
const DIAMOND_PACKAGES = [
  { id: 'starter', diamond: 300, bonus: 0, krw: 1500, tag: null },
  { id: 'small', diamond: 1100, bonus: 100, krw: 6000, tag: null },
  { id: 'medium', diamond: 2400, bonus: 400, krw: 13000, tag: '인기' },
  { id: 'large', diamond: 5200, bonus: 1200, krw: 28000, tag: null },
  { id: 'mega', diamond: 12000, bonus: 4000, krw: 68000, tag: '최대 혜택' },
] as const;

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

  return (
    <div className="space-y-5 px-4 py-4">
      <header className="flex items-baseline gap-2">
        <span className="ml-auto font-mono text-sm tabular-nums text-zinc-600 dark:text-zinc-300">
          보유 💎 {diamond.toLocaleString('ko-KR')}
        </span>
      </header>

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
                    {total.toLocaleString('ko-KR')}
                    {pkg.bonus > 0 ? (
                      <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                        (+{pkg.bonus.toLocaleString('ko-KR')} 보너스)
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
