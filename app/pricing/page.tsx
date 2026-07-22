import type { Metadata } from 'next';

import { BackBar } from '@/components/BackNav';
import Link from 'next/link';

import { CASH, DIAMONDS, PREMIUM, FIRST_SPECIAL, type Cash } from '@/lib/game/shop/catalog';
import { bpSegmentPriceKrw, BP_SEGMENT_PRICE_CAP_KRW } from '@/lib/game/balance';

export const metadata: Metadata = {
  title: '상품 안내',
  description: '인생강화 유료 상품(다이아·패키지·성장 프리미엄·성장패스·인생 특가) 및 가격 안내.',
};

const won = (n: number) => `₩${n.toLocaleString('ko-KR')}`;

export default function PricingPage() {
  return (
    <div className="mx-auto min-h-dvh max-w-[390px] px-5 py-6">
      <BackBar title="상품 안내" bleed="-mx-5 -mt-6 mb-4" />
      <header className="mb-4">
        <h1 className="text-lg font-bold">상품 안내</h1>
        <p className="mt-1 text-[12px] leading-relaxed text-zinc-500">
          모든 상품은 모바일 웹 게임 「인생강화」 내에서 사용되는 디지털 콘텐츠(게임 내 재화 ‘다이아’ 등)이며,
          결제 완료 즉시 계정에 지급됩니다. 가격은 부가가치세 포함 금액입니다.
        </p>
      </header>

      {/* 다이아 충전 */}
      <Section title="다이아 충전">
        <Grid>
          {DIAMONDS.map((d) => (
            <Item key={d.id} name={`다이아 ${d.total.toLocaleString()}개`} sub="충전" price={won(d.krw)} />
          ))}
        </Grid>
      </Section>

      {/* 성장 프리미엄 */}
      <Section title="성장 프리미엄">
        <Grid>
          <Item
            name="성장 프리미엄"
            sub={`즉시 다이아 ${PREMIUM.instant.diamond.toLocaleString()}개·보급상자 ${PREMIUM.instant.boxes}개 + 30일간 매일 다이아 ${PREMIUM.daily.diamond}개·상자 ${PREMIUM.daily.boxes}개`}
            price={won(PREMIUM.krw)}
          />
        </Grid>
      </Section>

      {/* 성장패스 — 구간별 독립 결제(만료 없음). 가격은 balance 상수 파생(공시-코드 1:1). */}
      <Section title="성장패스 (강화/초월)">
        <Grid>
          <Item
            name="성장패스 구간 결제"
            sub={`강화 100레벨/초월 10레벨 구간별 독립 결제 · 만료 없음 · 구간이 오를수록 가격 상승(상한 ${won(BP_SEGMENT_PRICE_CAP_KRW)})`}
            price={`${won(bpSegmentPriceKrw('enhance', 0))}~${won(BP_SEGMENT_PRICE_CAP_KRW)}`}
          />
        </Grid>
      </Section>

      {/* 인생 특가 — 서버별 1회 한정 */}
      <Section title="인생 특가 (1회 한정)">
        <Grid>
          <Item
            name="인생 특가"
            sub={`다이아 ${FIRST_SPECIAL.grant.diamond.toLocaleString()}개 + 보급상자 ${FIRST_SPECIAL.grant.boxes}개 · 서버별 1회 구매 가능`}
            price={won(FIRST_SPECIAL.krw)}
          />
        </Grid>
      </Section>

      {/* 패키지 */}
      <PackageSection title="일일 패키지" items={CASH.daily} />
      <PackageSection title="주간 패키지" items={CASH.weekly} />
      <PackageSection title="월간 패키지" items={CASH.monthly} />

      <p className="mt-5 text-[11px] leading-relaxed text-zinc-500">
        · 확률형 요소(강화·보급)의 확률 정보는{' '}
        <Link prefetch={false} href="/probability" className="underline">
          확률 공시
        </Link>
        에서 확인할 수 있습니다. <br />· 청약철회·환불 기준은{' '}
        <Link prefetch={false} href="/legal/refund" className="underline">
          환불·청약철회 안내
        </Link>
        를 참고하세요. <br />· 미성년 회원은 관련 법령상 월 결제 한도 및 법정대리인 동의 절차가 적용될 수 있습니다.
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <h2 className="mb-1.5 text-xs font-semibold text-zinc-500">{title}</h2>
      {children}
    </section>
  );
}

function PackageSection({ title, items }: { title: string; items: Cash[] }) {
  return (
    <Section title={title}>
      <Grid>
        {items.map((c) => (
          <Item
            key={c.id}
            name={c.name}
            sub={`다이아 ${c.diamond.toLocaleString()}개 + 보급상자 ${c.boxes}개`}
            price={won(c.krw)}
          />
        ))}
      </Grid>
    </Section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="space-y-1.5">{children}</div>;
}

function Item({ name, sub, price }: { name: string; sub: string; price: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 px-3 py-2.5 dark:border-zinc-800">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{name}</div>
        <div className="truncate text-[11px] text-zinc-500">{sub}</div>
      </div>
      <div className="shrink-0 text-sm font-bold">{price}</div>
    </div>
  );
}
