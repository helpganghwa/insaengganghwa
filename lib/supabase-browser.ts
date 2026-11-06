'use client';

import type { RealtimeChannel, RealtimeClient } from '@supabase/realtime-js';

/**
 * 브라우저 Realtime 구독(0125) — 용도는 채팅 broadcast 수신뿐(월드·길드·귓속말·미니 토픽).
 * 인증 불필요(공개 broadcast 채널) — anon 키만 쓴다(auth는 서버 쿠키 체계와 별개 유지).
 *
 * 2026-11-06 업데이트 18 — `@supabase/supabase-js` 전체(auth·postgrest·storage·functions, 약 67KB gz)가 게임 페이지마다
 * 첫 로드에 실리던 것을 `@supabase/realtime-js`의 RealtimeClient만 **구독 시점에 지연 로드**하는 것으로 바꿨다.
 * 접속 주소·파라미터는 supabase-js가 만들던 것과 같다: `<url>/realtime/v1`(ws/wss), `params.apikey = anon 키`,
 * 접속 토큰도 anon 키(세션이 없을 때 supabase-js의 `_getAccessToken`이 돌려주던 값). 재연결·하트비트는 RealtimeClient 그대로.
 */
let clientPromise: Promise<RealtimeClient | null> | null = null;

function realtimeClient(): Promise<RealtimeClient | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return Promise.resolve(null);
  return (clientPromise ??= import('@supabase/realtime-js')
    .then(({ RealtimeClient }) => {
      const endpoint = new URL('realtime/v1', url.endsWith('/') ? url : `${url}/`);
      endpoint.protocol = endpoint.protocol.replace('http', 'ws');
      return new RealtimeClient(endpoint.href, { params: { apikey: key }, accessToken: async () => key });
    })
    .catch(() => {
      // 청크 로드 실패(일시 네트워크) — 다음 구독 때 다시 시도한다. 그동안은 폴링 안전망이 받는다.
      clientPromise = null;
      return null;
    }));
}

/** 이벤트 이름 → payload 처리기. */
export type BroadcastHandlers = Record<string, (payload: unknown) => void>;

/**
 * broadcast 토픽을 구독하고 해제 함수를 돌려준다(effect cleanup에 그대로 반환).
 * 클라이언트 로드가 끝나기 전에 해제되면 구독 자체를 하지 않는다.
 */
export function subscribeBroadcast(topic: string, handlers: BroadcastHandlers): () => void {
  let cancelled = false;
  let channel: RealtimeChannel | null = null;
  let client: RealtimeClient | null = null;
  void realtimeClient().then((c) => {
    if (cancelled || !c) return;
    client = c;
    let ch = c.channel(topic);
    for (const [event, fn] of Object.entries(handlers)) {
      ch = ch.on('broadcast', { event }, ({ payload }) => fn(payload));
    }
    channel = ch.subscribe();
  });
  return () => {
    cancelled = true;
    if (client && channel) void client.removeChannel(channel);
  };
}
