// 운영 우편 본문 링크(2026-11-04) — `[설문 참여하기](https://forms.gle/...)` 표기만 링크로 바꾼다.
// 허용 주소 밖(외부 도메인·http·javascript: 등)은 링크로 만들지 않고 원문 그대로 둔다.
// 확인 팝업 없이 새 창으로 연다(허용 목록이 그 역할). 순수 모듈 — 클라 렌더·서버 푸시 발췌가 함께 쓴다.

export type MailBodyPart = { kind: 'text'; text: string } | { kind: 'link'; label: string; href: string };

/** 허용 주소 — host 일치(+경로 접두). 구글 설문(짧은 주소·docs 폼)과 우리 도메인만. */
const ALLOWED: readonly { host: string; path?: string }[] = [
  { host: 'forms.gle' },
  { host: 'docs.google.com', path: '/forms/' },
  { host: 'ganghwa.app' },
];

const LINK = /\[([^\]\n]{1,40})\]\(([^)\s]+)\)/g;

export function isAllowedMailHref(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return false;
  return ALLOWED.some((a) => u.hostname === a.host && (!a.path || u.pathname.startsWith(a.path)));
}

export function parseMailBody(body: string): MailBodyPart[] {
  const parts: MailBodyPart[] = [];
  let last = 0;
  for (const m of body.matchAll(LINK)) {
    const label = m[1]!.trim();
    const href = m[2]!;
    if (!label || !isAllowedMailHref(href)) continue;
    if (m.index > last) parts.push({ kind: 'text', text: body.slice(last, m.index) });
    parts.push({ kind: 'link', label, href });
    last = m.index + m[0].length;
  }
  if (last < body.length) parts.push({ kind: 'text', text: body.slice(last) });
  return parts;
}

/** 링크 표기를 글자만 남긴 평문 — 푸시 발췌처럼 링크를 못 그리는 곳용. */
export function mailBodyPlain(body: string): string {
  return parseMailBody(body)
    .map((p) => (p.kind === 'link' ? p.label : p.text))
    .join('');
}
