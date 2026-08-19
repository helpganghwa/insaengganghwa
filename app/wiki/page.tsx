import type { Metadata } from 'next';
import Link from 'next/link';

import { docsInCat, WIKI_CATS } from './registry';
import { WikiShell } from './Shell';
import { PAPER, SERIF } from './theme';

export const metadata: Metadata = {
  alternates: { canonical: '/wiki' },
};

export default function WikiIndexPage() {
  return (
    <WikiShell>
      <h1 style={SERIF} className="text-[25px] font-bold">
        인생강화 위키
      </h1>
      <p className={`mt-2 text-[13.5px] leading-relaxed ${PAPER.muted}`}>
        게임 규칙 정본. 강화부터 길드까지 한곳에 모았다.
      </p>

      <div className="mt-8 space-y-8">
        {WIKI_CATS.map((cat) => {
          const docs = docsInCat(cat);
          if (docs.length === 0) return null;
          return (
            <section key={cat}>
              <h2 style={SERIF} className={`border-b pb-1.5 text-[17px] font-bold ${PAPER.border}`}>
                {cat}
              </h2>
              <ul className="mt-3 grid gap-2 md:grid-cols-2">
                {docs.map((d) => (
                  <li key={d.slug}>
                    <Link
                      prefetch={false}
                      href={`/wiki/${d.slug}`}
                      className={`block h-full rounded-md border px-3.5 py-3 ${PAPER.card} ${PAPER.hover}`}
                    >
                      <span className="text-[14px] font-semibold">{d.title}</span>
                      <span className={`mt-1 block text-[12.5px] leading-relaxed ${PAPER.muted}`}>
                        {d.summary}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </WikiShell>
  );
}
