import 'server-only';

import { createHmac } from 'node:crypto';

/**
 * Supabase Realtime broadcast 송신(0125) — 서버리스에서 WS 없이 HTTP로 브로드캐스트.
 * 클라이언트는 anon 키로 같은 topic을 WS 구독(ChatDock). 실패는 무해(수신 측 폴링 폴백).
 */
export function chatTopic(serverId: number, guildId?: bigint | null): string {
  if (!guildId) return `chat:s${serverId}`;
  // 길드 토픽 토큰 — broadcast가 public 채널이라 토픽명을 알면 비길드원도 구독 가능(guildId는
  // 순차라 열거됨). 서버만 계산 가능한 HMAC을 붙여, 소속 검증된 /api/chat/recent 응답으로만
  // 토픽을 전달한다(도청 차단). 키 회전 시 토픽이 바뀌지만 클라는 응답값을 쓰므로 무해.
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'dev';
  const token = createHmac('sha256', secret).update(`chat:${serverId}:${guildId}`).digest('hex').slice(0, 12);
  return `chat:s${serverId}:g${guildId}:${token}`;
}

/**
 * 미니바 준실시간 토픽(2026-08-06 확정) — 닫힘(비접힘) 클라 전용. 월드 채널 한정,
 * 서버가 15초당 최대 1건만 발사(service.ts 스로틀)해 fan-out 비용 상한이 고정된다.
 * ⚠ 클라(ChatDock)가 같은 문자열을 인라인 조립 — 형식 변경 시 양쪽 동기화.
 */
export function chatMiniTopic(serverId: number): string {
  return `chat-mini:s${serverId}`;
}

/**
 * 귓속말 수신 토픽(0155) — 유저 1명당 1토픽. 대화 상대가 늘어도 구독은 하나.
 *
 * ⚠ **서버 발급 전용 · 클라 조립 금지**. broadcast는 public 채널이라 토픽명을 알면 누구나
 * 구독할 수 있고 userId는 프로필 응답 등으로 알려진 값이다. 서버만 계산 가능한 HMAC을 붙이고,
 * 세션 검증을 통과한 /api/chat/whisper/threads 응답으로만 전달한다(1:1 대화 도청 차단).
 * 키 회전 시 토픽이 바뀌지만 클라는 응답값을 쓰므로 무해.
 */
export function whisperTopic(serverId: number, userId: string): string {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'dev';
  const token = createHmac('sha256', secret).update(`whisper:${serverId}:${userId}`).digest('hex').slice(0, 12);
  return `chat:s${serverId}:w:${token}`;
}

/**
 * 귓속말 브로드캐스트 — 수신자·발신자 토픽을 한 HTTP 요청(messages 배열)으로 묶어 왕복 1회.
 * 발신자 토픽에도 보내는 이유: 같은 계정의 다른 기기가 내가 보낸 메시지를 즉시 받게(멀티기기 동기화).
 */
export async function broadcastWhisper(topics: string[], payload: unknown): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || topics.length === 0) return;
  try {
    await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        messages: topics.map((topic) => ({ topic, event: 'new', payload, private: false })),
      }),
      // 전송 응답을 브로드캐스트 지연에 묶지 않음 — 짧은 타임아웃(채팅과 동일).
      signal: AbortSignal.timeout(2500),
    });
  } catch (e) {
    // best-effort — 수신 측 폴링 폴백이 커버. 실패는 로그로 가시화.
    console.warn('[whisper.broadcast] 실패', (e as Error).message);
  }
}

export async function broadcastChat(
  serverId: number,
  event: 'new' | 'hide' | 'sys',
  payload: unknown,
  guildId?: bigint | null,
  opts?: { alsoMini?: boolean },
): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;
  try {
    // 미니 토픽은 같은 요청에 동봉 — 별도 HTTP 왕복 없이(전송 지연 불변) fan-out 대상만 추가.
    const messages = [{ topic: chatTopic(serverId, guildId), event, payload, private: false }];
    if (opts?.alsoMini) messages.push({ topic: chatMiniTopic(serverId), event, payload, private: false });
    await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ messages }),
      // 채팅 전송 응답을 브로드캐스트 지연에 묶지 않음 — 짧은 타임아웃.
      signal: AbortSignal.timeout(2500),
    });
  } catch (e) {
    // best-effort — 폴링 폴백이 커버. 단 실패는 로그로 가시화(무증상 디버깅 불가 방지).
    console.warn('[chat.broadcast] 실패', (e as Error).message);
  }
}
