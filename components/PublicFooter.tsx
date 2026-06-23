import Link from 'next/link';

import { BUSINESS_INFO } from '@/lib/legal/content';
import { DIAMONDS } from '@/lib/game/shop/catalog';

// 공개(로그인 전) 푸터 — PG 심사·전자상거래법 표시 요건: 약관·개인정보·환불·사업자정보·상품 노출.
// 아직 확정 안 된 placeholder('['로 시작) 값은 표시에서 자동 숨김.

const LINKS: [string, string][] = [
  ['/legal/terms', '이용약관'],
  ['/legal/privacy', '개인정보'],
  ['/legal/refund', '환불'],
  ['/legal/youth', '청소년보호'],
  ['/pricing', '상품안내'],
  ['/probability', '확률공시'],
];

const filled = (v: string) => !v.startsWith('[');

export function PublicFooter() {
  const b = BUSINESS_INFO;
  return (
    <footer className="mx-auto w-full max-w-[390px] border-t border-zinc-200 px-5 py-5 text-[11px] leading-relaxed text-zinc-500 dark:border-zinc-800">
      <nav className="mb-3 flex gap-x-3 overflow-x-auto whitespace-nowrap">
        {LINKS.map(([href, label]) => (
          <Link key={href} href={href} className="shrink-0 hover:underline">
            {label}
          </Link>
        ))}
      </nav>
      <div className="mb-3">
        <p className="mb-1 font-medium text-zinc-500">상품 안내 (게임 내 재화 ‘다이아’ · 부가세 포함)</p>
        <ul className="flex flex-wrap gap-x-3 gap-y-0.5 text-zinc-400">
          {DIAMONDS.map((d) => (
            <li key={d.id}>
              다이아 {d.total.toLocaleString()}개 ₩{d.krw.toLocaleString()}
            </li>
          ))}
        </ul>
        <Link href="/pricing" className="text-zinc-500 hover:underline">
          전체 상품·가격 보기 ›
        </Link>
      </div>

      <div className="space-y-0.5 text-zinc-400">
        <p>
          상호 {b.company} · 대표 {b.ceo}
        </p>
        <p>
          사업자등록번호 {b.bizRegNo}
          {filled(b.mailOrderNo) ? ` · 통신판매업신고 ${b.mailOrderNo}` : ''}
        </p>
        {filled(b.address) ? <p>{b.address}</p> : null}
        {filled(b.contact) || filled(b.email) ? (
          <p>
            문의 {[filled(b.contact) ? b.contact : null, filled(b.email) ? b.email : null]
              .filter(Boolean)
              .join(' · ')}
          </p>
        ) : null}
      </div>
    </footer>
  );
}
