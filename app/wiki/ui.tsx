import type { ReactNode } from 'react';
import Link from 'next/link';

import { PAPER, SERIF } from './theme';

/**
 * 위키 본문 조판 블록 — 문서(app/wiki/docs/*.tsx)는 이 컴포넌트만 조합해서 쓴다.
 * 문서마다 클래스를 직접 적으면 14개가 조금씩 다른 얼굴이 되므로, 서식은 전부 여기에 둔다.
 * 전부 서버 컴포넌트(상호작용 없음) — 정적 문서라 클라이언트 번들에 실릴 이유가 없다.
 */

/** 소제목 + 앵커. id는 meta.sections의 id와 반드시 같아야 우측 목차가 이동한다. */
export function H2({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2
      id={id}
      style={SERIF}
      className={`mt-9 scroll-mt-20 border-b pb-1.5 text-[19px] font-bold first:mt-1 ${PAPER.border}`}
    >
      <a href={`#${id}`} className="group inline-flex items-baseline gap-1.5">
        {children}
        <span aria-hidden className={`text-[13px] opacity-0 group-hover:opacity-70 ${PAPER.muted}`}>
          #
        </span>
      </a>
    </h2>
  );
}

export function P({ children }: { children: ReactNode }) {
  return <p className="mt-3 text-[14px] leading-[1.85]">{children}</p>;
}

export function UL({ children }: { children: ReactNode }) {
  return <ul className="mt-3 space-y-1.5 text-[14px] leading-[1.8]">{children}</ul>;
}

export function LI({ children }: { children: ReactNode }) {
  return (
    <li className="relative pl-4 before:absolute before:left-0 before:content-['·']">{children}</li>
  );
}

/** 보조 설명 — 본문 흐름에서 한 발 물러난 회색 상자. */
export function Note({ children }: { children: ReactNode }) {
  return (
    <div className={`mt-4 rounded-md border px-3.5 py-3 text-[13px] leading-[1.8] ${PAPER.card}`}>
      <span className={PAPER.muted}>{children}</span>
    </div>
  );
}

/** 주의 — 손해로 이어지는 규칙(되돌릴 수 없음·차감·제재)에만 쓴다. */
export function Warn({ children }: { children: ReactNode }) {
  return (
    <div className="mt-4 rounded-md border border-[#d9a38a] bg-[#fbeee6] px-3.5 py-3 text-[13px] leading-[1.8] text-[#7c3a18]">
      {children}
    </div>
  );
}

/** 표 — 모바일에서 가로 스크롤. 셀은 ReactNode라 링크·강조를 그대로 넣어도 된다. */
export function Tbl({
  head,
  rows,
}: {
  head: readonly ReactNode[];
  rows: readonly (readonly ReactNode[])[];
}) {
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[380px] border-collapse text-[13px]">
        <thead>
          <tr className={`border-b ${PAPER.border}`}>
            {head.map((h, i) => (
              <th key={i} className="px-2.5 py-2 text-left font-semibold whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className={`border-b ${PAPER.border}`}>
              {row.map((cell, ci) => (
                <td key={ci} className="px-2.5 py-2 align-top leading-[1.7]">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 문서 간 링크 — 위키 안쪽 이동만. slug는 registry에 등록된 값이어야 한다. */
export function DocLink({ slug, children }: { slug: string; children: ReactNode }) {
  return (
    <Link prefetch={false} href={`/wiki/${slug}`} className={`underline ${PAPER.link}`}>
      {children}
    </Link>
  );
}

/**
 * 위키 밖 링크(게임 화면·공시·외부 사이트).
 * next/link를 쓰지 않는 이유: 소프트 내비게이션은 루트 레이아웃을 다시 렌더하지 않아
 * 위키가 덮어쓴 viewport(device-width)가 게임 화면까지 따라간다 — 게임은 고정 390 스케일이다.
 */
export function Ext({ href, children }: { href: string; children: ReactNode }) {
  const external = /^https?:\/\//.test(href);
  return (
    <a
      href={href}
      className={`underline ${PAPER.link}`}
      {...(external ? { target: '_blank', rel: 'noreferrer noopener' } : {})}
    >
      {children}
    </a>
  );
}
