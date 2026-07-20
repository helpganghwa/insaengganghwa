import 'server-only';

/**
 * Supabase Realtime broadcast 송신(0125) — 서버리스에서 WS 없이 HTTP로 브로드캐스트.
 * 클라이언트는 anon 키로 같은 topic을 WS 구독(ChatDock). 실패는 무해(수신 측 폴링 폴백).
 */
export function chatTopic(serverId: number): string {
  return `chat:s${serverId}`;
}

export async function broadcastChat(
  serverId: number,
  event: 'new' | 'hide',
  payload: unknown,
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
        messages: [{ topic: chatTopic(serverId), event, payload, private: false }],
      }),
      // 채팅 전송 응답을 브로드캐스트 지연에 묶지 않음 — 짧은 타임아웃.
      signal: AbortSignal.timeout(2500),
    });
  } catch {
    // best-effort — 폴링 폴백이 커버.
  }
}
