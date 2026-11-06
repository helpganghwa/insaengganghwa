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
let clientPromise: Promise<RealtimeClient> | null = null;

/** 접속 정보가 없으면 null(구독 안 함). 청크 로드 실패는 reject — 호출자가 물러섰다가 다시 시도한다. */
function realtimeClient(): Promise<RealtimeClient> | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return (clientPromise ??= import('@supabase/realtime-js')
    .then(({ RealtimeClient }) => {
      const endpoint = new URL('realtime/v1', url.endsWith('/') ? url : `${url}/`);
      endpoint.protocol = endpoint.protocol.replace('http', 'ws');
      return new RealtimeClient(endpoint.href, { params: { apikey: key }, accessToken: async () => key });
    })
    .catch((e: unknown) => {
      // 청크 로드 실패(일시 네트워크) — 캐시를 비워 다음 시도가 다시 받게 한다.
      clientPromise = null;
      throw e;
    }));
}

/** 이벤트 이름 → payload 처리기. */
export type BroadcastHandlers = Record<string, (payload: unknown) => void>;

/** 클라이언트 로드 재시도 간격(ms) — 1초부터 두 배씩, 최대 30초. */
const RETRY_MIN_MS = 1_000;
const RETRY_MAX_MS = 30_000;

/**
 * broadcast 토픽을 구독하고 해제 함수를 돌려준다(effect cleanup에 그대로 반환).
 * 클라이언트 로드가 끝나기 전에 해제되면 구독 자체를 하지 않는다.
 *
 * 로드 실패 복구(2026-11-06 업데이트 18) — 종전 supabase-js는 첫 번들에 들어 있어 실패할 일이 없었다. 지연 로드가 실패하면
 * (일시 네트워크) 물러섰다가(1→2→4…30초, 온라인 복귀 시 즉시) 다시 받아 **그때 구독한다** — 화면을 다시 열지 않아도 채팅
 * 실시간이 돌아온다. 그동안은 채팅 폴링 안전망이 받는다.
 */
export function subscribeBroadcast(topic: string, handlers: BroadcastHandlers): () => void {
  let cancelled = false;
  let channel: RealtimeChannel | null = null;
  let client: RealtimeClient | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let delay = RETRY_MIN_MS;

  const subscribe = (c: RealtimeClient) => {
    client = c;
    let ch = c.channel(topic);
    for (const [event, fn] of Object.entries(handlers)) {
      ch = ch.on('broadcast', { event }, ({ payload }) => fn(payload));
    }
    channel = ch.subscribe();
  };
  const onOnline = () => {
    if (cancelled || client || !retryTimer) return;
    clearTimeout(retryTimer);
    retryTimer = null;
    attempt();
  };
  const attempt = () => {
    const p = realtimeClient();
    if (!p) return; // 접속 정보 없음 — 구독하지 않는다(종전과 같음)
    p.then(
      (c) => {
        if (cancelled) return;
        if (typeof window !== 'undefined') window.removeEventListener('online', onOnline);
        subscribe(c);
      },
      () => {
        if (cancelled) return;
        retryTimer = setTimeout(() => {
          retryTimer = null;
          attempt();
        }, delay);
        delay = Math.min(delay * 2, RETRY_MAX_MS);
      },
    );
  };
  if (typeof window !== 'undefined') window.addEventListener('online', onOnline);
  attempt();

  return () => {
    cancelled = true;
    if (retryTimer) clearTimeout(retryTimer);
    if (typeof window !== 'undefined') window.removeEventListener('online', onOnline);
    if (client && channel) void client.removeChannel(channel);
  };
}
