/**
 * 월드 채팅 본문 필터(0125) — 서버 전용 검증.
 *  - URL 전면 차단(피싱·홍보 방지, CBT 정책 — 사용자 확정 2026-07-20)
 *  - 금칙어는 전송 거부(2026-07-22 마스킹 → 거부 전환, 사용자 확정) — 목록은 운영하며 보강
 */

const URL_RE = /(https?:\/\/|www\.|[a-z0-9-]+\.(com|net|org|kr|io|gg|app|me|ly|xyz)(\/|\b))/i;

// 최소 금칙어 — 부분 문자열 매칭(우회 변형은 운영하며 추가). 과차단 방지 위해 보수적으로 시작.
const BADWORDS = [
  '시발', '씨발', 'ㅅㅂ', 'ㅆㅂ', '병신', 'ㅂㅅ', '지랄', '좆', '개새끼', '새끼야',
  '섹스', '자지', '보지', '니애미', '느금마', '창녀',
];

/** 멘션 후보 상한 — 한 메시지가 유발할 수 있는 닉 조회·푸시 팬아웃을 고정. */
const MENTION_CAND_MAX = 5;

/**
 * `@닉` 후보 추출(0128) — 중복 제거 후 최대 5개. 실제 유저 여부는 호출부가 DB로 판정한다.
 * 전체 채팅·귓속말이 **같은 규칙**을 쓰도록 여기 한 곳에만 둔다(0155).
 */
export function extractMentionCandidates(body: string): string[] {
  if (!body.includes('@')) return [];
  return [...new Set([...body.matchAll(/@([^\s@]{1,12})/g)].map((m) => m[1]!))].slice(0, MENTION_CAND_MAX);
}

export type ChatBodyCheck =
  | { ok: true; body: string }
  | { ok: false; reason: 'EMPTY' | 'TOO_LONG' | 'URL' | 'BADWORD' };

export const CHAT_MAX_LEN = 100;

/** 본인 삭제(0177) 자리표시 본문 — 서버 치환·클라 낙관 교체 공용. 순수 모듈(클라 번들 안전). */
export const CHAT_DELETED_BODY = '삭제된 메시지입니다.';

/** 검증 + 정제 — 실패 사유 반환(액션이 사용자 메시지로 변환). */
export function checkAndFilterChatBody(raw: string): ChatBodyCheck {
  const body = raw.replace(/\s+/g, ' ').trim();
  if (!body) return { ok: false, reason: 'EMPTY' };
  if (body.length > CHAT_MAX_LEN) return { ok: false, reason: 'TOO_LONG' };
  if (URL_RE.test(body)) return { ok: false, reason: 'URL' };
  if (BADWORDS.some((w) => body.includes(w))) return { ok: false, reason: 'BADWORD' };
  return { ok: true, body };
}

type ChatBodyReason = Extract<ChatBodyCheck, { ok: false }>['reason'];

/** 탈락 사유 → 유저 문구. 전체 채팅·귓속말이 같은 문구를 쓰도록 한 곳에서만 만든다(0155). */
export function chatBodyErrorMessage(reason: ChatBodyReason): string {
  switch (reason) {
    case 'URL':
      return '링크는 보낼 수 없어요.';
    case 'BADWORD':
      return '부적절한 표현이 포함되어 있어 보낼 수 없어요.';
    case 'TOO_LONG':
      return `${CHAT_MAX_LEN}자까지 보낼 수 있어요.`;
    default:
      return '내용을 입력해 주세요.';
  }
}

/**
 * 채팅 금지(운영 제재) 잔여 기간 표기 — 일/시간/분 중 가장 큰 단위 하나(피드백 2026-07-21).
 * 제재는 채팅·귓속말 공통이라 문구도 공통(0155).
 */
export function formatMuteRemaining(remainingMs: number): string {
  if (remainingMs >= 86_400_000) return `${Math.ceil(remainingMs / 86_400_000)}일`;
  if (remainingMs >= 3_600_000) return `${Math.ceil(remainingMs / 3_600_000)}시간`;
  return `${Math.max(1, Math.ceil(remainingMs / 60_000))}분`;
}
