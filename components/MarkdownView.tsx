import type { ReactNode } from 'react';

// 신뢰된 내부 문자열(법적 고지 등) 전용 미니 마크다운 렌더러.
// ⚠ 사용자 입력엔 쓰지 말 것(XSS 미고려). 지원: ## / ###, 단락, - 목록, 1. 순서목록,
// | 표 |, > 인용, ---, **굵게**, ![alt](url) 이미지.
//
// 이미지는 **블록 전용**(한 줄 전체가 이미지 문법일 때만) — 문장 중간 인라인 이미지는
// 지원하지 않는다(공지 첨부는 항상 한 줄 삽입이라 인라인 파서를 늘릴 이유가 없다).

/** 우리 Supabase Storage origin — 이미지 허용 출처(빌드 시 인라인, 서버·클라 동일). */
const STORAGE_ORIGIN = (() => {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
})();

const IMAGE_LINE = /^!\[([^\]]*)\]\((\S+)\)$/;

/**
 * 블록 이미지 파싱 — 우리 Storage 절대 URL만 이미지로 렌더한다.
 * 어드민 신뢰 입력이지만 외부 URL을 그대로 실으면 추적 픽셀이 유저 화면에 박히고,
 * 남의 서버가 죽으면 공지에 깨진 이미지가 영구히 남는다. 화이트리스트 밖(외부 도메인·
 * `javascript:` 등)은 이미지로 만들지 않고 원문 텍스트 그대로 흘려보낸다.
 */
function parseImage(line: string): { alt: string; url: string } | null {
  const m = IMAGE_LINE.exec(line);
  if (!m || !STORAGE_ORIGIN) return null;
  try {
    // origin 비교라 `javascript:`·`data:` 스킴은 origin이 'null'이 되어 자동 탈락.
    if (new URL(m[2]!).origin !== STORAGE_ORIGIN) return null;
  } catch {
    return null; // 상대경로·깨진 URL
  }
  return { alt: m[1]!, url: m[2]! };
}

function inline(text: string, key: string): ReactNode {
  return text.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    p.startsWith('**') && p.endsWith('**') ? (
      <strong key={`${key}-${i}`}>{p.slice(2, -2)}</strong>
    ) : (
      <span key={`${key}-${i}`}>{p}</span>
    ),
  );
}

export function MarkdownView({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  let n = 0;
  const k = () => `b${n++}`;

  while (i < lines.length) {
    const t = lines[i]!.trim();

    if (t === '') {
      i++;
      continue;
    }
    if (t === '---') {
      blocks.push(<hr key={k()} className="my-4 border-zinc-200 dark:border-zinc-800" />);
      i++;
      continue;
    }
    const img = parseImage(t);
    if (img) {
      blocks.push(
        // 픽셀아트 프로젝트라 next/image 미사용(CLAUDE §5.2) — Storage 원본을 그대로 띄운다.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={k()}
          src={img.url}
          alt={img.alt}
          loading="lazy"
          className="my-2.5 h-auto max-w-full rounded-lg"
        />,
      );
      i++;
      continue;
    }
    if (t.startsWith('### ')) {
      blocks.push(
        <h3 key={k()} className="mt-4 mb-1 text-[13px] font-bold">
          {inline(t.slice(4), k())}
        </h3>,
      );
      i++;
      continue;
    }
    if (t.startsWith('## ')) {
      blocks.push(
        <h2 key={k()} className="mt-5 mb-1.5 text-sm font-bold">
          {inline(t.slice(3), k())}
        </h2>,
      );
      i++;
      continue;
    }
    if (t.startsWith('# ')) {
      blocks.push(
        <h1 key={k()} className="mb-2 text-base font-bold">
          {inline(t.slice(2), k())}
        </h1>,
      );
      i++;
      continue;
    }
    if (t.startsWith('> ')) {
      const quote: string[] = [];
      while (i < lines.length && lines[i]!.trim().startsWith('> ')) {
        quote.push(lines[i]!.trim().slice(2));
        i++;
      }
      blocks.push(
        <blockquote
          key={k()}
          className="my-2 border-l-2 border-zinc-300 pl-3 text-[11px] text-zinc-500 dark:border-zinc-700"
        >
          {quote.join(' ')}
        </blockquote>,
      );
      continue;
    }
    // 표 (헤더 다음 줄이 |---| 구분선)
    if (t.startsWith('|') && i + 1 < lines.length && /^\|[\s:|-]+\|$/.test(lines[i + 1]!.trim())) {
      const rows: string[] = [];
      while (i < lines.length && lines[i]!.trim().startsWith('|')) {
        rows.push(lines[i]!.trim());
        i++;
      }
      const cells = (r: string) => r.slice(1, -1).split('|').map((c) => c.trim());
      const header = cells(rows[0]!);
      const body = rows.slice(2).map(cells);
      blocks.push(
        <div key={k()} className="my-2 overflow-x-auto">
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr>
                {header.map((h, j) => (
                  <th
                    key={j}
                    className="border border-zinc-200 px-2 py-1 text-left font-semibold dark:border-zinc-800"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((row, ri) => (
                <tr key={ri}>
                  {row.map((c, ci) => (
                    <td
                      key={ci}
                      className="border border-zinc-200 px-2 py-1 align-top dark:border-zinc-800"
                    >
                      {inline(c, `${ri}-${ci}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (/^\d+\.\s/.test(t)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i]!.trim())) {
        items.push(lines[i]!.trim().replace(/^\d+\.\s/, ''));
        i++;
      }
      blocks.push(
        <ol key={k()} className="my-1.5 list-decimal space-y-0.5 pl-5">
          {items.map((it, j) => (
            <li key={j}>{inline(it, `${j}`)}</li>
          ))}
        </ol>,
      );
      continue;
    }
    if (t.startsWith('- ')) {
      const items: string[] = [];
      while (i < lines.length && lines[i]!.trim().startsWith('- ')) {
        items.push(lines[i]!.trim().slice(2));
        i++;
      }
      blocks.push(
        <ul key={k()} className="my-1.5 list-disc space-y-0.5 pl-5">
          {items.map((it, j) => (
            <li key={j}>{inline(it, `${j}`)}</li>
          ))}
        </ul>,
      );
      continue;
    }
    // 단락 — 다음 블록 경계까지 합침
    const para: string[] = [];
    while (i < lines.length) {
      const lt = lines[i]!.trim();
      if (
        lt === '' ||
        lt === '---' ||
        lt.startsWith('#') ||
        lt.startsWith('- ') ||
        lt.startsWith('|') ||
        lt.startsWith('> ') ||
        /^\d+\.\s/.test(lt) ||
        parseImage(lt) // 허용 이미지만 경계 — 화이트리스트 밖 이미지 문법은 단락 텍스트로 남는다
      )
        break;
      para.push(lt);
      i++;
    }
    // ⚠ 진행 보장 — 위 블록 파서가 소비 못 한 '유사 경계' 줄(예: '####' 같은 h4,
    // 구분선 없는 단독 '|')이 단락 첫 줄이면 para가 비어 i가 전진하지 않아 무한 루프가 된다.
    // 그 줄을 일반 텍스트 한 줄로 처리하고 강제 전진(렌더 멈춤 방지).
    if (para.length === 0) {
      para.push(t);
      i++;
    }
    blocks.push(
      <p key={k()} className="my-1.5 leading-relaxed">
        {inline(para.join(' '), k())}
      </p>,
    );
  }

  return <div className="text-[12px] text-zinc-700 dark:text-zinc-300">{blocks}</div>;
}
