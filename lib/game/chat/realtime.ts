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

export async function broadcastChat(
  serverId: number,
  event: 'new' | 'hide' | 'sys',
  payload: unknown,
  guildId?: bigint | null,
): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;
  try {
    await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        messages: [{ topic: chatTopic(serverId, guildId), event, payload, private: false }],
      }),
      // 채팅 전송 응답을 브로드캐스트 지연에 묶지 않음 — 짧은 타임아웃.
      signal: AbortSignal.timeout(2500),
    });
  } catch (e) {
    // best-effort — 폴링 폴백이 커버. 단 실패는 로그로 가시화(무증상 디버깅 불가 방지).
    console.warn('[chat.broadcast] 실패', (e as Error).message);
  }
}
