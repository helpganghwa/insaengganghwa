import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { MarkdownView } from '@/components/MarkdownView';
import { LEGAL_META, LEGAL_BODY, BUSINESS_INFO, type LegalSlug } from '@/lib/legal/content';

const SLUGS: LegalSlug[] = ['terms', 'privacy', 'refund', 'youth'];

function isSlug(v: string): v is LegalSlug {
  return (SLUGS as string[]).includes(v);
}

export function generateStaticParams() {
  return SLUGS.map((doc) => ({ doc }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ doc: string }>;
}): Promise<Metadata> {
  const { doc } = await params;
  if (!isSlug(doc)) return {};
  return { title: `${LEGAL_META[doc].title} — 인생강화` };
}

export default async function LegalPage({ params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params;
  if (!isSlug(doc)) notFound();
  const meta = LEGAL_META[doc];

  return (
    <div className="mx-auto max-w-[390px] px-4 py-5">
      <header className="mb-3">
        <h1 className="text-lg font-bold">{meta.title}</h1>
        <p className="mt-0.5 text-[11px] text-zinc-500">시행일: {meta.effectiveDate}</p>
        <nav className="mt-2 flex flex-wrap gap-1.5">
          {SLUGS.map((s) => (
            <Link
              key={s}
              href={`/legal/${s}`}
              className={`rounded-full px-2 py-0.5 text-[11px] ${
                s === doc
                  ? 'bg-zinc-900 text-white dark:bg-white dark:text-black'
                  : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'
              }`}
            >
              {LEGAL_META[s].title}
            </Link>
          ))}
        </nav>
      </header>

      <MarkdownView source={LEGAL_BODY[doc]} />

      <BusinessInfo />

      <p className="mt-4 text-[11px] text-zinc-400">
        ※ 본 문서는 출시 준비용 초안이며, 정식 게시 전 변경될 수 있습니다.
      </p>
    </div>
  );
}

function BusinessInfo() {
  const b = BUSINESS_INFO;
  const rows: [string, string][] = [
    ['상호', b.company],
    ['대표자', b.ceo],
    ['사업자등록번호', b.bizRegNo],
    ['통신판매업신고', b.mailOrderNo],
    ['주소', b.address],
    ['고객문의', b.contact],
    ['이메일', b.email],
  ];
  return (
    <section className="mt-6 rounded-lg border border-zinc-200 p-3 text-[11px] text-zinc-500 dark:border-zinc-800">
      <h2 className="mb-1.5 font-semibold text-zinc-600 dark:text-zinc-400">사업자정보</h2>
      <dl className="space-y-0.5">
        {rows.map(([key, val]) => (
          <div key={key} className="flex gap-2">
            <dt className="w-24 shrink-0">{key}</dt>
            <dd>{val}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
