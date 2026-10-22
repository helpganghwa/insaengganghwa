/**
 * 채팅 검수 우편 초안(경고 · 채팅 금지 안내) — 순수 모듈(서버·클라 공용, server-only 금지).
 *
 * 어드민이 초안을 고쳐 보내는 흐름이라 여기선 문구와 검증만 만들고, 저장은 어드민 액션이 한다.
 * 유저에게 가는 글이므로 이모지·줄표 없이, 어느 메시지가 문제였는지 발췌로 알려 준다.
 * 신고자는 절대 넣지 않는다(신고자 노출은 어드민 화면에서만).
 */

export const CHAT_MOD_EXCERPT_MAX = 80;
export const CHAT_MOD_TITLE_MAX = 40;
export const CHAT_MOD_BODY_MAX = 1000;
/** 채팅 금지 기본 기간(일) — 어드민이 숫자로 고친다. */
export const CHAT_MUTE_DEFAULT_DAYS = 3;
/** 사실상 영구(기존 액션 규약 36500일 그대로). */
export const CHAT_MUTE_PERMANENT_DAYS = 36500;
export const CHAT_MUTE_PRESETS: readonly number[] = [1, 3, 7, 30];

/** 본문 발췌 — 공백 정리 + 최대 80자(코드포인트 기준), 넘치면 말줄임. */
export function chatExcerpt(body: string): string {
  const t = body.replace(/\s+/g, ' ').trim();
  const cps = Array.from(t);
  return cps.length > CHAT_MOD_EXCERPT_MAX ? `${cps.slice(0, CHAT_MOD_EXCERPT_MAX).join('')}…` : t;
}

/** KST "10/22 15:01" — 우편 본문용(어드민 표기 fmtKst는 "10. 22. 15:01"이라 유저 글에는 안 맞는다). */
export function fmtKstSlash(d: Date): string {
  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    hourCycle: 'h23',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(d);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('month')}/${get('day')} ${get('hour')}:${get('minute')}`;
}

export interface ModMailDraft {
  title: string;
  body: string;
}

/** 경고 우편 초안 — 제재 없이 어느 메시지가 문제였는지 알리고 다음 단계를 예고. */
export function chatWarnMailDraft(at: Date, body: string): ModMailDraft {
  return {
    title: '운영 경고 · 채팅',
    body: [
      '회원님이 채팅에 남긴 아래 메시지에 대해 운영 경고를 드립니다.',
      `[${fmtKstSlash(at)}] ${chatExcerpt(body)}`,
      '욕설, 비방, 도배, 광고처럼 다른 이용자를 불쾌하게 하는 채팅은 운영정책 위반에 해당합니다. 반복될 경우 채팅 이용 제한이나 계정 정지로 이어질 수 있으니 유의해 주세요.',
    ].join('\n\n'),
  };
}

/** 채팅 금지 안내 초안 — 기간·해제 시각(영구면 생략)·발췌·제한 범위. 사유는 넣지 않는다(감사 로그 전용). */
export function chatMuteMailDraft(opts: { days: number; from: Date; at: Date; body: string }): ModMailDraft {
  const permanent = opts.days >= CHAT_MUTE_PERMANENT_DAYS;
  const until = new Date(opts.from.getTime() + opts.days * 86400_000);
  const head = permanent
    ? '운영정책 위반으로 회원님의 채팅 이용이 제한됩니다.'
    : `운영정책 위반으로 회원님의 채팅 이용이 ${opts.days}일간 제한됩니다. (해제: ${fmtKstSlash(until)})`;
  return {
    title: '채팅 이용 제한 안내',
    body: [
      head,
      `[${fmtKstSlash(opts.at)}] ${chatExcerpt(opts.body)}`,
      '제한 기간에는 전체 채팅, 길드 채팅, 귓속말을 보낼 수 없습니다. 반복될 경우 제한 기간이 늘어나거나 계정 정지로 이어질 수 있습니다.',
    ].join('\n\n'),
  };
}

/** 보내기 전 검증 — 비었거나 너무 길면 이유를 돌려준다(없으면 null). */
export function chatModMailProblem(title: string, body: string): string | null {
  const t = title.trim();
  const b = body.trim();
  if (!t) return '제목을 입력하세요.';
  if (Array.from(t).length > CHAT_MOD_TITLE_MAX) return `제목은 ${CHAT_MOD_TITLE_MAX}자까지입니다.`;
  if (!b) return '본문을 입력하세요.';
  if (Array.from(b).length > CHAT_MOD_BODY_MAX) return `본문은 ${CHAT_MOD_BODY_MAX}자까지입니다.`;
  return null;
}

/** 금지 일수 — 1~36500 정수만. 그 밖은 null. */
export function parseMuteDays(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').trim());
  if (!Number.isInteger(n) || n < 1 || n > CHAT_MUTE_PERMANENT_DAYS) return null;
  return n;
}
