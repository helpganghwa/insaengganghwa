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

export type ChatBodyCheck =
  | { ok: true; body: string }
  | { ok: false; reason: 'EMPTY' | 'TOO_LONG' | 'URL' | 'BADWORD' };

export const CHAT_MAX_LEN = 100;

/** 검증 + 정제 — 실패 사유 반환(액션이 사용자 메시지로 변환). */
export function checkAndFilterChatBody(raw: string): ChatBodyCheck {
  const body = raw.replace(/\s+/g, ' ').trim();
  if (!body) return { ok: false, reason: 'EMPTY' };
  if (body.length > CHAT_MAX_LEN) return { ok: false, reason: 'TOO_LONG' };
  if (URL_RE.test(body)) return { ok: false, reason: 'URL' };
  if (BADWORDS.some((w) => body.includes(w))) return { ok: false, reason: 'BADWORD' };
  return { ok: true, body };
}
