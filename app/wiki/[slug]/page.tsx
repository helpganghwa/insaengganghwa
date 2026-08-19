import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { WIKI_DOC_BY_SLUG, WIKI_DOCS, type WikiSection } from '../registry';
import { WikiShell } from '../Shell';
import { TocSpy } from '../TocSpy';
import { PAPER, SERIF } from '../theme';

// 등록된 slug 외에는 존재하지 않는다 — 정적 404(동적 렌더 시도조차 하지 않는다).
export const dynamicParams = false;

export function generateStaticParams() {
  return WIKI_DOCS.map((d) => ({ slug: d.meta.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const doc = WIKI_DOC_BY_SLUG.get(slug);
  if (!doc) return {};
  return {
    title: doc.meta.title,
    description: doc.meta.summary,
    alternates: { canonical: `/wiki/${slug}` },
  };
}

/** 모바일·태블릿용 목차 — 우측 단이 숨는 폭에서 본문 위에 접어 둔다. */
function MobileToc({ sections }: { sections: readonly WikiSection[] }) {
  if (sections.length === 0) return null;
  return (
    <details className={`mt-5 rounded-md border lg:hidden ${PAPER.card}`}>
      <summary className="cursor-pointer list-none px-3 py-2 text-[12.5px] font-semibold">
        이 문서
      </summary>
      <ul className={`space-y-1 border-t px-3 py-2 text-[12.5px] ${PAPER.border}`}>
        {sections.map((s) => (
          <li key={s.id}>
            <a href={`#${s.id}`} className="block py-0.5">
              {s.label}
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}

export default async function WikiDocPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = WIKI_DOC_BY_SLUG.get(slug);
  if (!doc) notFound();
  const { meta, Body } = doc;

  return (
    <WikiShell activeSlug={meta.slug} toc={<TocSpy sections={meta.sections} />}>
      <nav aria-label="탐색 경로" className={`text-[11.5px] ${PAPER.muted}`}>
        <Link href="/wiki" className="hover:underline">
          위키
        </Link>
        <span aria-hidden> › </span>
        <span>{meta.cat}</span>
        <span aria-hidden> › </span>
        <span>{meta.title}</span>
      </nav>

      <h1 style={SERIF} className="mt-1.5 text-[25px] font-bold">
        {meta.title}
      </h1>
      <p className={`mt-1.5 text-[13px] leading-relaxed ${PAPER.muted}`}>{meta.summary}</p>

      <MobileToc sections={meta.sections} />

      <article className="mt-6">
        <Body />
      </article>
    </WikiShell>
  );
}
