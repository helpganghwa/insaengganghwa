import type { ReactNode } from 'react';

// 신뢰된 내부 문자열(법적 고지 등) 전용 미니 마크다운 렌더러.
// ⚠ 사용자 입력엔 쓰지 말 것(XSS 미고려). 지원: ## / ###, 단락, - 목록, 1. 순서목록,
// | 표 |, > 인용, ---, **굵게**.

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
        /^\d+\.\s/.test(lt)
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
