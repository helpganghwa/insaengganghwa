import { NextResponse } from 'next/server';

import { sendChatCore } from '@/lib/game/chat/send';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 채팅 전송(2026-08-06) — 서버 액션에서 라우트로 이전. 액션은 응답에 현재 라우트(layout 포함)
 * 재렌더를 동봉해 전송마다 loadLayoutData+칭호 재검증이 붙었다(전수조사 지적 — 채팅은 최고
 * 빈도 쓰기). 채팅 화면 갱신은 낙관 UI+브로드캐스트가 담당하므로 revalidate가 필요 없다.
 * 검증·레이트리밋(Upstash chatSend/chatBurst)·필터는 전부 sendChatCore 안.
 */
export async function POST(req: Request) {
  let raw = '';
  let channel: 'all' | 'guild' = 'all';
  try {
    const b = (await req.json()) as { body?: unknown; channel?: unknown };
    raw = typeof b.body === 'string' ? b.body : '';
    channel = b.channel === 'guild' ? 'guild' : 'all';
  } catch {
    return NextResponse.json({ status: 'error', message: '잘못된 요청입니다.' }, { status: 400 });
  }
  return NextResponse.json(await sendChatCore(raw, channel));
}
