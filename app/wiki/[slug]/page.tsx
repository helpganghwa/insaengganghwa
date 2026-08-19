import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { WIKI_DOC_BY_SLUG, WIKI_DOCS } from '../registry';
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
    openGraph: {
      title: `${doc.meta.title} — 인생강화 위키`,
      description: doc.meta.summary,
      url: `/wiki/${slug}`,
      type: 'article',
      siteName: '인생강화',
    },
  };
}

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://ganghwa.app';

/**
 * 구조화 데이터(AEO·GEO) — 검색·답변 엔진이 문서를 "게임 규칙 문서"로 인용할 근거.
 * TechArticle + 빵부스러기. 수치는 본문이 상수에서 렌더하므로 여기 넣지 않는다.
 */
function jsonLd(doc: { slug: string; cat: string; title: string; summary: string }): string {
  return JSON.stringify([
    {
      '@context': 'https://schema.org',
      '@type': 'TechArticle',
      headline: `${doc.title} — 인생강화 위키`,
      description: doc.summary,
      inLanguage: 'ko',
      mainEntityOfPage: `${SITE}/wiki/${doc.slug}`,
      publisher: { '@type': 'Organization', name: '인생강화', url: SITE },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: '위키', item: `${SITE}/wiki` },
        { '@type': 'ListItem', position: 2, name: doc.cat },
        { '@type': 'ListItem', position: 3, name: doc.title, item: `${SITE}/wiki/${doc.slug}` },
      ],
    },
  ]).replace(/</g, '\\u003c');
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

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(meta) }}
      />
      <h1 style={SERIF} className="mt-1.5 text-[25px] font-bold">
        {meta.title}
      </h1>
      <p className={`mt-1.5 text-[13px] leading-relaxed ${PAPER.muted}`}>{meta.summary}</p>

      <article className="mt-6">
        <Body />
      </article>
    </WikiShell>
  );
}
